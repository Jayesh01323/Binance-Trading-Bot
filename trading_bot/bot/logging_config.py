# -*- coding: utf-8 -*-
"""
Logging configuration for the Binance Futures Trading Bot.
Creates the logs folder if it does not exist and sets up file and stream handlers.
"""
import os
import logging
from logging.handlers import RotatingFileHandler

class CustomFormatter(logging.Formatter):
    """Custom formatter to enforce exact required formatting style."""
    
    def format(self, record: logging.LogRecord) -> str:
        # Re-format time to meet 'YYYY-MM-DD HH:MM:SS' exactly
        record.asctime = self.formatTime(record, "%Y-%m-%d %H:%M:%S")
        return f"{record.asctime} | {record.levelname:<5} | {record.getMessage()}"


def setup_logging(log_file_path: str = "logs/trading.log") -> None:
    """
    Initializes global logging config with multi-sink outputs.
    Saves logging outputs to log_file_path and dumps cleanly to stdout.
    """
    # Ensure directory of the log file exists
    log_dir = os.path.dirname(log_file_path)
    if log_dir and not os.path.exists(log_dir):
        os.makedirs(log_dir, exist_ok=True)
        
    logger = logging.getLogger()
    logger.setLevel(logging.INFO)
    
    # Remove existing handlers to avoid duplicate logs in some environments
    if logger.handlers:
        logger.handlers.clear()
        
    formatter = CustomFormatter()
    
    # Simple console stream handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(logging.INFO)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    # Rotating file handler for production security/maintenance
    try:
        file_handler = RotatingFileHandler(
            log_file_path, maxBytes=10*1024*1024, backupCount=5, encoding="utf-8"
        )
        file_handler.setLevel(logging.INFO)
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)
    except Exception as e:
        # Keep executing if file writing fails due to permission boundaries
        logging.warning(f"Failed to create file logger at {log_file_path}: {e}")
