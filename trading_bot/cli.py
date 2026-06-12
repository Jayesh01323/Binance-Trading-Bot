#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Command Line Interface (CLI) for the Simplified Binance Futures Trading Bot.
Provides seamless argument processing, logging bootstrap, and error containment.
"""
import sys
import argparse
from typing import List, Optional

from bot.config import Config
from bot.exceptions import TradingBotError, ConfigurationError
from bot.logging_config import setup_logging
from bot.orders import execute_trade, show_order_result


def parse_arguments(args: Optional[List[str]] = None) -> argparse.Namespace:
    """
    Sets up ArgumentParser rules for futures trading bot CLI commands.
    """
    parser = argparse.ArgumentParser(
        description="Simplified USDT-M Binance Futures Trading Bot for Testnet.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # 1. Market Order
  python cli.py --symbol BTCUSDT --side BUY --type MARKET --quantity 0.001

  # 2. Limit Order
  python cli.py --symbol BTCUSDT --side SELL --type LIMIT --quantity 0.001 --price 100000

  # 3. Stop-Limit Order (Bonus Type)
  python cli.py --symbol BTCUSDT --side BUY --type STOP_LIMIT --quantity 0.001 --price 100000 --stop-price 99000
        """
    )

    parser.add_argument(
        "-s", "--symbol",
        type=str,
        required=True,
        help="Futures pair symbol (e.g. BTCUSDT, ETHUSDT)"
    )
    
    parser.add_argument(
        "-d", "--side",
        type=str,
        required=True,
        choices=["BUY", "SELL", "buy", "sell"],
        help="Direction of the trade (BUY or SELL)"
    )
    
    parser.add_argument(
        "-t", "--type",
        type=str,
        required=True,
        choices=["MARKET", "LIMIT", "STOP_LIMIT", "market", "limit", "stop_limit"],
        help="Order type: MARKET, LIMIT, or STOP_LIMIT"
    )
    
    parser.add_argument(
        "-q", "--quantity",
        type=float,
        required=True,
        help="Order transaction quantity"
    )
    
    parser.add_argument(
        "-p", "--price",
        type=float,
        default=None,
        help="Target price limit (required for LIMIT and STOP_LIMIT orders)"
    )
    
    parser.add_argument(
        "-sp", "--stop-price",
        type=float,
        default=None,
        help="Stop activation price (required for STOP_LIMIT orders)"
    )

    return parser.parse_args(args)


def main() -> int:
    """
    Application main supervisor.
    Bootstraps logging, parses options, acts as final error trap.
    """
    # 1. Initialize logging
    setup_logging()
    
    try:
        # 2. Load and validate API keys (.env configuration validation)
        Config.validate()
    except ConfigurationError as config_err:
        print(f"\n[CONFIGURATION ERROR] {config_err}\n", file=sys.stderr)
        return 1

    # 3. Parse and normalize interactive command flags
    try:
        parsed_args = parse_arguments()
        
        # Normalize variables for standard system treatment
        symbol = parsed_args.symbol.strip().upper()
        side = parsed_args.side.strip().upper()
        order_type = parsed_args.type.strip().upper()
        quantity = parsed_args.quantity
        price = parsed_args.price
        stop_price = parsed_args.stop_price
        
    except SystemExit as se:
        # Gracefully handle validation failure in parser rules
        return se.code
    except Exception as e:
        print(f"\n[CLI ERROR] Failed during parser initialization: {e}\n", file=sys.stderr)
        return 1

    # 4. Trigger Execution Wrapper
    try:
        success, message, response = execute_trade(
            api_key=Config.API_KEY,
            api_secret=Config.API_SECRET,
            symbol=symbol,
            side=side,
            order_type=order_type,
            quantity=quantity,
            price=price,
            stop_price=stop_price
        )
        
        # Display the result to CLI as requested
        if success and response:
            show_order_result("SUCCESS", "Order executed filled", response)
            return 0
        else:
            show_order_result("FAILED", message)
            return 1
            
    except TradingBotError as bot_err:
        show_order_result("FAILED", f"Trading Bot Exception: {bot_err}")
        return 1
    except Exception as general_err:
        show_order_result("FAILED", f"Unhandled System Error: {general_err}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
