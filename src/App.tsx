import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  Folder,
  ChevronRight,
  Terminal,
  Play,
  Download,
  Code,
  FileCode,
  Activity,
  History,
  TrendingUp,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  Lock,
  Search,
  Settings,
  HelpCircle,
  TrendingDown,
  Edit2,
  Save,
  DollarSign
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

// Types
interface BotFile {
  path: string;
  label: string;
  isDir: boolean;
}

interface SimulatedPosition {
  symbol: string;
  side: "LONG" | "SHORT";
  entryPrice: number;
  quantity: number;
  margin: number;
}

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

export default function App() {
  // Navigation & Tabs
  const [activeTab, setActiveTab] = useState<"terminal" | "chart" | "logs">("terminal");
  
  // File Explorer & Editor
  const [files, setFiles] = useState<BotFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<string>("cli.py");
  const [fileContent, setFileContent] = useState<string>("");
  const [isEditingContent, setIsEditingContent] = useState<boolean>(false);
  const [copySuccess, setCopySuccess] = useState<boolean>(false);
  const [fileSearchQuery, setFileSearchQuery] = useState<string>("");
  const [saveStatus, setSaveStatus] = useState<string>("");
  
  // CLI inputs
  const [symbol, setSymbol] = useState<string>("BTCUSDT");
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT" | "STOP_LIMIT">("MARKET");
  const [quantity, setQuantity] = useState<string>("0.001");
  const [limitPrice, setLimitPrice] = useState<string>("104250");
  const [stopPrice, setStopPrice] = useState<string>("104000");
  
  // Environment Setup
  const [customApiKey, setCustomApiKey] = useState<string>("");
  const [customApiSecret, setCustomApiSecret] = useState<string>("");
  const [envConfigured, setEnvConfigured] = useState<boolean>(false);
  
  // Interactive Simulation terminal logging & output views
  const [terminalHistory, setTerminalHistory] = useState<Array<{ id: number; text: string; isOutput?: boolean }>>([
    { id: 1, text: "# Simulated Trading Bot Interactive Command Terminal" },
    { id: 2, text: "# Configure credentials below or trigger commands right away!" }
  ]);
  const [isExecutingCommandLine, setIsExecutingCommandLine] = useState<boolean>(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  
  // Global Market Dashboard States
  const [marketPrices, setMarketPrices] = useState<Record<string, number>>({
    BTCUSDT: 104250.0,
    ETHUSDT: 3450.0,
    SOLUSDT: 195.0
  });
  const [walletBalance, setWalletBalance] = useState<number>(10000.0);
  const [openPositions, setOpenPositions] = useState<SimulatedPosition[]>([]);
  const [activeOrders, setActiveOrders] = useState<SimulatedOrder[]>([]);
  const [orderHistory, setOrderHistory] = useState<SimulatedOrder[]>([]);
  
  // Chart pricing values
  const [chartHistory, setChartHistory] = useState<Record<string, number[]>>({
    BTCUSDT: Array.from({ length: 30 }, () => 104250.0 + (Math.random() - 0.5) * 400),
    ETHUSDT: Array.from({ length: 30 }, () => 3450.0 + (Math.random() - 0.5) * 15),
    SOLUSDT: Array.from({ length: 30 }, () => 195.0 + (Math.random() - 0.5) * 2)
  });
  
  // Log telemetry file
  const [logFileText, setLogFileText] = useState<string>("");
  const [isRefreshingLogs, setIsRefreshingLogs] = useState<boolean>(false);
  
  // Initialize and poll state
  useEffect(() => {
    fetchWorkspaceFiles();
    fetchLogs();
    fetchMarketState();
    
    // Periodically sync market prices
    const marketInterval = setInterval(() => {
      fetchMarketState();
    }, 1500);

    return () => clearInterval(marketInterval);
  }, []);

  // Update chart price histories when prices tick
  useEffect(() => {
    setChartHistory(prev => {
      const updated = { ...prev };
      Object.keys(pricesForChartRef.current).forEach(sym => {
        const history = [...(prev[sym] || [])];
        history.push(pricesForChartRef.current[sym]);
        if (history.length > 30) history.shift();
        updated[sym] = history;
      });
      return updated;
    });
  }, [marketPrices]);

  // Keep a ref of prices to avoid circular hooks
  const pricesForChartRef = useRef<Record<string, number>>(marketPrices);
  useEffect(() => {
    pricesForChartRef.current = marketPrices;
  }, [marketPrices]);

  // Read code content of selected file
  useEffect(() => {
    if (selectedFile) {
      loadFileContent(selectedFile);
    }
  }, [selectedFile]);

  // Reset Price when Symbol matches
  useEffect(() => {
    const defaultPrice = marketPrices[symbol] || 100.0;
    setLimitPrice(defaultPrice.toFixed(2));
    setStopPrice((defaultPrice * 0.99).toFixed(2));
  }, [symbol]);

  // API Call: Fetch files list
  const fetchWorkspaceFiles = async () => {
    try {
      const res = await fetch("/api/files");
      const data = await res.json();
      if (data.success) {
        setFiles(data.files);
      }
    } catch (err) {
      console.error("Failed fetching workspace files:", err);
    }
  };

  // API Call: Load single file content
  const loadFileContent = async (filePath: string) => {
    setIsEditingContent(false);
    setSaveStatus("");
    try {
      const res = await fetch("/api/files/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath })
      });
      const data = await res.json();
      if (data.content !== undefined) {
        setFileContent(data.content);
      }
    } catch (err) {
      console.error("Failed fetching file content:", err);
    }
  };

  // API Call: Save modified file content
  const handleSaveFileContent = async () => {
    setSaveStatus("Saving...");
    try {
      const res = await fetch("/api/files/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filePath: selectedFile, content: fileContent })
      });
      const data = await res.json();
      if (data.success) {
        setSaveStatus("Saved successfully!");
        setIsEditingContent(false);
        fetchWorkspaceFiles(); // Refresh filesystem view in case they created folders
      } else {
        setSaveStatus(`Error saving: ${data.error}`);
      }
    } catch (err: any) {
      setSaveStatus(`Failed: ${err.message}`);
    }
  };

  // API Call: Sync market portfolio
  const fetchMarketState = async () => {
    try {
      const res = await fetch("/api/market-state");
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      setMarketPrices(data.prices);
      setWalletBalance(data.walletBalance);
      setOpenPositions(data.openPositions);
      setActiveOrders(data.activeOrders);
      setOrderHistory(data.orderHistory);
      setSyncError(null);
    } catch (err: any) {
      console.error("Failed syncing market state:", err);
      setSyncError(err.message || "Failed to fetch");
    }
  };

  // API Call: Fetch physical logs file
  const fetchLogs = async () => {
    setIsRefreshingLogs(true);
    try {
      const res = await fetch("/api/logs");
      const data = await res.json();
      setLogFileText(data.text);
    } catch (err) {
      console.error("Failed fetching logs:", err);
    } finally {
      setIsRefreshingLogs(false);
    }
  };

  // API Call: Clear logs
  const clearLogs = async () => {
    try {
      await fetch("/api/logs/clear", { method: "POST" });
      fetchLogs();
    } catch (err) {
      console.error("Failed clearing logs:", err);
    }
  };

  // API Call: Save CLI client credentials Simulation
  const configureCredentials = async () => {
    try {
      const res = await fetch("/api/env-configured", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: customApiKey, apiSecret: customApiSecret })
      });
      const data = await res.json();
      if (data.success) {
        setEnvConfigured(true);
        setTerminalHistory(prev => [
          ...prev,
          { id: Date.now(), text: `\n$ # Exported real/mock secrets to python .env successfully!` }
        ]);
        // Trigger file-editor reload as is editing the workspace
        loadFileContent(".env.example");
      }
    } catch (err) {
      console.error("Failed configuring credentials env:", err);
    }
  };

  // API Call: Execute simulated order
  const handleExecuteSimulatedOrder = async () => {
    setIsExecutingCommandLine(true);
    
    // Command equivalent output to terminal
    const currentPriceStr = marketPrices[symbol]?.toFixed(2) || "100.00";
    let cmdString = `python cli.py --symbol ${symbol} --side ${side} --type ${orderType} --quantity ${quantity}`;
    if (orderType === "LIMIT") cmdString += ` --price ${limitPrice}`;
    if (orderType === "STOP_LIMIT") cmdString += ` --price ${limitPrice} --stop-price ${stopPrice}`;

    setTerminalHistory(prev => [
      ...prev,
      { id: Date.now() + 1, text: `\n$ ${cmdString}` },
      { id: Date.now() + 2, text: "================================" },
      { id: Date.now() + 3, text: "ORDER REQUEST" },
      { id: Date.now() + 4, text: "=============" },
      { id: Date.now() + 5, text: `Symbol: ${symbol}` },
      { id: Date.now() + 6, text: `Side: ${side}` },
      { id: Date.now() + 7, text: `Type: ${orderType}` },
      { id: Date.now() + 8, text: `Quantity: ${quantity}` },
      ...(orderType !== "MARKET" ? [{ id: Date.now() + 9, text: `Price: ${limitPrice}` }] : []),
      ...(orderType === "STOP_LIMIT" ? [{ id: Date.now() + 10, text: `Stop Price: ${stopPrice}` }] : []),
      { id: Date.now() + 11, text: "================================" }
    ]);

    try {
      const res = await fetch("/api/execute-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symbol,
          side,
          type: orderType,
          quantity,
          price: orderType !== "MARKET" ? limitPrice : undefined,
          stopPrice: orderType === "STOP_LIMIT" ? stopPrice : undefined
        })
      });

      const data = await res.json();
      
      // Delay response slightly to simulate cryptographic HMAC signature and socket ping latency
      setTimeout(() => {
        if (data.success && data.apiResponse) {
          const apiRes = data.apiResponse;
          setTerminalHistory(prev => [
            ...prev,
            { id: Date.now() + 20, text: "\n====================" },
            { id: Date.now() + 21, text: "ORDER RESULT" },
            { id: Date.now() + 22, text: "============" },
            { id: Date.now() + 23, text: `Order ID: ${apiRes.orderId}` },
            { id: Date.now() + 24, text: `Status: ${apiRes.status}` },
            { id: Date.now() + 25, text: `Executed Qty: ${apiRes.executedQty || quantity}` },
            { id: Date.now() + 26, text: `Average Price: ${apiRes.avgPrice !== "0.00" ? apiRes.avgPrice : currentPriceStr}` },
            { id: Date.now() + 27, text: "\nResult: SUCCESS" },
            { id: Date.now() + 28, text: "====================\n" }
          ]);
        } else {
          setTerminalHistory(prev => [
            ...prev,
            { id: Date.now() + 20, text: "\n====================" },
            { id: Date.now() + 21, text: "ORDER RESULT" },
            { id: Date.now() + 22, text: "============" },
            { id: Date.now() + 23, text: "Result: FAILED" },
            { id: Date.now() + 24, text: `Reason: ${data.error || "Execution timeout error"}` },
            { id: Date.now() + 25, text: "====================\n" }
          ]);
        }
        setIsExecutingCommandLine(false);
        fetchMarketState();
        fetchLogs();
      }, 800);

    } catch (err: any) {
      setTimeout(() => {
        setTerminalHistory(prev => [
          ...prev,
          { id: Date.now() + 30, text: "\nResult: FAILED" },
          { id: Date.now() + 31, text: `Reason: Exception: ${err.message}` },
          { id: Date.now() + 32, text: "====================\n" }
        ]);
        setIsExecutingCommandLine(false);
      }, 800);
    }
  };

  // API Call: Cancel Active order
  const handleCancelOrder = async (orderId: number) => {
    try {
      const res = await fetch("/api/cancel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId })
      });
      if (res.ok) {
        setTerminalHistory(prev => [
          ...prev,
          { id: Date.now(), text: `\n$ cli.py --cancel ${orderId}\nOrder ID ${orderId} successfully canceled.` }
        ]);
        fetchMarketState();
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed canceling order:", err);
    }
  };

  // API Call: Close Open Position
  const handleClosePosition = async (sym: string) => {
    try {
      const res = await fetch("/api/close-position", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: sym })
      });
      if (res.ok) {
        fetchMarketState();
        fetchLogs();
      }
    } catch (err) {
      console.error("Failed closing position:", err);
    }
  };



  // Copy Code utility
  const handleCopyCode = () => {
    navigator.clipboard.writeText(fileContent);
    setCopySuccess(true);
    setTimeout(() => setCopySuccess(false), 2000);
  };

  // Filtered files
  const filteredFiles = files.filter(f => 
    f.label.toLowerCase().includes(fileSearchQuery.toLowerCase()) ||
    f.path.toLowerCase().includes(fileSearchQuery.toLowerCase())
  );

  // Group files into standard folder paths
  const rootFiles = filteredFiles.filter(f => !f.path.includes("/"));
  const botFolderFiles = filteredFiles.filter(f => f.path.startsWith("bot/"));
  const logsFolderFiles = filteredFiles.filter(f => f.path.startsWith("logs/"));
  const examplesFolderFiles = filteredFiles.filter(f => f.path.startsWith("examples/"));

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-teal-100 selection:text-teal-900">
      
      {/* 1. MAIN APP HEADER */}
      <header className="border-b border-slate-200 bg-white/95 backdrop-blur px-6 py-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-40 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-teal-600 p-2.5 rounded-lg text-white shadow-md shadow-teal-600/10">
            <TrendingUp size={24} className="stroke-[2.5]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
              Binance Futures Trading Bot
            </h1>
          </div>
        </div>
      </header>

      {syncError && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-2 flex items-center gap-2.5 text-xs text-amber-800 font-medium">
          <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping inline-block shrink-0" />
          <span>Failed syncing server state. Retrying automatically... Details: {syncError}</span>
        </div>
      )}

      {/* 2. BODY WORKSPACE CONTAINER */}
      <div className="flex-1 flex flex-col md:max-w-6xl md:mx-auto w-full p-4 md:p-6 overflow-hidden">

        {/* RUNNER PANEL: TERMINAL, SIMULATOR, CHARTS, AND ACTIVE ORDERS */}
        <div className="flex-1 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden h-full">
          
          {/* Main simulator control tabs */}
          <div className="border-b border-slate-200 bg-white flex justify-between items-center px-4 shadow-sm/10">
            <div className="flex overflow-x-auto">
              {[
                { id: "terminal", label: "CLI Emulator", icon: Terminal },
                { id: "chart", label: "Market Chart", icon: Activity },
                { id: "logs", label: "Bot Logs", icon: FileText }
              ].map(tab => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex items-center gap-2 px-5 py-3 text-xs font-semibold tracking-wide font-mono transition-all border-b-2 relative ${
                      activeTab === tab.id
                        ? "text-teal-600 border-teal-500 bg-slate-50/40"
                        : "text-slate-500 border-transparent hover:text-slate-800 hover:bg-slate-50"
                    }`}
                    id={`tab_button_${tab.id}`}
                  >
                    <Icon size={14} className={activeTab === tab.id ? "text-teal-600" : "text-slate-400"} />
                    {tab.label}
                    {tab.id === "logs" && (
                      <span className="w-2 h-2 rounded-full bg-teal-500 animate-pulse inline-block" />
                    )}
                  </button>
                );
              })}
            </div>
            
            {/* Quick Balance Status display */}
            <div className="hidden sm:flex items-center gap-3 pr-2 text-xs font-mono text-slate-600 bg-slate-50 p-1.5 px-3 border border-slate-200 rounded-md">
              <span className="text-slate-400 font-bold">BALANCE:</span>
              <span className="text-teal-700 font-bold">${walletBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT</span>
            </div>
          </div>

          {/* ACTIVE PANEL CONTENT DISPLAY */}
          <div className="flex-1 overflow-y-auto p-4 flex flex-col">
            <AnimatePresence mode="wait">
              
              {/* TAB 1: CLI TERMINAL EMULATOR */}
              {activeTab === "terminal" && (
                <motion.div
                  key="terminal"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  transition={{ duration: 0.15 }}
                  className="flex-1 flex flex-col gap-4"
                >
                  {/* CREDENTIALS SIMULATOR ENVIRONMENT PANELS */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Lock size={15} className="text-teal-600" />
                        <h3 className="text-xs font-mono font-bold text-slate-800 tracking-wider uppercase">
                          Binance API Credentials Hook
                        </h3>
                      </div>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        envConfigured 
                          ? "bg-emerald-50 text-emerald-700 border border-emerald-200" 
                          : "bg-amber-50 text-amber-700 border border-amber-200 animate-pulse"
                      }`}>
                        {envConfigured ? "SECURE ENVIRONMENT LOADED" : "AWAITING API CREDENTIALS"}
                      </span>
                    </div>
                    
                    <p className="text-xs text-slate-500 mb-4 leading-relaxed">
                      This parameters panel dynamically updates the python project's standard <code>.env</code> file. Credentials are auto-encrypted via cryptography signatures at runtime.
                    </p>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                          Binance API Key
                        </label>
                        <input
                          type="password"
                          value={customApiKey}
                          onChange={(e) => setCustomApiKey(e.target.value)}
                          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                          id="env_api_key"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase mb-1">
                          Binance Secret Key
                        </label>
                        <input
                          type="password"
                          value={customApiSecret}
                          onChange={(e) => setCustomApiSecret(e.target.value)}
                          placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-800 focus:outline-none focus:border-teal-500 focus:bg-white transition-all"
                          id="env_api_secret"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        onClick={configureCredentials}
                        className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-1.5 rounded-lg text-xs font-semibold font-mono transition-colors active:translate-y-0.5"
                        id="save_env_credentials_btn"
                      >
                        Apply Environment Keys
                      </button>
                    </div>
                  </div>

                  {/* INTERACTIVE FORM CONTROLS */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <h3 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                      <Settings size={14} className="text-teal-600" /> CLI Execution parameters
                    </h3>
                    
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-4">
                      {/* Symbol */}
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1">--symbol</label>
                        <select
                          value={symbol}
                          onChange={(e) => setSymbol(e.target.value)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-teal-500"
                        >
                          <option value="BTCUSDT">BTCUSDT (Testnet)</option>
                          <option value="ETHUSDT">ETHUSDT (Testnet)</option>
                          <option value="SOLUSDT">SOLUSDT (Testnet)</option>
                        </select>
                      </div>

                      {/* Direction */}
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1">--side</label>
                        <select
                          value={side}
                          onChange={(e) => setSide(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-teal-500 font-bold"
                        >
                          <option value="BUY" className="text-emerald-600">BUY (Long)</option>
                          <option value="SELL" className="text-rose-600">SELL (Short)</option>
                        </select>
                      </div>

                      {/* Order Type */}
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1">--type</label>
                        <select
                          value={orderType}
                          onChange={(e) => setOrderType(e.target.value as any)}
                          className="w-full bg-white border border-slate-200 rounded-lg p-2 text-xs text-slate-800 outline-none focus:border-teal-500"
                        >
                          <option value="MARKET">MARKET</option>
                          <option value="LIMIT">LIMIT</option>
                          <option value="STOP_LIMIT">STOP_LIMIT</option>
                        </select>
                      </div>

                      {/* Quantity */}
                      <div>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1">--quantity</label>
                        <input
                          type="number"
                          value={quantity}
                          onChange={(e) => setQuantity(e.target.value)}
                          step="0.001"
                          min="0.001"
                          placeholder="0.001"
                          className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-teal-500"
                        />
                      </div>

                      {/* Price (Depends on LIMIT or STOP_LIMIT) */}
                      <div className={orderType === "MARKET" ? "opacity-30 pointer-events-none" : ""}>
                        <label className="block text-[10px] font-mono font-bold text-slate-500 mb-1">--price</label>
                        <input
                          type="number"
                          value={limitPrice}
                          onChange={(e) => setLimitPrice(e.target.value)}
                          className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-850 focus:outline-none focus:border-teal-500 font-mono"
                          disabled={orderType === "MARKET"}
                        />
                      </div>
                    </div>

                    {/* STOP_LIMIT ONLY SPECIFICS */}
                    {orderType === "STOP_LIMIT" && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="bg-teal-50 border border-teal-100 rounded-xl p-3 mb-4 grid grid-cols-1 md:grid-cols-2 gap-4"
                      >
                        <div>
                          <label className="block text-[10px] font-mono font-bold text-teal-800 mb-1">
                            --stop-price (Trigger Point)
                          </label>
                          <input
                            type="number"
                            value={stopPrice}
                            onChange={(e) => setStopPrice(e.target.value)}
                            className="w-full bg-white border border-slate-200 p-2 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-teal-500 font-mono"
                          />
                          <p className="text-[10px] text-teal-600 mt-1">
                            The trigger threshold mark price. When price crosses this point, order activates.
                          </p>
                        </div>
                        <div className="text-xs text-slate-500 flex flex-col justify-center leading-relaxed">
                          <span className="font-bold text-teal-700 font-mono text-[10px] uppercase">BONUS FEATURE: STOP_LIMIT TYPE</span>
                          Mapped internally using type='STOP'. Both a trigger stopPrice and execute target limitPrice are signed and dispatched.
                        </div>
                      </motion.div>
                    )}

                    {/* COMMAND EQUIVALENT SHELL BOX */}
                    <div className="bg-slate-900 border border-slate-950 rounded-lg p-3 py-2 flex items-center justify-between gap-3 text-xs mb-4">
                      <div className="font-mono text-emerald-400 select-all overflow-x-auto whitespace-nowrap scrollbar-none py-1">
                        <span className="text-slate-405 font-bold">$</span> python cli.py --symbol {symbol} --side {side.toLowerCase()} --type {orderType.toLowerCase()} --quantity {quantity}
                        {orderType !== "MARKET" && ` --price ${limitPrice}`}
                        {orderType === "STOP_LIMIT" && ` --stop-price ${stopPrice}`}
                      </div>
                      
                      <button
                        onClick={() => navigator.clipboard.writeText(`python cli.py --symbol ${symbol} --side ${side} --type ${orderType} --quantity ${quantity}` + (orderType !== "MARKET" ? ` --price ${limitPrice}` : "") + (orderType === "STOP_LIMIT" ? ` --stop-price ${stopPrice}` : ""))}
                        className="text-slate-400 hover:text-slate-200 shrink-0 p-1 bg-slate-850 hover:bg-slate-800 rounded transition-colors"
                        title="Copy shell command"
                      >
                        <Copy size={13} />
                      </button>
                    </div>

                    <div className="flex justify-between items-center gap-4">
                      <button
                        onClick={() => setTerminalHistory([
                          { id: 1, text: "# Simulated Trading Bot Interactive Command Terminal" },
                          { id: 2, text: "# Configure credentials below or trigger commands right away!" }
                        ])}
                        className="text-[11px] font-mono text-slate-500 hover:text-slate-700 flex items-center gap-1.5 transition-colors p-2"
                      >
                        <Trash2 size={13} /> Clear Console
                      </button>
                      
                      <button
                        onClick={handleExecuteSimulatedOrder}
                        disabled={isExecutingCommandLine}
                        className="flex items-center gap-2 bg-teal-600 hover:bg-teal-550 text-white font-bold px-6 py-2.5 rounded-lg text-sm shadow-sm active:translate-y-0.5 disabled:opacity-50 disabled:pointer-events-none transition-all"
                        id="execute_order_btn"
                      >
                        {isExecutingCommandLine ? (
                          <>
                            <RefreshCw size={15} className="animate-spin text-white" />
                            Signing & Plating...
                          </>
                        ) : (
                          <>
                            <Play size={15} fill="currentColor" className="text-white" />
                            Run Trading Bot CLI
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* BLACK TERMINAL CONSOLE SCREEN */}
                  <div className="bg-slate-950 border border-slate-900 rounded-xl overflow-hidden shadow-md flex flex-col h-[280px]">
                    <div className="bg-slate-900 px-4 py-2 border-b border-slate-950 flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Terminal size={14} className="text-teal-450" />
                        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                          stdout / Console Output
                        </span>
                      </div>
                      <div className="flex gap-1.5">
                        <div className="w-2.5 h-2.5 rounded-full bg-rose-500/75" />
                        <div className="w-2.5 h-2.5 rounded-full bg-amber-500/75" />
                        <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/75" />
                      </div>
                    </div>
                    
                    <div className="flex-1 p-4 font-mono text-xs text-slate-300 leading-relaxed overflow-y-auto select-text scrollbar-thin">
                      {terminalHistory.map((item, index) => (
                        <div
                          key={item.id}
                          className={`whitespace-pre-wrap ${
                            item.text.startsWith("\n$") 
                              ? "text-emerald-400 font-semibold" 
                              : item.text.includes("FAILED") 
                                ? "text-rose-400" 
                                : item.text.includes("SUCCESS")
                                  ? "text-teal-300 font-bold"
                                  : "text-slate-300"
                          }`}
                        >
                          {item.text}
                        </div>
                      ))}
                      {isExecutingCommandLine && (
                        <div className="text-teal-400/50 animate-pulse mt-1 font-mono">
                          $ Loading hmac cryptographic validation sequences...
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* TAB 2: INTERACTIVE PRICING CHART & OPEN ITEMS */}
              {activeTab === "chart" && (
                <motion.div
                  key="chart"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex-1 flex flex-col gap-4"
                >
                  {/* CHARTS CONTAINER with Live Active Levels */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col h-[280px] relative shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <TrendingUp size={15} className="text-teal-600" />
                        <span className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                          Real-Time Simulator Tick Board - {symbol}
                        </span>
                      </div>
                      <div className="font-mono text-xs text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded border border-teal-200 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 bg-teal-500 rounded-full animate-ping" />
                        ${marketPrices[symbol]?.toLocaleString("en-US", { minimumFractionDigits: 2 })} USDT
                      </div>
                    </div>

                    {/* RENDER CUSTOM SVG CHART SPARKLINE */}
                    <div className="flex-1 relative mt-2 bg-slate-50 rounded-lg overflow-hidden border border-slate-150 flex items-end">
                      <svg className="w-full h-full absolute inset-0 text-teal-600" viewBox="0 0 100 100" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#0d9488" stopOpacity="0.15"/>
                            <stop offset="100%" stopColor="#0d9488" stopOpacity="0.0"/>
                          </linearGradient>
                        </defs>
                        
                        {/* Render active horizontal bands representing user orders! */}
                        {activeOrders.filter(o => o.symbol === symbol).map((ord) => {
                          const history = chartHistory[symbol] || [];
                          const minHex = Math.min(...history) * 0.9995;
                          const maxHex = Math.max(...history) * 1.0005;
                          const range = maxHex - minHex;
                          
                          if (ord.price) {
                            // Calculate percentage height
                            const yPercentage = 100 - (((ord.price - minHex) / range) * 100);
                            const isStop = ord.type === "STOP_LIMIT";
                            return (
                              <svg key={ord.orderId}>
                                <line 
                                  x1="0" 
                                  y1={yPercentage} 
                                  x2="100" 
                                  y2={yPercentage} 
                                  className={isStop ? "stroke-amber-550 stroke-[0.7]" : "stroke-teal-550 stroke-[0.7]"} 
                                  strokeDasharray="2,2" 
                                />
                                <text 
                                  x="2" 
                                  y={yPercentage - 1} 
                                  className={isStop ? "fill-amber-600 font-mono text-[2.5px] font-bold" : "fill-teal-600 font-mono text-[2.5px] font-bold"}
                                >
                                  {ord.side} {ord.type}: ${ord.price}
                                </text>
                              </svg>
                            );
                          }
                          return null;
                        })}

                        {/* Chart Line Path */}
                        {(() => {
                          const history = chartHistory[symbol] || [];
                          if (history.length === 0) return null;
                          const minHex = Math.min(...history) * 0.9995;
                          const maxHex = Math.max(...history) * 1.0005;
                          const range = maxHex - minHex || 1;
                          
                          const points = history.map((val, idx) => {
                            const x = (idx / (history.length - 1)) * 100;
                            const y = 100 - (((val - minHex) / range) * 100);
                            return `${x},${y}`;
                          }).join(" ");

                          const fillPoints = `${points} 100,100 0,100`;

                          return (
                            <>
                              <path d={`M ${points}`} fill="none" className="stroke-teal-600 stroke-[1.2]" strokeLinecap="round" strokeLinejoin="round" />
                              <path d={`M ${fillPoints}`} fill="url(#chartGrad)" />
                            </>
                          );
                        })()}
                      </svg>
                      
                      <div className="absolute bottom-2 left-2 text-[10px] font-mono text-slate-405">
                        30 ticks dynamic sliding history (Update intervals: 1.5s)
                      </div>
                    </div>
                  </div>

                  {/* TWO MODULE PANELS FOR ACTIVE ITEMS */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* ACTIVE ORDERS PANEL */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                      <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3 flex items-center justify-between">
                        <span>Active Orders Book</span>
                        <span className="font-semibold text-teal-700 font-mono text-[10px] bg-slate-50 border border-slate-200 px-1.5 rounded">
                          {activeOrders.length} OPEN
                        </span>
                      </h4>
                      
                      {activeOrders.length === 0 ? (
                        <div className="text-xs p-8 text-center text-slate-400 font-mono leading-relaxed">
                          No active LIMIT or STOP_LIMIT orders placed. Configure parameters in the CLI emulator to trigger pending transactions.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto">
                          {activeOrders.map(order => (
                            <div key={order.orderId} className="bg-slate-50 border border-slate-150 rounded-lg p-2.5 text-xs flex flex-col gap-1.5 hover:bg-slate-100/40 transition-colors">
                              <div className="flex justify-between items-center">
                                <span className="font-mono text-slate-800 font-bold">{order.symbol}</span>
                                <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                  order.side === "BUY" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                                }`}>
                                  {order.side}
                                </span>
                              </div>
                              
                              <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600">
                                <div>Type: <span className="text-slate-800 font-semibold">{order.type}</span></div>
                                <div>Qty: <span className="text-slate-800 font-semibold">{order.quantity}</span></div>
                                {order.price && <div>Limit: <span className="text-teal-700 font-bold">${order.price}</span></div>}
                                {order.stopPrice && <div>Stop: <span className="text-amber-700 font-bold">${order.stopPrice}</span></div>}
                              </div>

                              <div className="flex justify-between items-center border-t border-slate-150 pt-2 mt-1">
                                <span className="text-[10px] font-mono text-slate-500 uppercase tracking-wider flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse" />
                                  {order.status === "STOP_WAITING" ? "Awaiting Trigger" : "Awaiting Fill"}
                                </span>
                                
                                <button
                                  onClick={() => handleCancelOrder(order.orderId)}
                                  className="text-[10px] bg-rose-600 hover:bg-rose-700 text-white font-mono rounded px-2 py-0.5 transition-colors shadow-sm"
                                >
                                  Cancel Order
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* OPEN SECURITIES POSITIONS */}
                    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                      <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3 flex items-center justify-between">
                        <span>Open Margin Positions</span>
                        <span className="font-semibold text-teal-700 font-mono text-[10px] bg-slate-50 border border-slate-200 px-1.5 p-0.5  rounded">
                          {openPositions.length} COLLATERALS
                        </span>
                      </h4>

                      {openPositions.length === 0 ? (
                        <div className="text-xs p-8 text-center text-slate-400 font-mono leading-relaxed">
                          No open security positions. Complete BUY or SELL market orders to trigger underlying portfolios.
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-[220px] overflow-y-auto w-full">
                          {openPositions.map(pos => {
                            const curPrice = marketPrices[pos.symbol] || pos.entryPrice;
                            
                            // Dynamic PnL calculation
                            const diff = curPrice - pos.entryPrice;
                            const pnlValue = pos.side === "LONG" 
                              ? diff * pos.quantity 
                              : -diff * pos.quantity;
                            const isPnlPositive = pnlValue >= 0;

                            return (
                              <div key={pos.symbol} className="bg-slate-50 border border-slate-150 rounded-lg p-2.5 text-xs flex flex-col gap-1.5 hover:bg-slate-100/40 transition-colors">
                                <div className="flex justify-between items-center">
                                  <span className="font-mono text-slate-800 font-bold">{pos.symbol}</span>
                                  <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded ${
                                    pos.side === "LONG" ? "bg-emerald-50 text-emerald-700 border border-emerald-100" : "bg-rose-50 text-rose-700 border border-rose-100"
                                  }`}>
                                    {pos.side} (20x)
                                  </span>
                                </div>

                                <div className="grid grid-cols-2 gap-1 text-[11px] font-mono text-slate-600">
                                  <div>Entry: <span className="text-slate-800">${pos.entryPrice}</span></div>
                                  <div>Size: <span className="text-slate-800">{pos.quantity}</span></div>
                                  <div>Margin: <span className="text-slate-800">${pos.margin}</span></div>
                                  <div className="flex items-center gap-1">
                                    PnL: 
                                    <span className={`font-bold font-mono flex items-center gap-0.5 ${isPnlPositive ? "text-emerald-600" : "text-rose-600"}`}>
                                      {isPnlPositive ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                                      ${pnlValue.toFixed(2)}
                                    </span>
                                  </div>
                                </div>

                                <div className="flex justify-end border-t border-slate-150 pt-2 mt-1">
                                  <button
                                    onClick={() => handleClosePosition(pos.symbol)}
                                    className="text-[10px] bg-white hover:bg-slate-100 text-teal-700 font-mono rounded px-2.5 py-1 flex items-center gap-1 transition-colors border border-slate-200 shadow-sm"
                                  >
                                    Close Position (Market Close)
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                  </div>

                  {/* ORDER HISTORY LIST */}
                  <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
                    <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-widest border-b border-slate-150 pb-2 mb-3 flex items-center gap-2">
                      <History size={13} className="text-slate-500" /> Historic Order Log (Simulation History)
                    </h4>
                    
                    {orderHistory.length === 0 ? (
                      <div className="text-[11px] p-4 text-center text-slate-400 font-mono">
                        No transactions registered. Completed operations register here in standard audit structures.
                      </div>
                    ) : (
                      <div className="space-y-1.5 max-h-[160px] overflow-y-auto">
                        {orderHistory.map((item, idx) => (
                          <div key={idx} className="flex flex-wrap items-center justify-between p-2 rounded bg-slate-50 border border-slate-150 text-[11px] font-mono">
                            <span className="text-slate-400">#{item.orderId}</span>
                            <span className="text-slate-800 font-semibold">{item.symbol}</span>
                            <span className={item.side === "BUY" ? "text-emerald-650 font-semibold" : "text-rose-655 font-semibold"}>{item.side}</span>
                            <span className="text-slate-600 font-bold">{item.type}</span>
                            <span className="text-slate-500">Qty: {item.quantity}</span>
                            {item.price && <span className="text-teal-700 font-bold">${item.price}</span>}
                            <span className={`text-[10px] px-1.5 rounded uppercase font-bold ${
                              item.status === "FILLED" 
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-100" 
                                : "bg-rose-50 text-rose-700 border border-rose-100"
                            }`}>
                              {item.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}

              {/* TAB 3: LIVE LOG TRACING */}
              {activeTab === "logs" && (
                <motion.div
                  key="logs"
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -5 }}
                  className="flex-1 flex flex-col gap-4"
                >
                  <div className="bg-white border border-slate-200 rounded-xl flex flex-col h-[520px] overflow-hidden shadow-sm">
                    <div className="bg-slate-50 px-4 py-3 border-b border-slate-200 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity size={15} className="text-teal-600" />
                        <h3 className="text-xs font-mono font-bold text-slate-800 uppercase tracking-wider">
                          /logs/trading.log (Activity Log Viewer)
                        </h3>
                      </div>
                      
                      <div className="flex items-center gap-2">
                        <button
                          onClick={fetchLogs}
                          disabled={isRefreshingLogs}
                          className="p-1 px-3 bg-white hover:bg-slate-100 border border-slate-200 disabled:opacity-50 text-slate-700 rounded text-[11px] font-mono flex items-center gap-1.5 transition-all"
                          id="refresh_logs_btn"
                        >
                          <RefreshCw size={12} className={isRefreshingLogs ? "animate-spin" : ""} />
                          Sync Log File
                        </button>
                        
                        <button
                          onClick={clearLogs}
                          className="p-1 px-3 bg-rose-50 border border-rose-150 hover:bg-rose-100 text-rose-650 rounded text-[11px] font-mono flex items-center gap-1.5 transition-all"
                          id="clear_logs_btn"
                        >
                          <Trash2 size={12} />
                          Reset Logs
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 p-4 bg-white font-mono text-xs text-slate-850 leading-relaxed overflow-y-auto select-text scrollbar-thin">
                      {logFileText.split("\n").map((line, idx) => {
                        if (!line.trim()) return null;
                        
                        let lineStyle = "text-slate-500";
                        if (line.includes("INFO")) lineStyle = "text-teal-700 font-medium";
                        if (line.includes("WARN")) lineStyle = "text-amber-700 font-medium";
                        if (line.includes("ERROR") || line.includes("Exception")) lineStyle = "text-rose-700 font-semibold";
                        if (line.startsWith("#")) lineStyle = "text-slate-400 font-semibold italic";

                        return (
                          <div key={idx} className={`py-0.5 hover:bg-slate-50 flex ${lineStyle}`}>
                            <span className="text-[10px] text-slate-400 select-none w-8 text-right pr-2 mr-3 font-mono border-r border-slate-200">
                              {idx + 1}
                            </span>
                            <span className="flex-1 whitespace-pre-wrap">{line}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </motion.div>
              )}



            </AnimatePresence>
          </div>
        </div>

      </div>



    </div>
  );
}
