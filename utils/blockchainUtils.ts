'use client';

import { createPublicClient, http, webSocket } from 'viem';
import { baseSepolia } from 'viem/chains';

// Define endpoints
export const REGULAR_RPC_ENDPOINT = 'https://sepolia.base.org';
export const FLASHBLOCK_RPC_ENDPOINT = 'https://sepolia-preconf.base.org';
export const FLASHBLOCK_WS_ENDPOINT = 'wss://sepolia.flashblocks.base.org/ws';

// Regular client
export const regularClient = createPublicClient({
  chain: baseSepolia,
  transport: http(REGULAR_RPC_ENDPOINT)
});

// Flashblock client
export const flashblockClient = createPublicClient({
  chain: baseSepolia,
  transport: http(FLASHBLOCK_RPC_ENDPOINT)
});

// WebSocket client for Flashblocks
export const createFlashblockWsClient = () => {
  try {
    return createPublicClient({
      chain: baseSepolia,
      transport: webSocket(FLASHBLOCK_WS_ENDPOINT, {
        name: 'Flashblock WebSocket',
        retryCount: 5,
        timeout: 10_000
      })
    });
  } catch (error) {
    console.error("Error creating WebSocket client:", error);
    // Fallback to HTTP client
    return flashblockClient;
  }
};

// Calculate speed based on position and confirmation time
export const calculateSpeed = (position: number, confirmationTime: number): number => {
  // Fixed speed values that look more realistic
  // For a car that has reached the finish line
  if (position >= 95) {
    return confirmationTime === 200 ? 200 : 100; // Flashblock: 200 mph, Regular: 100 mph
  }
  
  // For cars still on the track, scale the speed based on position
  const baseSpeed = confirmationTime === 200 ? 180 : 90; // Base speeds
  return Math.max(20, (baseSpeed * position / 100)); // Scale with a minimum value
};

// Convert milliseconds to a readable format
export const formatTime = (ms: number): string => {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  
  return `${(ms / 1000).toFixed(2)}s`;
};