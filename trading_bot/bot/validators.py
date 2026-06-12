# -*- coding: utf-8 -*-
"""
Input validation utilities for trade parameters.
"""
from typing import Optional
from bot.exceptions import ValidationError

VALID_SIDES = {"BUY", "SELL"}
VALID_TYPES = {"MARKET", "LIMIT", "STOP_LIMIT"}

def validate_order_params(
    symbol: str,
    side: str,
    order_type: str,
    quantity: float,
    price: Optional[float] = None,
    stop_price: Optional[float] = None
) -> None:
    """
    Validates general user and API inputs.
    
    Args:
        symbol: e.g. "BTCUSDT"
        side: "BUY" or "SELL"
        order_type: "MARKET", "LIMIT", "STOP_LIMIT"
        quantity: quantity (> 0)
        price: target limit price (> 0, required for LIMIT/STOP_LIMIT)
        stop_price: stop threshold price (> 0, required for STOP_LIMIT)
        
    Raises:
        ValidationError: If any argument is invalid or violates constraints.
    """
    # 1. Symbol checks
    if not symbol or not isinstance(symbol, str):
        raise ValidationError("Validation Error: Symbol must be a non-empty string.")
    
    symbol_clean = symbol.strip().upper()
    if not symbol_clean:
        raise ValidationError("Validation Error: Symbol cannot be empty or simple whitespace.")

    # 2. Side checks
    side_clean = str(side).strip().upper()
    if side_clean not in VALID_SIDES:
        raise ValidationError(
            f"Validation Error: Invalid side '{side}'. "
            f"Allowed values are {list(VALID_SIDES)}"
        )

    # 3. Type checks
    type_clean = str(order_type).strip().upper()
    if type_clean not in VALID_TYPES:
        raise ValidationError(
            f"Validation Error: Invalid order type '{order_type}'. "
            f"Allowed values are {list(VALID_TYPES)}"
        )

    # 4. Quantity checks
    if quantity is None:
        raise ValidationError("Validation Error: Quantity is required.")
    try:
        qty_val = float(quantity)
    except (ValueError, TypeError):
        raise ValidationError("Validation Error: Quantity must be a valid numerical value.")
        
    if qty_val <= 0:
        raise ValidationError(
            f"Validation Error: Quantity must be strictly positive (> 0). Got: {qty_val}"
        )

    # 5. Price checks for LIMIT
    if type_clean == "LIMIT":
        if price is None:
            raise ValidationError("Validation Error: Limit price (price) is required for 'LIMIT' orders.")
        try:
            price_val = float(price)
        except (ValueError, TypeError):
            raise ValidationError("Validation Error: Limit price must be a valid numerical value.")
            
        if price_val <= 0:
            raise ValidationError(
                f"Validation Error: Limit price must be strictly positive (> 0). Got: {price_val}"
            )

    # 6. Checks for STOP_LIMIT has both price and stop_price
    if type_clean == "STOP_LIMIT":
        if price is None:
            raise ValidationError("Validation Error: Limit price (price) is required for 'STOP_LIMIT' orders.")
        if stop_price is None:
            raise ValidationError("Validation Error: Stop price (stop_price) is required for 'STOP_LIMIT' orders.")
        
        try:
            price_val = float(price)
        except (ValueError, TypeError):
            raise ValidationError("Validation Error: Price must be a valid numerical value.")
            
        try:
            stop_val = float(stop_price)
        except (ValueError, TypeError):
            raise ValidationError("Validation Error: Stop-price must be a valid numerical value.")
            
        if price_val <= 0:
            raise ValidationError(
                f"Validation Error: Limit price must be strictly positive (> 0). Got: {price_val}"
            )
        if stop_val <= 0:
            raise ValidationError(
                f"Validation Error: Stop price must be strictly positive (> 0). Got: {stop_val}"
            )
