# -*- coding: utf-8 -*-
"""
Custom exception definitions for the Binance Futures Trading Bot.
"""

class TradingBotError(Exception):
    """Base exception for all trading bot related errors."""
    pass


class ConfigurationError(TradingBotError):
    """Raised when application configuration or environment variables are invalid/missing."""
    pass


class ValidationError(TradingBotError):
    """Raised when command line arguments or request parameters fail validation checks."""
    pass


class BinanceAPIError(TradingBotError):
    """
    Raised when Binance API replies with an explicit error.
    
    Attributes:
        code (int): The error code returned by Binance.
        message (str): The error message returned by Binance.
        http_status (int): The HTTP response status code.
    """
    def __init__(self, message: str, code: int = -1, http_status: int = 400) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.http_status = http_status

    def __str__(self) -> str:
        return f"BinanceAPIError(code={self.code}, http_status={self.http_status}): {self.message}"


class NetworkError(TradingBotError):
    """Raised when there is a connection failure, timeout, or DNS resolution issue."""
    pass


class AuthenticationError(TradingBotError):
    """Raised when credentials (API Key or Signature) fail to be authenticated by Binance."""
    pass
