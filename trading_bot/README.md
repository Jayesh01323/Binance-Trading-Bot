# Simplified Binance Futures Trading Bot (USDT-M)

A production-quality Python order execution agent designed to interact with the **Binance Futures Testnet (USDT-M)**. It features strict parameters validation, connection error resilience with Progressive Exponential Backoff, automated server-clock sync, comprehensive structured logs, and custom HMAC-SHA256 request signing.

This program satisfies all quantitative engineer architecture guidelines and is ready to run.

---

## 🚀 Core Features

- **Standard Order Placements**: Supports `MARKET` and `LIMIT` executions.
- **Stop-Loss Protection (Bonus)**: Implements `STOP_LIMIT` orders cleanly mapped to Binance API structures.
- **HMAC Signatures**: Hand-coded authentications using SHA256 cryptographic signatures. No heavy custom SDK bloat.
- **System Synchronization**: Automatically polls `/fapi/v1/time` prior to processing signed transactions to eliminate "timestamp ahead of server time" connection failures.
- **Progressive Retry Logic**: Embedded exponential backoff loops for handling transient internet drops or rate limits.
- **Unified Error System**: Categorized exception structures parsing standard REST problems, schema validation, and authorization errors without trace dump panics.
- **Structured Log Rotator**: Logs fully traceable telemetry payloads to `logs/trading.log`.

---

## 📂 Project Structure

```text
trading_bot/
│
├── bot/
│   ├── __init__.py           # Package version definition
│   ├── client.py             # HTTP session, signatures, timing & request dispatch
│   ├── orders.py             # Order blocks visualization, placement coordination
│   ├── validators.py         # Argument schemas rules and validations
│   ├── exceptions.py         # Unified hierarchy from general down to API status errors
│   ├── logging_config.py     # Rotating multi-sink custom log formatting
│   └── config.py             # Secure environment configurations loader via python-dotenv
│
├── logs/
│   └── trading.log           # Persisted runtime telemetry
│
├── examples/
│   ├── market_order_log.txt  # Exemplary logs of MARKET order lifecycle
│   └── limit_order_log.txt   # Exemplary logs of LIMIT order placing
│
├── .env.example              # Keys and connection thresholds templates
├── cli.py                    # Terminal CLI parser argument handler
├── requirements.txt          # Module requirements manifest
├── README.md                 # Project handbook
└── .gitignore                # Safe ignores layout file
```

---

## ⚙️ Installation

1. Clone or extract this project folder:
   ```bash
   cd trading_bot
   ```

2. Assemble a clean virtual environment and install requirements:
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   pip install -r requirements.txt
   ```

---

## 🔑 Configure API Keys

1. Copy the `.env.example` file to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Open the newly formed `.env` file and input your Binance Futures Testnet credentials:
   ```env
   API_KEY=your_binance_testnet_api_key_here
   API_SECRET=your_binance_testnet_api_secret_here
   BASE_URL=https://testnet.binancefuture.com
   TIMEOUT=10
   MAX_RETRIES=3
   RETRY_BACKOFF_FACTOR=1.5
   ```

---

## 📈 Running Examples

You can execute CLI queries directly through the virtual environment.

### 1) Market Buy Execution
```bash
python cli.py --symbol BTCUSDT --side BUY --type MARKET --quantity 0.001
```

### 2) Limit Sell Execution
```bash
python cli.py --symbol BTCUSDT --side SELL --type LIMIT --quantity 0.001 --price 104500.00
```

### 3) Stop-Limit Order Execution
Places an order triggered when market crosses 99000:
```bash
python cli.py --symbol BTCUSDT --side BUY --type STOP_LIMIT --quantity 0.001 --price 100000 --stop-price 99000
```

---

## 📊 Standard Outputs

### Clean Summary Visual (Before execution):
```text
================================
ORDER REQUEST
=============

Symbol: BTCUSDT
Side: BUY
Type: MARKET
Quantity: 0.001
================================
```

### Execution Outcome Response (Success):
```text
================================
ORDER RESULT
============

Order ID: 781285222
Status: FILLED
Executed Qty: 0.001
Average Price: 104250.50

Result: SUCCESS
================================
```

### Response on Validation or Broker error (Fails safely):
```text
================================
ORDER RESULT
============

Result: FAILED
Reason: Binance rejected order: Margin calculation failed. (Error Code: -2019)
================================
```

---

## 🛠️ Design Assumptions & Technical Notes

1. **Binance Futures Rules Mapping**: On Binance Futures USDT-M, the Stop-Limit order type is officially processed under `type="STOP"`, demanding both `price` and `stopPrice` keys. Our CLI transparently handles the `STOP_LIMIT` parameters mapping into the proper REST body configuration.
2. **Safe Signal Exit**: Uncaught issues or broker mismatches are cleanly isolated by our error catch block under `cli.py` to outputs of result structures instead of showing Python Stack trace crashes, protecting CLI UI.
3. **Automated Clocks Alignment**: Quantitative scripts frequently experience `timestamp ahead of server` delays when regional clocks drift. To defend against failures on startup, our client synchronously queries Binance time and uses the offset with local time dynamically.
