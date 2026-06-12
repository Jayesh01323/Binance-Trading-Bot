# -*- coding: utf-8 -*-
"""
Binance Futures REST API Client Wrapper.
Handles request signing, timestamp synchronization, retries, and parsed error categorization.
"""
import hmac
import hashlib
import time
import logging
from typing import Any, Dict, Optional
import requests
from requests.exceptions import RequestException

from bot.config import Config
from bot.exceptions import (
    BinanceAPIError,
    NetworkError,
    AuthenticationError,
    ConfigurationError
)


class BinanceFuturesClient:
    """
    Production-grade client wrapper for Binance USDT-M Futures Testnet.
    Provides automated request signing, synchronization, error translation and retry logic.
    """

    def __init__(self, api_key: str, api_secret: str, base_url: str = Config.BASE_URL) -> None:
        if not api_key or not api_secret:
            raise ConfigurationError("Client requires valid API_KEY and API_SECRET credentials.")
            
        self.api_key: str = api_key
        self.api_secret: str = api_secret
        self.base_url: str = base_url.rstrip("/")
        
        # Requests Session for connection pooling/performance
        self._session = requests.Session()
        self._session.headers.update({
            "X-MBX-APIKEY": self.api_key,
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "python-binance-futures-bot/1.0"
        })
        self.logger = logging.getLogger(__name__)

    def _sync_server_time(self) -> int:
        """
        Fetches official Binance server time to resolve system clock sync errors.
        
        Returns:
            int: The current Binance server time in milliseconds.
        """
        url = f"{self.base_url}/fapi/v1/time"
        try:
            r = self._session.get(url, timeout=5)
            r.raise_for_status()
            server_time = r.json()["serverTime"]
            return int(server_time)
        except Exception as e:
            self.logger.warning(f"Could not synchronize server time, falling back to local time. Error: {e}")
            return int(time.time() * 1000)

    def _generate_signature(self, query_string: str) -> str:
        """
        Signs the query string payload with HMAC-SHA256.
        """
        return hmac.new(
            self.api_secret.encode("utf-8"),
            query_string.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

    def _request(self, method: str, path: str, params: Dict[str, Any], signed: bool = True) -> Dict[str, Any]:
        """
        Sends absolute requests to Binance with automatic retries and signature calculation.
        """
        url = f"{self.base_url}{path}"
        params_copy = params.copy()

        if signed:
            # Inject synchronized server timestamp
            params_copy["timestamp"] = self._sync_server_time()
            # Convert params dictionary to url-encoded query string sorted for consistency
            sorted_params = sorted(params_copy.items())
            query_string = "&".join(f"{k}={v}" for k, v in sorted_params)
            signature = self._generate_signature(query_string)
            query_string += f"&signature={signature}"
            data = query_string
        else:
            # For unsigned public endpoints
            data = "&".join(f"{k}={v}" for k, v in sorted(params_copy.items()))

        # Determine logging parameters
        log_params_str = " ".join(f"{k}={v}" for k, v in params.items())
        self.logger.info(f"Request: method={method} path={path} {log_params_str}")

        # Attempt call with built-in network retries (Exponential backoff)
        retries = Config.MAX_RETRIES
        backoff = Config.RETRY_BACKOFF_FACTOR
        last_exception: Optional[Exception] = None

        for attempt in range(1, retries + 1):
            try:
                if method.upper() == "POST":
                    response = self._session.post(url, data=data, timeout=Config.TIMEOUT)
                elif method.upper() == "DELETE":
                    response = self._session.delete(url, data=data, timeout=Config.TIMEOUT)
                else:
                    response = self._session.get(url, params=params_copy, timeout=Config.TIMEOUT)

                # Process Response
                return self._parse_response(response)

            except (RequestException, NetworkError) as exc:
                last_exception = exc
                self.logger.warning(
                    f"Network issue during attempt {attempt}/{retries}. Retrying in {backoff}s... Error: {exc}"
                )
                if attempt < retries:
                    time.sleep(backoff)
                    backoff *= 1.5  # Increase delay progressively
                else:
                    break

        # Re-raise network failure as a generic core NetworkError
        self.logger.error(f"Network call failed completely after {retries} attempts.")
        raise NetworkError(f"Connection failed or timed out: {last_exception}")

    def _parse_response(self, r: requests.Response) -> Dict[str, Any]:
        """
        Parses response JSON and logs errors gracefully.
        
        Raises:
            AuthenticationError: if status code is 401.
            BinanceAPIError: if response is an API error.
        """
        status_code = r.status_code
        try:
            data = r.json()
        except ValueError:
            # Handle non-JSON responses (e.g. cloudflare errors)
            self.logger.error(f"Non-JSON API Response received. Status: {status_code}, Body: {r.text[:200]}")
            if status_code == 401 or status_code == 403:
                raise AuthenticationError("Authorization failed. Verify your API_KEY and API_SECRET.")
            raise NetworkError(f"Received invalid API response. HTTP Status {status_code}")

        # Logging parsed response
        self.logger.info(f"Response: Status={status_code} Body={data}")

        if 200 <= status_code < 300:
            return data

        # Parse Explicit Binance API Error Codes
        error_msg = data.get("msg", "Unknown Binance error occurred.")
        error_code = data.get("code", -1)

        # Map common errors based on HTTP status code and Binance codes
        if status_code in (401, 403) or error_code in (-2014, -2015, -1002):
            self.logger.error(f"Authentication/Signature failure from Binance: {error_msg} (Code: {error_code})")
            raise AuthenticationError(f"Binance authentication failed: {error_msg} (Binance Code: {error_code})")
            
        self.logger.error(f"Binance API rejected transaction: {error_msg} (Code: {error_code}, Status: {status_code})")
        raise BinanceAPIError(message=error_msg, code=error_code, http_status=status_code)

    def place_futures_order(
        self,
        symbol: str,
        side: str,
        order_type: str,
        quantity: float,
        price: Optional[float] = None,
        stop_price: Optional[float] = None,
        time_in_force: str = "GTC"
    ) -> Dict[str, Any]:
        """
        Submits an order to the Binance Futures endpoint.
        Maps inputs into compliant Binance API arguments automatically.
        """
        symbol_upper = symbol.strip().upper()
        side_upper = side.strip().upper()
        type_upper = order_type.strip().upper()

        # Build basic parameters
        params: Dict[str, Any] = {
            "symbol": symbol_upper,
            "side": side_upper,
            "quantity": str(quantity),
        }

        # Map types to Binance Futures terminology
        # Note: Stop Limit in Binance Futures API maps to 'STOP' type and uses 'stopPrice' and 'price'
        if type_upper == "MARKET":
            params["type"] = "MARKET"
        elif type_upper == "LIMIT":
            params["type"] = "LIMIT"
            params["price"] = str(price)
            params["timeInForce"] = time_in_force
        elif type_upper == "STOP_LIMIT":
            params["type"] = "STOP"
            params["price"] = str(price)
            params["stopPrice"] = str(stop_price)
            params["timeInForce"] = time_in_force
        else:
            raise ConfigurationError(f"Unsupported order type mapping mapping logic for '{type_upper}'")

        # Send Signed POST request
        return self._request("POST", "/fapi/v1/order", params, signed=True)
