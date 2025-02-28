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

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const regularIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);

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
        const newFlashPos = txData.flashConfirmedAt ? 
          100 :  // Confirmed - at finish line
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
      
        // Calculate speeds using the new position values directly
        setCarSpeeds({
          flash: calculateSpeed(newFlashPos, 200), // 200ms expected time
          regular: calculateSpeed(newRegularPos, 2000)  // 2000ms expected time
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
    const bothConfirmed = (txData.flashConfirmedAt !== 0 && txData.regularConfirmedAt !== 0);
    const flashFailed = txData.flashConfirmedAt === -1; // Special value for "not in flashblock"
    
    if ((bothConfirmed || flashFailed) && isRacing) {
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-xl text-white">Loading...</div>
      </div>
    );
  }

  // Start the race by sending a transaction
  const startRace = async () => {
    if (!authenticated || !walletClient) {
      setError("Please connect your wallet first");
      return;
    }

    try {
      
      setResults(null);
      setError(null);
      setTxHash(null);
      
       // Reset positions and data
       setCarPositions({ flash: 0, regular: 0 });
       setTxData({
         submittedAt: 0,
         flashConfirmedAt: 0,
         regularConfirmedAt: 0
       });

       console.log("Preparing race...");

       // Send a transaction
       const txHash = await sendTransactionAsync({
         to: "0x0000000000000000000000000000000000000000", // Zero address
         value: BigInt(0), // Zero value
         data: "0x" // No data
       });


      // NOW start racing after transaction is sent
      const submittedAt = Date.now();
      console.log(`Transaction submitted: ${txHash} at ${submittedAt}`);
      
      setTxHash(txHash);
      setTxData(prev => ({ ...prev, submittedAt }));
      setIsRacing(true); // Start the race AFTER transaction is submitted

      // Set up monitoring for both flash and regular confirmations
      setupFlashblockMonitoring(txHash);
      setupRegularConfirmationPolling(txHash);

    } catch (error) {
      console.error("Error starting race:", error);
      setError(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setIsRacing(false);
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
      }, 10000); // 10 second timeout
  
      ws.onopen = () => {
        console.log("WebSocket connection established");
      };
      
      ws.onmessage = async (event) => {
        try {
          const text = await event.data.text();
          let json;
          
          try {
            json = JSON.parse(text);
          } catch (parseError) {
            console.error("Error parsing WebSocket message:", parseError);
            return;
          }
          
          // Log metadata for debugging
          if (json && json.metadata) {
            console.log(`Received block ${json.metadata.block_number}, index ${json.index}`);
          }
          
          // Check if metadata and receipts exist
          if (json && json.metadata && json.metadata.receipts) {
            const receipts = json.metadata.receipts;
            
            // Log receipt keys
            console.log("Receipt keys:", Object.keys(receipts));
            
            // Check if our transaction hash is in the receipts
            if (txHash in receipts) {
              console.log(`Found our transaction ${txHash} in Flashblock!`);
              setTxData(prev => ({ ...prev, flashConfirmedAt: Date.now() }));
              
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
        console.log("Transaction confirmed in Flashblock via RPC:", receipt);
        setTxData(prev => ({ ...prev, flashConfirmedAt: Date.now() }));
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
        if (attempts >= maxAttempts && !found && !txData.flashConfirmedAt) {
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

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center text-white">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center bg-gradient-to-r from-yellow-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
          ⚡ Flash vs Regular Block Race 🏎️
        </h1>
        
        {/* Wallet connection and race controls */}
        <div className="flex justify-center gap-4">
          {!authenticated ? (
            <button
              onClick={login}
              className="bg-gradient-to-r from-blue-600 to-blue-800 text-white font-bold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-blue-900 transform hover:scale-105 transition-all"
            >
              Connect Wallet to Race
            </button>
          ) : (
            <div className="flex gap-4 items-center">
              <span className="text-gray-400 text-sm">
                Connected: {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}
              </span>
              <button
                onClick={startRace}
                disabled={isRacing}
                className="bg-gradient-to-r from-green-600 to-green-800 text-white font-bold py-3 px-6 rounded-lg hover:from-green-700 hover:to-green-900 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all"
              >
                {isRacing ? '🏁 Race in Progress...' : '🚦 Start Race'}
              </button>
              <button
                onClick={logout}
                className="text-gray-400 hover:text-gray-300 font-medium"
              >
                Disconnect
              </button>
            </div>
          )}
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-900/30 border border-red-500 rounded-lg p-4 text-center text-red-300">
            {error}
          </div>
        )}

        {/* Race track */}
        <div className="relative rounded-xl">
          <RaceTrack
            flashPosition={carPositions.flash}
            regularPosition={carPositions.regular}
            flashSpeed={carSpeeds.flash}
            regularSpeed={carSpeeds.regular}
          />
        </div>

        {/* Transaction information */}
        {txHash && (
          <div className="bg-gray-800/50 rounded-lg p-4 border border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-gray-300">Transaction:</span>
              <a 
                href={`https://sepolia.basescan.org/tx/${txHash}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:text-blue-300 underline text-sm"
              >
                {txHash.slice(0, 10)}...{txHash.slice(-8)} 🔗
              </a>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4">
              <div className="flex items-center">
                <div className={`h-2 w-2 rounded-full mr-2 ${txData.flashConfirmedAt ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></div>
                <span className="text-sm">
                  Flashblock: {txData.flashConfirmedAt ? formatTime(txData.flashConfirmedAt - txData.submittedAt) : 'Waiting...'}
                </span>
              </div>
              <div className="flex items-center">
                <div className={`h-2 w-2 rounded-full mr-2 ${txData.regularConfirmedAt ? 'bg-green-500' : 'bg-yellow-500 animate-pulse'}`}></div>
                <span className="text-sm">
                  Regular Block: {txData.regularConfirmedAt ? formatTime(txData.regularConfirmedAt - txData.submittedAt) : 'Waiting...'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        {results && (
  <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 backdrop-blur-sm border border-purple-500/20">
    <h2 className="text-3xl font-bold mb-4 text-center">🏆 Race Results</h2>
    
    {results.flashIncluded ? (
      <>
        <div className="grid grid-cols-2 gap-4 text-center">
          <div className="p-4 rounded-lg bg-blue-400/10">
            <p className="text-2xl">⚡ Flashblock</p>
            <p className="text-xl font-mono">{formatTime(results.flashTime)}</p>
          </div>
          <div className="p-4 rounded-lg bg-red-400/10">
            <p className="text-2xl">🚗 Regular Block</p>
            <p className="text-xl font-mono">{formatTime(results.regularTime)}</p>
          </div>
        </div>
        <p className="text-2xl mt-6 text-center text-green-400">
          Flashblock won by {formatTime(results.diff)}!
        </p>
        <p className="text-lg mt-2 text-center text-blue-300">
          That&apos;s {(results.regularTime / results.flashTime).toFixed(1)}x faster!
        </p>
      </>
    ) : (
      <>
        <div className="p-4 rounded-lg bg-yellow-400/10 mb-4">
          <p className="text-xl text-center">
            Your transaction wasn&apos;t included in a Flashblock this time.
          </p>
          <p className="text-sm text-center mt-2 text-gray-400">
            Not all transactions get included in Flashblocks - they are a preview feature on Base Sepolia. 
            When transactions are included, they&apos;re about 10x faster!
          </p>
        </div>
        <div className="p-4 rounded-lg bg-red-400/10">
          <p className="text-2xl text-center">🚗 Regular Block</p>
          <p className="text-xl font-mono text-center">{formatTime(results.regularTime)}</p>
        </div>
        <p className="text-lg mt-4 text-center text-blue-300">
          Try again to see if your next transaction gets included in a Flashblock!
        </p>
      </>
    )}
  </div>
)}
      </div>
    </div>
  );
};