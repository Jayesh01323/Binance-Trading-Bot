import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import AdmZip from "adm-zip";
import dotenv from "dotenv";

dotenv.config();

// Initialize Express
const app = express();
app.use(express.json());

const PORT = 3000;
const TRADING_BOT_DIR = path.join(process.cwd(), "trading_bot");

// Initialize Gemini Client lazily to prevent server crashes if GEMINI_API_KEY is missing
let aiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    const key = process.env.GEMINI_API_KEY;
    if (!key) {
      throw new Error("GEMINI_API_KEY environment variable is required для AI mentor functions.");
    }
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

// ==============================================================================
// IN-MEMORY SIMULATION STATE (RETAINED DURING DEV SERVICE SESSIONS)
// ==============================================================================
interface SimulatedOrder {
  orderId: number;
  symbol: string;
  side: "BUY" | "SELL";
  type: "MARKET" | "LIMIT" | "STOP_LIMIT";
  quantity: number;
  price?: number;
  stopPrice?: number;
  status: "NEW" | "FILLED" | "STOP_WAITING" | "CANCELED";
  clientOrderId: string;
  timestamp: number;
}

interface SimulatedPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  margin: number;
}

let walletBalance = 10000.0; // Start with 10k USDT
let openPositions: SimulatedPosition[] = [];
let orderHistory: SimulatedOrder[] = [];
let activeOrders: SimulatedOrder[] = [];

// Base prices
let prices: Record<string, number> = {
  BTCUSDT: 104250.0,
  ETHUSDT: 3450.0,
  SOLUSDT: 195.0,
};

// ==============================================================================
// BACKGROUND SIMULATOR TICK LOOP
// ==============================================================================
// Updates prices slightly and triggers LIMIT / STOP_LIMIT fill conditions
setInterval(() => {
  // Random price movements and drift
  for (const sym of Object.keys(prices)) {
    const changePct = (Math.random() - 0.5) * 0.0005; // -0.025% to +0.025%
    prices[sym] = parseFloat((prices[sym] * (1 + changePct)).toFixed(2));
  }

  // Iterate over active orders to see if they get filled
  let updatedOrders: SimulatedOrder[] = [];

  for (const order of activeOrders) {
    const currentPrice = prices[order.symbol];
    if (!currentPrice) {
      updatedOrders.push(order);
      continue;
    }

    if (order.status === "STOP_WAITING") {
      // STOP_LIMIT triggers when mark price crosses stopPrice
      const stopPrice = order.stopPrice || 0;
      const triggered =
        order.side === "BUY"
          ? currentPrice >= stopPrice // Buy triggers when price rises above stop
          : currentPrice <= stopPrice; // Sell triggers when price falls below stop

      if (triggered) {
        order.status = "NEW"; // Convert stop-limit into a standard LIMIT order
        writeSimulatedLog(
          "INFO",
          `Stop-Limit order activated: symbol=${order.symbol} side=${order.side} qty=${order.quantity} triggerPrice=${stopPrice} limitPrice=${order.price}`
        );
      }
      updatedOrders.push(order);
    } else if (order.status === "NEW") {
      // LIMIT order filling condition
      const limitPrice = order.price || 0;
      const triggered =
        order.side === "BUY"
          ? currentPrice <= limitPrice // Buy limit fills when price is at or below limit
          : currentPrice >= limitPrice; // Sell limit fills when price is at or above limit

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

// Helper function to process order fills and update portfolio positions
function fillOrder(order: SimulatedOrder, fillPrice: number) {
  order.status = "FILLED";
  order.timestamp = Date.now();
  orderHistory.unshift(order);

  // Simple position calculation
  const positionQty = order.quantity;
  const isBuy = order.side === "BUY";

  // Record trade cost
  const totalCost = positionQty * fillPrice;
  if (isBuy) {
    walletBalance -= totalCost;
  } else {
    walletBalance += totalCost;
  }

  // Update position
  const existingPos = openPositions.find((p) => p.symbol === order.symbol);
  if (existingPos) {
    if ((existingPos.side === "LONG" && isBuy) || (existingPos.side === "SHORT" && !isBuy)) {
      // Scale position
      const totalQty = existingPos.quantity + positionQty;
      const weightedPrice =
        (existingPos.entryPrice * existingPos.quantity + fillPrice * positionQty) / totalQty;
      existingPos.quantity = totalQty;
      existingPos.entryPrice = parseFloat(weightedPrice.toFixed(2));
      existingPos.margin = parseFloat((totalQty * weightedPrice * 0.05).toFixed(2)); // 20x leverage mock margin
    } else {
      // Reduce position
      const diff = existingPos.quantity - positionQty;
      if (diff > 0) {
        existingPos.quantity = diff;
        existingPos.margin = parseFloat((diff * existingPos.entryPrice * 0.05).toFixed(2));
      } else if (diff === 0) {
        openPositions = openPositions.filter((p) => p.symbol !== order.symbol);
      } else {
        // Reverse position
        existingPos.side = existingPos.side === "LONG" ? "SHORT" : "LONG";
        existingPos.quantity = Math.abs(diff);
        existingPos.entryPrice = fillPrice;
        existingPos.margin = parseFloat((Math.abs(diff) * fillPrice * 0.05).toFixed(2));
      }
    }
  } else {
    openPositions.push({
      symbol: order.symbol,
      side: isBuy ? "LONG" : "SHORT",
      entryPrice: fillPrice,
      quantity: positionQty,
      margin: parseFloat((positionQty * fillPrice * 0.05).toFixed(2)),
    });
  }

  // Write log line to physical file in exact proper format
  writeSimulatedLog(
    "INFO",
    `Response: orderId=${order.orderId} status=FILLED execQty=${order.quantity} avgPrice=${fillPrice} symbol=${order.symbol}`
  );
}

// Function to write clean, standard logs to logs/trading.log
function writeSimulatedLog(level: string, message: string) {
  const logFilePath = path.join(TRADING_BOT_DIR, "logs/trading.log");
  const timestamp = new Date()
    .toISOString()
    .replace("T", " ")
    .substring(0, 19);
  const logFormattedString = `${timestamp} | ${level.toUpperCase().padEnd(5)} | ${message}\n`;

  try {
    fs.mkdirSync(path.dirname(logFilePath), { recursive: true });
    fs.appendFileSync(logFilePath, logFormattedString, "utf8");
  } catch (err) {
    console.error("Could not write simulated log file:", err);
  }
}

// ==============================================================================
// REST ENDPOINTS
// ==============================================================================

// Public health check
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

// 1. Get List of Workspace Python Files (Hierarchical recursive search or list)
app.get("/api/files", (req, res) => {
  try {
    const listFilesRecursive = (dir: string, baseRelative = ""): Array<{ path: string; label: string; isDir: boolean }> => {
      let results: Array<{ path: string; label: string; isDir: boolean }> = [];
      const list = fs.readdirSync(dir);
      
      list.forEach((file) => {
        const fullPath = path.join(dir, file);
        const relativePath = baseRelative ? `${baseRelative}/${file}` : file;
        const stat = fs.statSync(fullPath);
        
        // Skip ignored directories
        if (file === "node_modules" || file === ".git" || file === "venv" || file === "__pycache__") {
          return;
        }
        
        if (stat.isDirectory()) {
          results.push({ path: relativePath, label: file, isDir: true });
          results = results.concat(listFilesRecursive(fullPath, relativePath));
        } else {
          results.push({ path: relativePath, label: file, isDir: false });
        }
      });
      return results;
    };
    
    if (fs.existsSync(TRADING_BOT_DIR)) {
      const allFiles = listFilesRecursive(TRADING_BOT_DIR);
      res.json({ success: true, files: allFiles });
    } else {
      res.status(404).json({ success: false, error: "Trading bot folder not found." });
    }
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Read single File Content
app.post("/api/files/content", (req, res) => {
  const { filePath } = req.body;
  if (!filePath) {
    return res.status(400).json({ error: "File path is required." });
  }
  
  try {
    const targetPath = path.join(TRADING_BOT_DIR, filePath);
    if (fs.existsSync(targetPath) && fs.statSync(targetPath).isFile()) {
      const content = fs.readFileSync(targetPath, "utf8");
      res.json({ content });
    } else {
      res.status(404).json({ error: "File not found" });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 3. Save modified File Content
app.post("/api/files/save", (req, res) => {
  const { filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: "filePath and content are required." });
  }
  
  try {
    const targetPath = path.join(TRADING_BOT_DIR, filePath);
    // Ensure parent dir exists
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.writeFileSync(targetPath, content, "utf8");
    res.json({ success: true, message: `File saved successfully: ${filePath}` });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 4. Download python project as ZIP
app.get("/api/download", (req, res) => {
  try {
    if (!fs.existsSync(TRADING_BOT_DIR)) {
      return res.status(404).send("Trading bot directory was not generated.");
    }

    const zip = new AdmZip();
    // Exclude logs outputs, pycache and local files
    zip.addLocalFolder(TRADING_BOT_DIR, "", (filename) => {
      if (
        filename.includes("__pycache__") || 
        filename.includes("venv") || 
        filename.endsWith(".log")
      ) {
        return false;
      }
      return true;
    });

    const buffer = zip.toBuffer();
    res.setHeader("Content-Disposition", "attachment; filename=binance_trading_bot.zip");
    res.setHeader("Content-Type", "application/zip");
    res.send(buffer);
  } catch (err: any) {
    res.status(500).send(`Packaging error: ${err.message}`);
  }
});

// 5. Read physical trading bot log file
app.get("/api/logs", (req, res) => {
  const logFilePath = path.join(TRADING_BOT_DIR, "logs/trading.log");
  try {
    if (fs.existsSync(logFilePath)) {
      const text = fs.readFileSync(logFilePath, "utf8");
      res.json({ text });
    } else {
      res.json({ text: "# Activity logs empty. Execute simulated Orders to generate logging telemetry." });
    }
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 6. Clear Logs
app.post("/api/logs/clear", (req, res) => {
  const logFilePath = path.join(TRADING_BOT_DIR, "logs/trading.log");
  try {
    fs.writeFileSync(logFilePath, "# Simplified Binance Futures Trading Bot - Activity Log Core\n", "utf8");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 7. Get Market Simulation Data (Prices, Balance, Orders)
app.get("/api/market-state", (req, res) => {
  res.json({
    prices,
    walletBalance: parseFloat(walletBalance.toFixed(2)),
    openPositions,
    activeOrders,
    orderHistory,
  });
});

// 8. Execute CLI Simulated Order Place
app.post("/api/execute-order", (req, res) => {
  const { symbol, side, type, quantity, price, stopPrice } = req.body;

  // Validation
  if (!symbol) return res.status(400).json({ error: "Symbol is required" });
  if (!side || !["BUY", "SELL"].includes(side.toUpperCase())) {
    return res.status(400).json({ error: "Side must be BUY or SELL" });
  }
  if (!type || !["MARKET", "LIMIT", "STOP_LIMIT"].includes(type.toUpperCase())) {
    return res.status(400).json({ error: "Type must be MARKET, LIMIT, or STOP_LIMIT" });
  }
  if (!quantity || parseFloat(quantity) <= 0) {
    return res.status(400).json({ error: "Quantity must be greater than 0" });
  }

  const normalizedQty = parseFloat(quantity);
  const normalizedPrice = price ? parseFloat(price) : undefined;
  const normalizedStopPrice = stopPrice ? parseFloat(stopPrice) : undefined;

  if (type.toUpperCase() === "LIMIT" && (!normalizedPrice || normalizedPrice <= 0)) {
    return res.status(400).json({ error: "Price must be greater than 0 for LIMIT orders" });
  }
  if (type.toUpperCase() === "STOP_LIMIT") {
    if (!normalizedPrice || normalizedPrice <= 0) {
      return res.status(400).json({ error: "Price must be greater than 0 for STOP_LIMIT orders" });
    }
    if (!normalizedStopPrice || normalizedStopPrice <= 0) {
      return res.status(400).json({ error: "Stop Price must be greater than 0 for STOP_LIMIT orders" });
    }
  }

  // Set simulated parameters
  const targetSymbol = symbol.toUpperCase();
  const targetSide = side.toUpperCase();
  const targetType = type.toUpperCase();
  const currentPrice = prices[targetSymbol] || 100.0;

  // Write immediate pre-execution log (REQUEST FORMAT MATCHING ASSIGNMENT SPEC)
  const reqDetails = `method=POST path=/fapi/v1/order symbol=${targetSymbol} side=${targetSide} quantity=${normalizedQty}` +
    (normalizedPrice ? ` price=${normalizedPrice}` : "") +
    (normalizedStopPrice ? ` stopPrice=${normalizedStopPrice}` : "");
  writeSimulatedLog("INFO", `Request: ${reqDetails}`);

  // Create Order Structure
  const newOrderId = Math.floor(100000 + Math.random() * 900000);
  const cliClientOrderId = "cli_" + Math.random().toString(36).substring(7);

  const order: SimulatedOrder = {
    orderId: newOrderId,
    symbol: targetSymbol,
    side: targetSide as "BUY" | "SELL",
    type: targetType as "MARKET" | "LIMIT" | "STOP_LIMIT",
    quantity: normalizedQty,
    price: normalizedPrice,
    stopPrice: normalizedStopPrice,
    status: "NEW",
    clientOrderId: cliClientOrderId,
    timestamp: Date.now(),
  };

  // Execution branching
  if (targetType === "MARKET") {
    // Fill immediately
    fillOrder(order, currentPrice);
    res.json({
      success: true,
      apiResponse: {
        orderId: newOrderId,
        symbol: targetSymbol,
        status: "FILLED",
        price: "0.00",
        avgPrice: currentPrice.toString(),
        origQty: normalizedQty.toString(),
        executedQty: normalizedQty.toString(),
        type: "MARKET",
        side: targetSide,
        updateTime: Date.now(),
      },
    });
  } else if (targetType === "LIMIT") {
    // Limit order adds to order book waiting for matching
    order.status = "NEW";
    activeOrders.push(order);
    writeSimulatedLog("INFO", `Response: Request Accepted (Pending LIMIT match): orderId=${newOrderId} status=NEW price=${normalizedPrice}`);
    res.json({
      success: true,
      apiResponse: {
        orderId: newOrderId,
        symbol: targetSymbol,
        status: "NEW",
        price: normalizedPrice!.toString(),
        avgPrice: "0.00",
        origQty: normalizedQty.toString(),
        executedQty: "0.00",
        type: "LIMIT",
        side: targetSide,
        updateTime: Date.now(),
      },
    });
  } else {
    // STOP_LIMIT order puts order waiting for stop activation
    order.status = "STOP_WAITING";
    activeOrders.push(order);
    writeSimulatedLog("INFO", `Response: Request Accepted (Awaiting STOP Trigger): orderId=${newOrderId} status=STOP_WAITING trigger=${normalizedStopPrice}`);
    res.json({
      success: true,
      apiResponse: {
        orderId: newOrderId,
        symbol: targetSymbol,
        status: "STOP_WAITING",
        price: normalizedPrice!.toString(),
        avgPrice: "0.00",
        origQty: normalizedQty.toString(),
        executedQty: "0.00",
        type: "STOP_LIMIT",
        side: targetSide,
        stopPrice: normalizedStopPrice!.toString(),
        updateTime: Date.now(),
      },
    });
  }
});

// Cancel active order
app.post("/api/cancel-order", (req, res) => {
  const { orderId } = req.body;
  const orderIndex = activeOrders.findIndex((o) => o.orderId === orderId);

  if (orderIndex !== -1) {
    const cancelled = activeOrders.splice(orderIndex, 1)[0];
    cancelled.status = "CANCELED";
    cancelled.timestamp = Date.now();
    orderHistory.unshift(cancelled);

    writeSimulatedLog("INFO", `Request: method=DELETE path=/fapi/v1/order symbol=${cancelled.symbol} orderId=${orderId}`);
    writeSimulatedLog("INFO", `Response: orderId=${orderId} status=CANCELED symbol=${cancelled.symbol}`);

    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Order not found or already filled" });
  }
});

// Close open position
app.post("/api/close-position", (req, res) => {
  const { symbol } = req.body;
  const positionIndex = openPositions.findIndex((p) => p.symbol === symbol);

  if (positionIndex !== -1) {
    const pos = openPositions.splice(positionIndex, 1)[0];
    const currentPrice = prices[symbol] || pos.entryPrice;
    
    // Reverse side for close order
    const closeSide = pos.side === "LONG" ? "SELL" : "BUY";
    const payout = pos.quantity * currentPrice;

    if (closeSide === "SELL") {
      walletBalance += payout;
    } else {
      walletBalance -= payout;
    }

    const orderId = Math.floor(100000 + Math.random() * 900000);
    writeSimulatedLog("INFO", `Request: method=POST path=/fapi/v1/order symbol=${symbol} side=${closeSide} quantity=${pos.quantity} reason=CLOSE_POSITION`);
    writeSimulatedLog("INFO", `Response: orderId=${orderId} status=FILLED execQty=${pos.quantity} avgPrice=${currentPrice} symbol=${symbol}`);

    res.json({ success: true, closePrice: currentPrice });
  } else {
    res.status(404).json({ error: "Position not found" });
  }
});

// Configure Workspace / Bot API Key Simulator presets
app.post("/api/env-configured", (req, res) => {
  const { apiKey, apiSecret } = req.body;
  
  // Write to actual .env inside trading_bot
  try {
    const dotenvPath = path.join(TRADING_BOT_DIR, ".env");
    const newContent = `API_KEY=${apiKey || "MOCK_KEY_DEFAULT"}\nAPI_SECRET=${apiSecret || "MOCK_SECRET_DEFAULT"}\nBASE_URL=https://testnet.binancefuture.com\nTIMEOUT=10\nMAX_RETRIES=3\nRETRY_BACKOFF_FACTOR=1.5\n`;
    fs.writeFileSync(dotenvPath, newContent, "utf8");
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// 9. Gemini AI Quant / Coding Mentor Endpoint
app.post("/api/mentor/chat", async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message prompt is required." });
  }

  try {
    // Collect the files of our trading bot for robust code context
    let botContext = "Trading Bot Codebase Context:\n";
    const filesToRead = [
      "bot/exceptions.py",
      "bot/validators.py",
      "bot/config.py",
      "bot/logging_config.py",
      "bot/client.py",
      "bot/orders.py",
      "cli.py",
    ];

    for (const f of filesToRead) {
      const fullFPath = path.join(TRADING_BOT_DIR, f);
      if (fs.existsSync(fullFPath)) {
        botContext += `--- File: ${f} ---\n${fs.readFileSync(fullFPath, "utf8")}\n\n`;
      }
    }

    const systemInstruction = `You are an expert Quantitative Trading Engineer and Python Developer. 
Your role is to act as a core mentor and reviewer for the user's "Simplified Binance Futures Trading Bot". 
The user is testing this bot in a workspace, preparing for a professional hiring assessment.

Give comprehensive, direct, well-commented, and technically rigorous answers. 
Explain financial mechanisms (Futures leverage, margins, orderbooks, matching engine, stop prices, limit slippages).
Help users build deep code confidence (e.g. creating unittest mock setups for urllib/requests failures, verifying HMAC hashing parameters).

Keep your visual designs clean and do not mention file directories other than relative files.
Here is the actual Python code you are mentoring on:
${botContext}
`;

    // Map the user history format to what the modern SDK expects
    const geminiHistory = (history || []).map((msg: any) => ({
      role: msg.role === "user" ? "user" : "model",
      parts: [{ text: msg.text }],
    }));

    // Generate output utilizing gemini-3.5-flash for balanced capability and latency
    const googleAi = getGeminiClient();
    const response = await googleAi.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        ...geminiHistory,
        { role: "user", parts: [{ text: message }] }
      ],
      config: {
        systemInstruction,
        temperature: 0.7,
      },
    });

    res.json({ reply: response.text });
  } catch (err: any) {
    console.error("Gemini assistant failing:", err);
    res.status(500).json({ error: `Gemini API Exception: ${err.message}` });
  }
});

// ==============================================================================
// VITE AND STATIC CLIENT RENDERING MIDDLEWARE
// ==============================================================================
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Fulfilled Full-Stack Service booted on http://localhost:${PORT}`);
  });
}

startServer();
