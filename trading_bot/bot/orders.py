# -*- coding: utf-8 -*-
"""
Order execution services orchestrating validation, dispatch, formatting, and console output.
"""
import sys
import logging
from typing import Any, Dict, Optional, Tuple

from bot.client import BinanceFuturesClient
from bot.validators import validate_order_params
from bot.exceptions import TradingBotError, BinanceAPIError, ValidationError

# Configure logger
logger = logging.getLogger(__name__)


def show_order_request(
    symbol: str,
    side: str,
    order_type: str,
    quantity: float,
    price: Optional[float] = None,
    stop_price: Optional[float] = None
) -> None:
    """
    Prints a clean, highly professional order request block to terminal before execution.
    """
    print("\n================================", flush=True)
    print("ORDER REQUEST", flush=True)
    print("=============\n", flush=True)
    print(f"Symbol: {symbol.upper()}", flush=True)
    print(f"Side: {side.upper()}", flush=True)
    print(f"Type: {order_type.upper()}", flush=True)
    print(f"Quantity: {quantity}", flush=True)
    
    if price is not None:
        print(f"Price: {price}", flush=True)
    if stop_price is not None:
        print(f"Stop Price: {stop_price}", flush=True)
    print("================================")


def show_order_result(status: str, detail: str, response_data: Optional[Dict[str, Any]] = None) -> None:
    """
    Prints a clean order execution summary to terminal after execution.
    """
    print("\n================================", flush=True)
    print("ORDER RESULT", flush=True)
    print("============\n", flush=True)
    
    if status.upper() == "SUCCESS" and response_data:
        order_id = response_data.get("orderId", "N/A")
        txn_status = response_data.get("status", "FILLED")
        exec_qty = response_data.get("executedQty", response_data.get("origQty", "0.0"))
        
        # Determine average price
        avg_price = response_data.get("avgPrice")
        if not avg_price or float(avg_price) == 0:
            avg_price = response_data.get("price", "0.0")
            
        print(f"Order ID: {order_id}", flush=True)
        print(f"Status: {txn_status}", flush=True)
        print(f"Executed Qty: {exec_qty}", flush=True)
        print(f"Average Price: {avg_price}", flush=True)
        print("\nResult: SUCCESS", flush=True)
        
    else:
        print(f"Result: FAILED", flush=True)
        print(f"Reason: {detail}", flush=True)
        
    print("================================\n", flush=True)


def execute_trade(
    api_key: str,
    api_secret: str,
    symbol: str,
    side: str,
    order_type: str,
    quantity: float,
    price: Optional[float] = None,
    stop_price: Optional[float] = None,
    client: Optional[BinanceFuturesClient] = None
) -> Tuple[bool, str, Optional[Dict[str, Any]]]:
    """
    Validates rules, submits order through client, and parses response.
    
    Returns:
        Tuple: (success_bool, status_message, response_dict)
    """
    # 1. Validation phase (prevents network requests for invalid formats)
    try:
        validate_order_params(
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            stop_price=stop_price
        )
    except ValidationError as err:
        msg = f"Validation failed: {err}"
        logger.error(msg)
        return False, msg, None

    # Print clean request visual block
    show_order_request(symbol, side, order_type, quantity, price, stop_price)

    # 2. Setup API Client
    try:
        if client is None:
            client = BinanceFuturesClient(api_key=api_key, api_secret=api_secret)
    except Exception as err:
        msg = f"Client setup failed: {err}"
        logger.error(msg)
        return False, msg, None

    # 3. Request placement
    try:
        response = client.place_futures_order(
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            stop_price=stop_price
        )
        
        # Log successful placement
        order_id = response.get("orderId", "Unknown")
        status = response.get("status", "NEW")
        logger.info(f"Response: orderId={order_id} status={status}")
        
        return True, "Order filled successfully", response

    except BinanceAPIError as api_err:
        detail = f"Binance rejected order: {api_err.message} (Error Code: {api_err.code})"
        return False, detail, None
        
    except TradingBotError as bot_err:
        detail = str(bot_err)
        return False, detail, None
        
    except Exception as err:
        detail = f"Unexpected execution error: {err}"
        logger.exception("An unhandled exception occurred in order placing wrapper.")
        return False, detail, None
