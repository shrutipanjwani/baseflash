/* eslint-disable @next/next/no-img-element */
'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect, useRef } from 'react';
import { RaceTrack } from './RaceTrack';
import { useSendTransaction, useWalletClient } from "wagmi";
import { 
  FLASHBLOCK_WS_ENDPOINT,
  calculateSpeed, 
  flashblockClient, 
  formatTime,
  regularClient
} from '@/utils/blockchainUtils';
import { baseSepolia } from 'viem/chains';
import { BlockDashboard } from './BlockDashboard';
import Image from 'next/image';

export const RacingGame = () => {
  const { ready, authenticated, user, logout, login } = usePrivy();
  const { data: walletClient } = useWalletClient({ chainId: baseSepolia.id });
  const { sendTransactionAsync } = useSendTransaction();

  // State variables
  const [isRacing, setIsRacing] = useState(false);
  const [carPositions, setCarPositions] = useState({
    flash: 0,
    regular: 0
  });
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [carSpeeds, setCarSpeeds] = useState({
    flash: 0,
    regular: 0
  });
  const [txHash, setTxHash] = useState<string | null>(null);
  const [txData, setTxData] = useState({
    submittedAt: 0,
    flashConfirmedAt: 0,
    regularConfirmedAt: 0
  });
  const [results, setResults] = useState<{
    flashTime: number;
    regularTime: number;
    diff: number;
    flashIncluded: boolean;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPendingTx, setIsPendingTx] = useState(false);

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const regularIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Cleanup websocket and intervals on component unmount
  useEffect(() => {
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (regularIntervalRef.current) {
        clearInterval(regularIntervalRef.current);
      }
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Animation loop for car positions
  useEffect(() => {
    if (!isRacing) return;

    const updatePositions = () => {
      // Get current timestamp to calculate elapsed time
      const now = Date.now();
      const elapsed = now - txData.submittedAt;
      
      // Flash position - moves quickly (completes in ~200ms)
      const newFlashPos = txData.flashConfirmedAt > 0 ? 
        100 :  // Confirmed - at finish line
        txData.flashConfirmedAt === -1 ?
        0 : // Not included in flashblock
        Math.min(95, (elapsed / 200) * 100); // Progressing - based on expected 200ms time
    
      // Regular position - moves slower (completes in ~2000ms)
      const newRegularPos = txData.regularConfirmedAt ? 
        100 : // Confirmed - at finish line
        Math.min(95, (elapsed / 2000) * 100); // Progressing - based on expected 2000ms time
      
      // Update positions
      setCarPositions({ 
        flash: newFlashPos, 
        regular: newRegularPos 
      });
    
      // Calculate speeds
      setCarSpeeds({
        flash: calculateSpeed(newFlashPos, 200),
        regular: calculateSpeed(newRegularPos, 2000)
      });
    
      // Continue animation if racing
      if (isRacing) {
        animationFrameRef.current = requestAnimationFrame(updatePositions);
      }
    };

    // Start the animation loop
    animationFrameRef.current = requestAnimationFrame(updatePositions);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isRacing, txData, carPositions]);

  // Check if race is complete when both cars reach the end or timeout
  useEffect(() => {
    const bothConfirmed = (txData.regularConfirmedAt !== 0) && 
                         ((txData.flashConfirmedAt > 0) || (txData.flashConfirmedAt === -1));
    
    if (bothConfirmed && isRacing) {
      // Race complete
      const regularTime = txData.regularConfirmedAt - txData.submittedAt;
      let flashTime = 0;
      let diff = 0;
      
      // If flash confirmation was received
      if (txData.flashConfirmedAt > 0) {
        flashTime = txData.flashConfirmedAt - txData.submittedAt;
        diff = regularTime - flashTime;
      }
      
      setResults({
        flashTime,
        regularTime,
        diff,
        flashIncluded: txData.flashConfirmedAt > 0
      });
      
      setIsRacing(false);
    }
  }, [txData, isRacing]);

  // Loading state
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="animate-pulse text-xl text-gray-800">Loading...</div>
      </div>
    );
  }


  // Send transaction and start race tracking
  const handleRaceStart = async () => {
    if (!authenticated || !walletClient) {
      setError("Please connect your wallet first");
      return;
    }

    try {
      // Reset state for a new race
      setResults(null);
      setError(null);
      setTxHash(null);
      setCarPositions({ flash: 0, regular: 0 });
      setTxData({
        submittedAt: 0,
        flashConfirmedAt: 0,
        regularConfirmedAt: 0
      });
      setIsPendingTx(true);

      console.log("Preparing transaction...");

      try {
        // Send a transaction
        const txHash = await sendTransactionAsync({
          to: "0x0000000000000000000000000000000000000000", // Zero address
          value: BigInt(0), // Zero value
          data: "0x" // No data
        });

        // Transaction sent successfully
        const submittedAt = Date.now();
        console.log(`Transaction submitted: ${txHash} at ${submittedAt}`);
        
        setTxHash(txHash);
        setTxData(prev => ({ ...prev, submittedAt }));
        setIsPendingTx(false);
        setIsRacing(true); // Start race immediately after transaction is sent
        
        // Setup monitoring for transaction confirmations
        setupFlashblockMonitoring(txHash);
        setupRegularConfirmationPolling(txHash);
      } catch (txError) {
        console.error("Error sending transaction:", txError);
        setError(`Error: ${txError instanceof Error ? txError.message : String(txError)}`);
        setIsPendingTx(false);
      }
    } catch (error) {
      console.error("Error starting race:", error);
      setError(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setIsPendingTx(false);
    }
  };

  // Set up WebSocket to listen for Flashblock confirmations
  const setupWebSocket = (txHash: string) => {
    try {
      // Close existing connection if any
      if (wsRef.current) {
        wsRef.current.close();
      }

      // Create new WebSocket connection
      const ws = new WebSocket(FLASHBLOCK_WS_ENDPOINT);
      wsRef.current = ws;

      // Set a timeout to close the WebSocket after 10 seconds if no confirmation
      const timeoutId = setTimeout(() => {
        console.log("Flashblock timeout reached after 10 seconds");
        if (wsRef.current) {
          wsRef.current.close();
        }
        
        // If we haven't received a confirmation yet, mark it as "not in flashblock"
        if (!txData.flashConfirmedAt) {
          console.log("Transaction not included in Flashblocks within timeout period");
          setTxData(prev => ({ 
            ...prev, 
            // Use a special value to indicate it wasn't in a Flashblock
            flashConfirmedAt: -1 
          }));
        }
      }, 20000); // 20 second timeout
  
      ws.onopen = () => {
        console.log("WebSocket connection established");
      };
      
      ws.onmessage = async (event) => {
        try {
          const text = await event.data.text();
          const json = JSON.parse(text);
          
          if (json && json.metadata && json.metadata.receipts) {
            const receipts = json.metadata.receipts;
            
            if (txHash in receipts) {
              console.log(`Found our transaction ${txHash} in Flashblock!`);
              
              // Calculate time based on block data if available, not when we received the message
              if (json.diff && json.diff.timestamp) {
                // Convert hex timestamp to number and multiply by 1000 for milliseconds
                const blockTimestamp = parseInt(json.diff.timestamp, 16) * 1000;
                
                // Use the block timestamp instead of current time
                setTxData(prev => ({ 
                  ...prev, 
                  flashConfirmedAt: blockTimestamp || Date.now() 
                }));
              } else {
                // Fallback to current time if block timestamp unavailable
                setTxData(prev => ({ ...prev, flashConfirmedAt: Date.now() }));
              }
              
              // Clear timeout and close WebSocket
              clearTimeout(timeoutId);
              ws.close();
            }
          }
        } catch (error) {
          console.error("Error processing WebSocket message:", error);
        }
      };
      
      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        clearTimeout(timeoutId);
      };
      
      ws.onclose = () => {
        console.log("WebSocket connection closed");
        clearTimeout(timeoutId);
      };
      
      return timeoutId;
    } catch (error) {
      console.error("Error setting up WebSocket:", error);
    }
  };

  const checkFlashblockRPC = async (txHash: string) => {
    try {
      console.log(`Checking Flashblock inclusion via RPC for ${txHash}`);
      
      const receipt = await flashblockClient.getTransactionReceipt({
        hash: txHash as `0x${string}`
      });
      
      if (receipt) {
        // Get the block to extract the timestamp
        const block = await flashblockClient.getBlock({
          blockNumber: receipt.blockNumber
        });
        
        // Use the block timestamp instead of current time
        // Convert to milliseconds (blockchain timestamps are in seconds)
        const blockTimestamp = Number(block.timestamp) * 1000;
        
        setTxData(prev => ({ 
          ...prev, 
          flashConfirmedAt: blockTimestamp
        }));
        
        return true;
      }
    } catch (error) {
      console.log("Transaction not yet in Flashblock via RPC check:", error);
    }
    
    return false;
  };

  const setupFlashblockMonitoring = (txHash: string) => {
    console.log(`Setting up Flashblock monitoring for transaction ${txHash}`);
    
    // Set up WebSocket
    const wsTimeoutId = setupWebSocket(txHash);
    
    // Also poll via RPC as a backup
    let attempts = 0;
    const maxAttempts = 20; // Try for 10 seconds (20 x 500ms)
    
    const pollInterval = setInterval(async () => {
      attempts++;
      
      // Check if transaction is confirmed via RPC
      const found = await checkFlashblockRPC(txHash);
      
      if (found || attempts >= maxAttempts) {
        clearInterval(pollInterval);
        
        // If we've reached max attempts without finding the transaction
        if (attempts >= maxAttempts && !txData.flashConfirmedAt) {
          console.log(`Transaction not included in Flashblocks after ${maxAttempts} attempts`);
          setTxData(prev => ({ ...prev, flashConfirmedAt: -1 }));
        }
      }
    }, 500);
    
    return () => {
      // Cleanup function
      clearTimeout(wsTimeoutId);
      clearInterval(pollInterval);
    };
  };

  // Set up polling to check for regular block confirmation
  const setupRegularConfirmationPolling = (txHash: string) => {
    if (regularIntervalRef.current) {
      clearInterval(regularIntervalRef.current);
    }

    regularClient.waitForTransactionReceipt({
      hash: txHash as `0x${string}`,
      timeout: 60_000, // 60 second timeout
      onReplaced: (replacement) => {
        console.log('Transaction replaced:', replacement);
      }
    })
    .then((receipt) => {
      console.log(`Regular confirmation received at ${Date.now()}ms`, receipt);
      setTxData(prev => ({ ...prev, regularConfirmedAt: Date.now() }));
    })
    .catch((error) => {
      console.error("Error waiting for transaction receipt:", error);
    });
  };

  // Determine button text based on current state
  const getButtonText = () => {
    if (isPendingTx) {
      return "Sending Transaction...";
    } else if (isRacing) {
      return "🏁 Race in Progress...";
    } else {
      return "🚦 Start Race";
    }
  };

  return (
    <div className="min-h-screen p-4 bg-white text-gray-900">
      <div className="w-full max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Header with race image */}
        <div className="flex flex-col items-center">
          {authenticated && (
            <div className="flex justify-between w-full items-center mb-4">
              {/* Wallet status */}
              <div className="text-xs md:text-sm px-2 py-1 rounded-full border border-gray-400">
                {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}
              </div>

              <button
                onClick={logout}
                className="text-gray-600 hover:text-gray-800 font-medium cursor-pointer"
              >
                Disconnect
              </button>
            </div>
          )}
          
          <div className="w-full max-w-5xl mb-4">
            <Image
              width={1000}
              height={1000}
              src="/images/race-banner.png" 
              alt="Blue vs Red Car Race" 
              className="w-full h-auto"
              unoptimized
            />
          </div>
          
          <h1 className="text-4xl md:text-5xl font-bold text-center mb-2">
            <span className="text-blue-400">Flash</span> vs <span className="text-red-400">Regular Block</span> <span className="text-gray-800">Race</span>
          </h1>
          <p className="text-sm md:text-base text-center text-gray-600 max-w-3xl">
            Experience the <span className="font-bold text-blue-400">10x speed improvement</span> of 
            Flashblocks (200ms) vs regular blocks (2s) on Base Sepolia
          </p>
        </div>
        
        {/* Wallet connection and race controls */}
        <div className="flex flex-wrap justify-center gap-4">
          {!authenticated ? (
            <button
              onClick={login}
              className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:bg-blue-600 transform hover:scale-105 transition-all shadow-md cursor-pointer"
            >
              Connect Wallet to Race
            </button>
          ) : (
            <div className="flex flex-wrap gap-4 items-center justify-center">
              <button
                onClick={handleRaceStart}
                disabled={isRacing || isPendingTx}
                className="bg-gradient-to-r from-green-500 to-green-600 text-white font-bold py-3 px-8 rounded-lg hover:from-green-600 hover:to-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md cursor-pointer transition"
              >
                {getButtonText()}
              </button>
            </div>
          )}
        </div>
        
        {/* Error display */}
        {error && (
          <div className="bg-red-100 border border-red-300 rounded-lg p-4 text-center text-red-700 max-w-3xl mx-auto">
            {error}
          </div>
        )}

        {/* Race track */}
        <div className="relative rounded-xl max-w-7xl mx-auto">
          <RaceTrack
            flashPosition={carPositions.flash}
            regularPosition={carPositions.regular}
            isRacing={isRacing}
            countdown={null}
          />
        </div>

        {/* Transaction information */}
        {txHash && (
          <div className="bg-white rounded-lg p-4 border border-gray-200 max-w-3xl mx-auto">
            <div className="mt-2 grid grid-cols-2 gap-4">
              <span className="text-gray-600 font-medium">Transaction:</span>
              <a 
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 hover:text-blue-800 underline text-sm"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)} 🔗
              </a>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4">
              <div className="flex items-center">
                <div className={`h-3 w-3 rounded-full mr-2 ${
                  txData.flashConfirmedAt > 0 ? 'bg-green-400' : 
                  txData.flashConfirmedAt === -1 ? 'bg-yellow-500' : 
                  'bg-blue-500 animate-pulse'
                }`}></div>
                <span className="text-sm text-gray-600">
                  Flashblock: {
                    txData.flashConfirmedAt > 0 ? formatTime(txData.flashConfirmedAt - txData.submittedAt) :
                    txData.flashConfirmedAt === -1 ? 'Not included' :
                    'Waiting...'
                  }
                </span>
              </div>
              <div className="flex items-center">
                <div className={`h-3 w-3 rounded-full mr-2 ${txData.regularConfirmedAt ? 'bg-green-500' : 'bg-red-500 animate-pulse'}`}></div>
                <span className="text-sm text-gray-600">
                  Regular Block: {txData.regularConfirmedAt ? formatTime(txData.regularConfirmedAt - txData.submittedAt) : 'Waiting...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
          <div 
            ref={resultsRef}
            className="bg-white rounded-xl p-6 max-w-7xl mx-auto"
          >
            <h2 className="text-lg md:text-2xl font-bold mb-6 text-left text-gray-600">🏆 Race Results</h2>
            
            {results.flashIncluded ? (
              <>
                <div className="grid grid-cols-2 gap-6 text-center">
                  <div className="p-4 rounded-lg border border-blue-100 bg-blue-50">
                    <p className="text-lg md:text-2xl font-bold text-blue-400">Flashblock</p>
                    <p className="text-xl md:text-3xl font-mono text-gray-700 mt-2">{formatTime(results.flashTime)}</p>
                  </div>
                  <div className="p-4 rounded-lg border border-red-100 bg-red-50">
                    <p className="text-lg md:text-2xl font-bold text-red-400">Regular Block</p>
                    <p className="text-xl md:text-3xl font-mono text-gray-700 mt-2">{formatTime(results.regularTime)}</p>
                  </div>
                </div>
                <p className="text-lg md:text-2xl mt-8 text-center font-semibold text-gray-800">
                  Flashblock won by {formatTime(results.diff)}
                </p>
                <p className="text-md md:text-lg mt-2 text-center text-gray-600">
                  That&apos;s {(results.regularTime / results.flashTime).toFixed(1)}x faster!
                </p>
                
              </>
            ) : (
              <>
                <div className="p-4 rounded-lg bg-yellow-50 border border-yellow-200 mb-6">
                  <p className="text-xl text-center text-yellow-700 font-medium">
                    Your transaction wasn&apos;t included in a Flashblock this time.
                  </p>
                  <p className="text-sm text-center mt-2 text-gray-600">
                    Not all transactions get included in Flashblocks - they are a preview feature on Base Sepolia. 
                    When transactions are included, they&apos;re about 10x faster!
                  </p>
                </div>
                <div className="p-4 rounded-lg border border-red-200 bg-red-50 mx-auto max-w-md">
                  <p className="text-2xl text-center text-red-600 font-bold">Regular Block</p>
                  <p className="text-3xl font-mono text-center text-gray-800 mt-2">{formatTime(results.regularTime)}</p>
                </div>
                <p className="text-lg mt-6 text-center text-blue-600">
                  Try again to see if your next transaction gets included in a Flashblock!
                </p>
                
                
              </>
            )}
          </div>
        )}

       

        {/* Block Dashboard */}
        <BlockDashboard />

         {/* Footer */}
         <footer className="text-center text-gray-600 text-sm py-8">
          <a 
            href="https://base.org/flashblocks" 
            target="_blank" 
            rel="noopener noreferrer"
            className="font-medium hover:text-blue-700 transition-colors"
          >
            Learn more about Base Flashblocks →
          </a>
        </footer>
      </div>
    </div>
  );
};