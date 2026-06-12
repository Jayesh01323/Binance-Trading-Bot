# -*- coding: utf-8 -*-
"""
Configuration loader for the Binance Futures Trading Bot.
"""
import os
from typing import Optional
from bot.exceptions import ConfigurationError

# Optionally load dotenv if installed (fallback gracefully if not)
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class Config:
    """Holds configuration parameters for the trading bot client and CLI environment."""
    
    API_KEY: str = os.getenv("API_KEY", "")
    API_SECRET: str = os.getenv("API_SECRET", "")
    
    BASE_URL: str = os.getenv("BASE_URL", "https://testnet.binancefuture.com").rstrip("/")
    TIMEOUT: int = int(os.getenv("TIMEOUT", "10"))
    MAX_RETRIES: int = int(os.getenv("MAX_RETRIES", "3"))
    RETRY_BACKOFF_FACTOR: float = float(os.getenv("RETRY_BACKOFF_FACTOR", "1.5"))

    @classmethod
    def validate(cls) -> None:
        """
        Validates that necessary configuration params are loaded.
        
        Raises:
            ConfigurationError: If requirements aren't met.
        """
        if not cls.API_KEY:
            raise ConfigurationError(
                "API_KEY environment variable is not set. "
                "Please configure it in your .env file or environment."
            )
        if not cls.API_SECRET:
            raise ConfigurationError(
                "API_SECRET environment variable is not set. "
                "Please configure it in your .env file or environment."
            )
        if not cls.BASE_URL:
            raise ConfigurationError("BASE_URL cannot be empty.")
