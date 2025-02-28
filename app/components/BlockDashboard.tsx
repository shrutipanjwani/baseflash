'use client';

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import useWebSocket from "react-use-websocket";
import { FLASHBLOCK_WS_ENDPOINT } from "@/utils/blockchainUtils";

interface Block {
  blockNumber: number;
  timestamp: number;
  childNumber?: number;
  id: string;
}

// Speed comparison component
function SpeedComparison({ baseMessages, flashbotMessages }: { baseMessages: number; flashbotMessages: number }) {
  const ratio = flashbotMessages > 0 && baseMessages > 0 
    ? (flashbotMessages / baseMessages).toFixed(1) 
    : null;
  
  const intensity = ratio ? Math.min(100, (Number(ratio) - 1) * 20) : 0;
  const baseWidth = 20;
  const flashWidth = ratio ? Math.min(80, baseWidth * Number(ratio)) : 0;
  
  return (
    <motion.div 
      className="mt-4 p-4 rounded-lg border border-gray-300"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.7 }}
    >
      <h3 className="text-sm sm:text-base font-semibold text-gray-600 mb-2">Speed Comparison</h3>
      
      {ratio ? (
        <div className="flex flex-col items-center">
          <div className="relative w-full h-16 mb-3">
            <div className="flex items-center justify-center h-full">
              <div className="flex w-full gap-4 items-center">
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-xs font-mono text-blue-400 mb-1">Fullblocks</span>
                  <motion.div 
                    className="h-6 bg-blue-500/70 rounded-md flex items-center justify-center"
                    style={{ width: `${baseWidth}%` }}
                    animate={{ width: `${baseWidth}%` }}
                    transition={{ duration: 0.5 }}
                  >
                    <span className="text-xs font-mono text-white px-2">1x</span>
                  </motion.div>
                </div>
                
                <div className="flex-1 flex flex-col items-center">
                  <span className="text-xs font-mono text-green-400 mb-1">Flashblocks</span>
                  <motion.div 
                    className="h-6 bg-green-500/70 rounded-md flex items-center justify-center"
                    style={{ width: `${baseWidth}%` }}
                    animate={{ width: `${flashWidth}%` }}
                    transition={{ duration: 0.5 }}
                  >
                    <span className="text-xs font-mono text-white px-2">{ratio}x</span>
                  </motion.div>
                </div>
              </div>
            </div>
          </div>
          
          <motion.p
            initial={{ scale: 1 }}
            animate={{ 
              scale: [1, 1.05, 1],
              color: `rgb(${Math.min(255, 74 + intensity)}, ${Math.min(255, 222 + intensity/5)}, ${Math.min(255, 74 + intensity/5)})`
            }}
            transition={{ 
              scale: { repeat: Infinity, repeatType: "reverse", duration: 2 },
              color: { duration: 0.5 }
            }}
            className="font-semibold text-base text-gray-600 sm:text-lg md:text-xl"
          >
            {ratio}x faster
          </motion.p>
          
          <p className="mt-2 text-xs text-gray-400">
            Flashblocks (~200ms) vs Base Fullblocks (~2s)
          </p>
        </div>
      ) : (
        <div className="flex justify-center items-center h-16">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
            className="w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full"
          />
          <span className="ml-3 text-gray-400">Calculating...</span>
        </div>
      )}
    </motion.div>
  );
}

export function BlockDashboard() {
  const [baseMessages, setBaseMessages] = useState(0);
  const [flashbotMessages, setFlashbotMessages] = useState(0);
  const [baseBlockHistory, setBaseBlockHistory] = useState<Block[]>([]);
  const [flashbotBlockHistory, setFlashbotBlockHistory] = useState<Block[]>([]);
  const MAX_HISTORY = 5;
  
  const maxCount = useMemo(() => Math.max(100, Math.max(baseMessages, flashbotMessages) * 1.2), [baseMessages, flashbotMessages]);
  
  // Base Sepolia WebSocket
  const baseSocket = useWebSocket('wss://base-sepolia-rpc.publicnode.com', {
    onOpen: () => {
      console.log("Base Sepolia WebSocket connected");
      baseSocket.sendJsonMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_subscribe",
        params: ["newHeads"]
      });
    },
    onMessage: async (event) => {
      setBaseMessages(prev => prev + 1);
      
      try {
        // Handle binary data
        let messageData = event.data;
        if (event.data instanceof Blob) {
          messageData = await event.data.text();
        }
        
        const data = JSON.parse(messageData);
        if (data.params?.result) {
          const block = data.params.result;
          const newBlock: Block = {
            blockNumber: parseInt(block.number, 16),
            timestamp: parseInt(block.timestamp, 16),
            id: `base-${block.number}-${Date.now()}`
          };
          setBaseBlockHistory(prev => [newBlock, ...prev].slice(0, MAX_HISTORY));
        }
      } catch (error) {
        console.error("Error processing base message:", error);
      }
    },
    shouldReconnect: () => true,
  });
  
  // Flashblocks WebSocket
  const flashbotSocket = useWebSocket(FLASHBLOCK_WS_ENDPOINT, {
    onOpen: () => {
      console.log("Flashblocks WebSocket connected");
      flashbotSocket.sendJsonMessage({
        jsonrpc: "2.0",
        id: 1,
        method: "eth_subscribe",
        params: ["newHeads"]
      });
    },
    onMessage: async (event) => {
      setFlashbotMessages(prev => prev + 1);
      
      try {
        // Handle binary data
        let messageData = event.data;
        if (event.data instanceof Blob) {
          messageData = await event.data.text();
        }
        
        const data = JSON.parse(messageData);
        if (data.params?.result) {
          const block = data.params.result;
          const newBlock: Block = {
            blockNumber: parseInt(block.number, 16),
            timestamp: parseInt(block.timestamp, 16),
            childNumber: 0,
            id: `flashbot-${block.number}-${Date.now()}`
          };
          setFlashbotBlockHistory(prev => [newBlock, ...prev].slice(0, MAX_HISTORY));
        }
      } catch (error) {
        console.error("Error processing flashbot message:", error);
      }
    },
    shouldReconnect: () => true,
  });

  return (
    <div className="w-full max-w-7xl mx-auto mt-8 p-6 rounded-xl">
      <h2 className="text-2xl font-bold text-gray-600 mb-6">Real-time</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Base Blocks */}
        <div className="border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-blue-400">Regular Blocks (~2s)</h3>
            <span className="text-xl font-mono font-bold text-blue-300">
              {baseMessages.toLocaleString()}
            </span>
          </div>
          
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
            <motion.div 
              className="h-full bg-blue-500 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${(baseMessages / maxCount) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 flex-nowrap">
              <AnimatePresence>
                {baseBlockHistory.map((block) => (
                  <motion.div 
                    key={block.id}
                    className="bg-blue-900/100 text-blue-200 px-3 py-2 rounded-md flex items-center text-xs whitespace-nowrap"
                    initial={{ opacity: 0, scale: 0.9, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="font-mono">#{block.blockNumber.toLocaleString()}</span>
                    <span className="mx-2 text-blue-400">•</span>
                    <span className="font-mono">{new Date(block.timestamp * 1000).toLocaleTimeString()}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Flashblocks */}
        <div className="border border-gray-300 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-green-400">Flashblocks (~200ms)</h3>
            <span className="text-xl font-mono font-bold text-green-300">
              {flashbotMessages.toLocaleString()}
            </span>
          </div>
          
          <div className="h-2 bg-gray-700 rounded-full overflow-hidden mb-4">
            <motion.div 
              className="h-full bg-green-400 rounded-full"
              initial={{ width: '0%' }}
              animate={{ width: `${(flashbotMessages / maxCount) * 100}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          
          <div className="overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 flex-nowrap">
              <AnimatePresence>
                {flashbotBlockHistory.map((block) => (
                  <motion.div 
                    key={block.id}
                    className="bg-green-900/50 text-green-200 px-3 py-2 rounded-md flex items-center text-xs whitespace-nowrap"
                    initial={{ opacity: 0, scale: 0.9, x: -10 }}
                    animate={{ opacity: 1, scale: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.9, x: 10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="font-mono">#{block.blockNumber.toLocaleString()}</span>
                    <span className="mx-2 text-green-400">•</span>
                    <span className="font-mono">{new Date(block.timestamp * 1000).toLocaleTimeString()}</span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </div>

      {/* Speed Comparison */}
      <SpeedComparison baseMessages={baseMessages} flashbotMessages={flashbotMessages} />
    </div>
  );
} 