import express from 'express';
import path from 'path';
import fs from 'fs';
import AdmZip from 'adm-zip';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = 3000;
const TRADING_BOT_DIR = path.join(process.cwd(), 'trading_bot');

app.use(express.json());

// State Management
let walletBalance = 10000.0;
let openPositions: any[] = [];
let orderHistory: any[] = [];
let activeOrders: any[] = [];

let prices: Record<string, number> = {
  'BTCUSDT': 104250.0,
  'ETHUSDT': 3450.0,
  'SOLUSDT': 195.0,
};

function writeSimulatedLog(level: string, message: string) {
  const logDir = path.join(TRADING_BOT_DIR, 'logs');
  const logFilePath = path.join(logDir, 'trading.log');
  const dateStr = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const logLine = `${dateStr} | ${level.toUpperCase().padEnd(5)} | ${message}\n`;
  try {
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(logFilePath, logLine, 'utf8');
  } catch (err) {
    console.error('Could not write simulated log file:', err);
  }
}

function fillOrder(order: any, fillPrice: number) {
  order.status = 'FILLED';
  order.timestamp = Date.now();
  orderHistory.unshift(order);

  const qty = order.quantity;
  const isBuy = order.side === 'BUY';
  const totalCost = qty * fillPrice;

  if (isBuy) {
    walletBalance -= totalCost;
  } else {
    walletBalance += totalCost;
  }

  const existingIdx = openPositions.findIndex(p => p.symbol === order.symbol);
  if (existingIdx !== -1) {
    const existingPos = openPositions[existingIdx];
    const isSameSide = (existingPos.side === 'LONG' && isBuy) || (existingPos.side === 'SHORT' && !isBuy);
    if (isSameSide) {
      // Scale position
      const totalQty = existingPos.quantity + qty;
      const weightedPrice = (existingPos.entryPrice * existingPos.quantity + fillPrice * qty) / totalQty;
      existingPos.quantity = totalQty;
      existingPos.entryPrice = parseFloat(weightedPrice.toFixed(2));
      existingPos.margin = parseFloat((totalQty * weightedPrice * 0.05).toFixed(2));
    } else {
      // Reduce position
      const diff = existingPos.quantity - qty;
      if (diff > 0) {
        existingPos.quantity = diff;
        existingPos.margin = parseFloat((diff * existingPos.entryPrice * 0.05).toFixed(2));
      } else if (diff === 0) {
        openPositions.splice(existingIdx, 1);
      } else {
        existingPos.side = existingPos.side === 'LONG' ? 'SHORT' : 'LONG';
        existingPos.quantity = Math.abs(diff);
        existingPos.entryPrice = fillPrice;
        existingPos.margin = parseFloat((Math.abs(diff) * fillPrice * 0.05).toFixed(2));
      }
    }
  } else {
    openPositions.push({
      symbol: order.symbol,
      side: isBuy ? 'LONG' : 'SHORT',
      entryPrice: fillPrice,
      quantity: qty,
      margin: parseFloat((qty * fillPrice * 0.05).toFixed(2)),
    });
  }

  writeSimulatedLog(
    'INFO',
    `Response: orderId=${order.orderId} status=FILLED execQty=${order.quantity} avgPrice=${fillPrice} symbol=${order.symbol}`
  );
}

// Pricing simulation interval
setInterval(() => {
  // Random price movements
  for (const sym of Object.keys(prices)) {
    const changePct = (Math.random() - 0.5) * 0.0005;
    prices[sym] = parseFloat((prices[sym] * (1 + changePct)).toFixed(2));
  }

  // Process active orders
  const updatedOrders: any[] = [];
  for (const order of activeOrders) {
    const currentPrice = prices[order.symbol];
    if (currentPrice === undefined) {
      updatedOrders.push(order);
      continue;
    }

    if (order.status === 'STOP_WAITING') {
      const stopPrice = order.stopPrice || 0;
      const triggered = order.side === 'BUY' ? currentPrice >= stopPrice : currentPrice <= stopPrice;
      if (triggered) {
        order.status = 'NEW';
        writeSimulatedLog(
          'INFO',
          `Stop-Limit order activated: symbol=${order.symbol} side=${order.side} qty=${order.quantity} triggerPrice=${stopPrice} limitPrice=${order.price}`
        );
      }
      updatedOrders.push(order);
    } else if (order.status === 'NEW') {
      const limitPrice = order.price || 0;
      const triggered = order.side === 'BUY' ? currentPrice <= limitPrice : currentPrice >= limitPrice;
      if (triggered) {
        fillOrder(order, currentPrice);
      } else {
        updatedOrders.push(order);
      }
    } else {
      updatedOrders.push(order);
    }
  }
  activeOrders = updatedOrders;
}, 1500);

// Shared Gemini Client Lazily initialized
let ai: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    ai = new GoogleGenAI({
      apiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return ai;
}

// Recursive file list helper
function listFilesRecursive(dirPath: string, baseRelative = ''): any[] {
  const results: any[] = [];
  if (!fs.existsSync(dirPath)) {
    return results;
  }
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    const name = entry.name;
    if (['node_modules', '.git', 'venv', '__pycache__'].includes(name)) {
      continue;
    }
    const relativePath = baseRelative ? path.join(baseRelative, name) : name;
    if (entry.isDirectory()) {
      results.push({ path: relativePath, label: name, isDir: true });
      results.push(...listFilesRecursive(path.join(dirPath, name), relativePath));
    } else {
      results.push({ path: relativePath, label: name, isDir: false });
    }
  }
  return results;
}

// API Endpoints
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/api/files', (req, res) => {
  try {
    const files = listFilesRecursive(TRADING_BOT_DIR);
    res.json({ success: true, files });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/files/content', (req, res) => {
  const { filePath } = req.body || {};
  if (!filePath) {
    return res.status(400).json({ error: 'File path is required.' });
  }
  try {
    const targetPath = path.join(TRADING_BOT_DIR, filePath);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      const content = fs.readFileSync(targetPath, 'utf8');
      res.json({ content });
    } else {
      res.status(404).json({ error: 'File not found' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/files/save', (req, res) => {
  const { filePath, content } = req.body || {};
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'filePath and content are required.' });
  }
  try {
    const targetPath = path.join(TRADING_BOT_DIR, filePath);
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, 'utf8');
    res.json({ success: true, message: `File saved successfully: ${filePath}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/download', (req, res) => {
  try {
    if (!fs.existsSync(TRADING_BOT_DIR)) {
      return res.status(404).send('Trading bot directory not found.');
    }
    const zip = new AdmZip();
    zip.addLocalFolder(TRADING_BOT_DIR);
    const buffer = zip.toBuffer();
    res.setHeader('Content-Disposition', 'attachment; filename=binance_trading_bot.zip');
    res.setHeader('Content-Type', 'application/zip');
    res.send(buffer);
  } catch (err: any) {
    res.status(500).send(`Packaging error: ${err.message}`);
  }
});

app.get('/api/logs', (req, res) => {
  const logFilePath = path.join(TRADING_BOT_DIR, 'logs', 'trading.log');
  try {
    if (fs.existsSync(logFilePath)) {
      const text = fs.readFileSync(logFilePath, 'utf8');
      res.json({ text });
    } else {
      res.json({ text: '# Activity logs empty. Execute simulated Orders to generate logging telemetry.' });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/logs/clear', (req, res) => {
  const logFilePath = path.join(TRADING_BOT_DIR, 'logs', 'trading.log');
  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.writeFileSync(logFilePath, '# Simplified Binance Futures Trading Bot - Activity Log Core\n', 'utf8');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/market-state', (req, res) => {
  res.json({
    prices,
    walletBalance: parseFloat(walletBalance.toFixed(2)),
    openPositions,
    activeOrders,
    orderHistory,
  });
});

app.post('/api/execute-order', (req, res) => {
  const { symbol, side, type, quantity, price, stopPrice } = req.body || {};

  if (!symbol) {
    return res.status(400).json({ error: 'Symbol is required' });
  }
  if (!side || !['BUY', 'SELL'].includes(side.toUpperCase())) {
    return res.status(400).json({ error: 'Side must be BUY or SELL' });
  }
  if (!type || !['MARKET', 'LIMIT', 'STOP_LIMIT'].includes(type.toUpperCase())) {
    return res.status(400).json({ error: 'Type must be MARKET, LIMIT, or STOP_LIMIT' });
  }
  const qtyVal = parseFloat(quantity);
  if (isNaN(qtyVal) || qtyVal <= 0) {
    return res.status(400).json({ error: 'Quantity must be greater than 0' });
  }

  let priceVal = price !== undefined ? parseFloat(price) : undefined;
  let stopPriceVal = stopPrice !== undefined ? parseFloat(stopPrice) : undefined;

  const typeUpper = type.toUpperCase();
  if (typeUpper === 'LIMIT' && (priceVal === undefined || isNaN(priceVal) || priceVal <= 0)) {
    return res.status(400).json({ error: 'Price must be greater than 0 for LIMIT orders' });
  }
  if (typeUpper === 'STOP_LIMIT') {
    if (priceVal === undefined || isNaN(priceVal) || priceVal <= 0) {
      return res.status(400).json({ error: 'Price must be greater than 0 for STOP_LIMIT orders' });
    }
    if (stopPriceVal === undefined || isNaN(stopPriceVal) || stopPriceVal <= 0) {
      return res.status(400).json({ error: 'Stop Price must be greater than 0 for STOP_LIMIT orders' });
    }
  }

  const targetSymbol = symbol.toUpperCase();
  const targetSide = side.toUpperCase();
  const currentPrice = prices[targetSymbol] || 100.0;

  let reqDetails = `method=POST path=/fapi/v1/order symbol=${targetSymbol} side=${targetSide} quantity=${qtyVal}`;
  if (priceVal !== undefined) reqDetails += ` price=${priceVal}`;
  if (stopPriceVal !== undefined) reqDetails += ` stopPrice=${stopPriceVal}`;
  writeSimulatedLog('INFO', `Request: ${reqDetails}`);

  const newOrderId = Math.floor(100000 + Math.random() * 900000);
  const cliClientOrderId = 'cli_' + Math.random().toString(36).substring(2, 8);

  const order = {
    orderId: newOrderId,
    symbol: targetSymbol,
    side: targetSide,
    type: typeUpper,
    quantity: qtyVal,
    price: priceVal,
    stopPrice: stopPriceVal,
    status: 'NEW',
    clientOrderId: cliClientOrderId,
    timestamp: Date.now(),
  };

  if (typeUpper === 'MARKET') {
    fillOrder(order, currentPrice);
    return res.json({
      success: true,
      apiResponse: {
        orderId: newOrderId,
        symbol: targetSymbol,
        status: 'FILLED',
        price: '0.00',
        avgPrice: String(currentPrice),
        origQty: String(qtyVal),
        executedQty: String(qtyVal),
        type: 'MARKET',
        side: targetSide,
        updateTime: Date.now(),
      },
    });
  } else if (typeUpper === 'LIMIT') {
    order.status = 'NEW';
    activeOrders.push(order);
    writeSimulatedLog('INFO', `Response: Request Accepted (Pending LIMIT match): orderId=${newOrderId} status=NEW price=${priceVal}`);
    return res.json({
      success: true,
      apiResponse: {
        orderId: newOrderId,
        symbol: targetSymbol,
        status: 'NEW',
        price: String(priceVal),
        avgPrice: '0.00',
        origQty: String(qtyVal),
        executedQty: '0.00',
        type: 'LIMIT',
        side: targetSide,
        updateTime: Date.now(),
      },
    });
  } else {
    order.status = 'STOP_WAITING';
    activeOrders.push(order);
    writeSimulatedLog('INFO', `Response: Request Accepted (Awaiting STOP Trigger): orderId=${newOrderId} status=STOP_WAITING trigger=${stopPriceVal}`);
    return res.json({
      success: true,
      apiResponse: {
        orderId: newOrderId,
        symbol: targetSymbol,
        status: 'STOP_WAITING',
        price: String(priceVal),
        avgPrice: '0.00',
        origQty: String(qtyVal),
        executedQty: '0.00',
        type: 'STOP_LIMIT',
        side: targetSide,
        stopPrice: String(stopPriceVal),
        updateTime: Date.now(),
      },
    });
  }
});

app.post('/api/cancel-order', (req, res) => {
  const { orderId } = req.body || {};
  if (orderId === undefined) {
    return res.status(400).json({ error: 'orderId is missing' });
  }
  const orderIdx = activeOrders.findIndex(o => o.orderId === orderId);
  if (orderIdx !== -1) {
    const cancelled = activeOrders.splice(orderIdx, 1)[0];
    cancelled.status = 'CANCELED';
    cancelled.timestamp = Date.now();
    orderHistory.unshift(cancelled);

    writeSimulatedLog('INFO', `Request: method=DELETE path=/fapi/v1/order symbol=${cancelled.symbol} orderId=${orderId}`);
    writeSimulatedLog('INFO', `Response: orderId=${orderId} status=CANCELED symbol=${cancelled.symbol}`);
    res.json({ success: true });
  } else {
    res.status(404).json({ error: 'Order not found or already filled' });
  }
});

app.post('/api/close-position', (req, res) => {
  const { symbol } = req.body || {};
  if (!symbol) {
    return res.status(400).json({ error: 'symbol is missing' });
  }
  const posIdx = openPositions.findIndex(p => p.symbol === symbol);
  if (posIdx !== -1) {
    const pos = openPositions.splice(posIdx, 1)[0];
    const currentPrice = prices[symbol] || pos.entryPrice;
    const closeSide = pos.side === 'LONG' ? 'SELL' : 'BUY';
    const payout = pos.quantity * currentPrice;

    if (closeSide === 'SELL') {
      walletBalance += payout;
    } else {
      walletBalance -= payout;
    }

    const orderId = Math.floor(100000 + Math.random() * 900000);
    writeSimulatedLog('INFO', `Request: method=POST path=/fapi/v1/order symbol=${symbol} side=${closeSide} quantity=${pos.quantity} reason=CLOSE_POSITION`);
    writeSimulatedLog('INFO', `Response: orderId=${orderId} status=FILLED execQty=${pos.quantity} avgPrice=${currentPrice} symbol=${symbol}`);
    res.json({ success: true, closePrice: currentPrice });
  } else {
    res.status(404).json({ error: 'Position not found' });
  }
});

app.post('/api/env-configured', (req, res) => {
  const { apiKey, apiSecret } = req.body || {};
  try {
    const dotenvPath = path.join(TRADING_BOT_DIR, '.env');
    const newContent = 
      `API_KEY=${apiKey || 'MOCK_KEY_DEFAULT'}\n` +
      `API_SECRET=${apiSecret || 'MOCK_SECRET_DEFAULT'}\n` +
      `BASE_URL=https://testnet.binancefuture.com\n` +
      `TIMEOUT=10\n` +
      `MAX_RETRIES=3\n` +
      `RETRY_BACKOFF_FACTOR=1.5\n`;
    fs.writeFileSync(dotenvPath, newContent, 'utf8');
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/mentor/chat', async (req, res) => {
  const { message, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: 'Message prompt is required.' });
  }

  try {
    let botContext = 'Trading Bot Codebase Context:\n';
    const filesToRead = [
      'bot/exceptions.py',
      'bot/validators.py',
      'bot/config.py',
      'bot/logging_config.py',
      'bot/client.py',
      'bot/orders.py',
      'cli.py',
    ];

    for (const fName of filesToRead) {
      const fullPath = path.join(TRADING_BOT_DIR, fName);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          botContext += `--- File: ${fName} ---\n${content}\n\n`;
        } catch (fileErr) {
          console.error(`Error reading file ${fName}:`, fileErr);
        }
      }
    }

    const systemInstruction = 
      'You are an expert Quantitative Trading Engineer and Python Developer.\n' +
      'Your role is to act as a core mentor and reviewer for the user\'s \'Simplified Binance Futures Trading Bot\'.\n' +
      'The user is testing this bot in a workspace, preparing for a professional hiring assessment.\n\n' +
      'Give comprehensive, direct, well-commented, and technically rigorous answers.\n' +
      'Explain financial mechanisms (Futures leverage, margins, orderbooks, matching engine, stop prices, limit slippages).\n' +
      'Help users build deep code confidence (e.g. creating unittest mock setups for urllib/requests failures, verifying HMAC hashing parameters).\n\n' +
      'Keep your visual designs clean and do not mention file directories other than relative files.\n' +
      'Here is the actual Python code you are mentoring on:\n' +
      `${botContext}\n`;

    const client = getGeminiClient();

    const contents: any[] = [];
    for (const msg of history) {
      const role = msg.role === 'user' ? 'user' : 'model';
      contents.push({
        role,
        parts: [{ text: msg.text || '' }]
      });
    }

    contents.push({
      role: 'user',
      parts: [{ text: message }]
    });

    const response = await client.models.generateContent({
      model: 'gemini-3.5-flash',
      contents,
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ reply: response.text });
  } catch (err: any) {
    console.error('Gemini assistant failing:', err);
    res.status(500).json({ error: `Gemini API Exception: ${err.message}` });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
