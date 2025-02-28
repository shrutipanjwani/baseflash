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
// import { motion, AnimatePresence } from 'framer-motion';
import html2canvas from 'html2canvas';

export const RacingGame = () => {
  const { ready, authenticated, user, logout, login } = usePrivy();
  const { data: walletClient } = useWalletClient({ chainId: baseSepolia.id });
  const [demoMode, setDemoMode] = useState(false);
  const { sendTransactionAsync } = useSendTransaction();

  // State variables
  const [isRacing, setIsRacing] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
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
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [isGeneratingShare, setIsGeneratingShare] = useState(false);

  // Refs for cleanup
  const wsRef = useRef<WebSocket | null>(null);
  const regularIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const resultsRef = useRef<HTMLDivElement>(null);

  // Countdown effect
  useEffect(() => {
    if (countdown === null) return;
    
    if (countdown > 0) {
      // Play countdown sound
      const audio = new Audio(`/sounds/beep.mp3`);
      audio.volume = 0.5;
      audio.play().catch(err => console.log('Audio play error:', err));
      
      // Decrease countdown
      const timer = setTimeout(() => {
        setCountdown(countdown - 1);
      }, 1000);
      
      return () => clearTimeout(timer);
    }
    
    // Start the race when countdown reaches 0
    if (countdown === 0) {
      // Play start sound
      const audio = new Audio(`/sounds/start.mp3`);
      audio.volume = 0.7;
      audio.play().catch(err => console.log('Audio play error:', err));
    }
  }, [countdown]);

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

  // Toggle dark mode based on user's preference
  useEffect(() => {
    // Check if user prefers dark mode
    const darkModePreference = window.matchMedia('(prefers-color-scheme: dark)').matches;
    setIsDarkMode(darkModePreference);
    
    // Add listener for changes in system preference
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener('change', handleChange);
    
    return () => mediaQuery.removeEventListener('change', handleChange);
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
      
        // Calculate speeds
        setCarSpeeds({
          flash: calculateSpeed(newFlashPos, 200), // 200ms expected time - Lower value to avoid confusion
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
      
      // Play finish sound
      const audio = new Audio(`/sounds/finish.mp3`);
      audio.volume = 0.5;
      audio.play().catch(err => console.log('Audio play error:', err));
    }
  }, [txData, isRacing]);

  // Loading state
  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="animate-pulse text-xl text-gray-800 dark:text-white">Loading...</div>
      </div>
    );
  }

  // Generate and share results as an image
  const shareResults = async () => {
    if (!resultsRef.current) return;
    
    setIsGeneratingShare(true);
    
    try {
      // Create a canvas from the results section
      const canvas = await html2canvas(resultsRef.current, {
        backgroundColor: isDarkMode ? '#1F2937' : '#F9FAFB',
        scale: 2, // Higher quality
        logging: false
      });
      
      // Convert canvas to blob
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((blob) => {
          resolve(blob!);
        }, 'image/png');
      });
      
      // Create file from blob
      const file = new File([blob], 'flashblocks-race.png', { type: 'image/png' });
      
      // Share text
      const shareText = results?.flashIncluded
        ? `I just raced Base Flashblocks (${formatTime(results.flashTime)}) vs Regular Blocks (${formatTime(results.regularTime)}) and Flashblocks won by ${formatTime(results.diff)}! That's ${(results.regularTime / results.flashTime).toFixed(1)}x faster! #baseflash`
        : `I just tried Base Flashblocks! Not all transactions get included in Flashblocks, but when they do, they're ~10x faster than regular blocks. #baseflash`;
      
      // Use Web Share API if available
      if (navigator.share) {
        await navigator.share({
          text: shareText,
          files: [file],
          url: 'https://base.org/flashblocks'
        });
      } else {
        // Fallback for browsers that don't support sharing files
        const url = URL.createObjectURL(blob);
        
        // Open in new window
        const win = window.open();
        if (win) {
          win.document.write(`
            <html>
              <head>
                <title>Base Flashblocks Race Results</title>
              </head>
              <body style="margin: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; background: #f5f5f5; padding: 20px;">
                <p style="font-family: system-ui, sans-serif; margin-bottom: 20px; text-align: center;">${shareText}</p>
                <img src="${url}" style="max-width: 100%; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1);" />
                <p style="font-family: system-ui, sans-serif; margin-top: 20px;">Right-click the image to save it, or copy the text above to share!</p>
              </body>
            </html>
          `);
        }
      }
    } catch (error) {
      console.error('Error sharing results:', error);
      alert('There was an error generating the share image. Try again or take a screenshot instead.');
    } finally {
      setIsGeneratingShare(false);
    }
  };

  // Start the race by sending a transaction
  const startRace = async (useDemo = false) => {
    if (useDemo) {
        setDemoMode(true);
        
        // Reset everything
        setResults(null);
        setError(null);
        setTxHash("0xDemoTransaction123456789");
        
        // Reset positions and data
        setCarPositions({ flash: 0, regular: 0 });
        
        // Start countdown
        setCountdown(3);
        
        // When countdown finishes, start the race
        setTimeout(() => {
          const submittedAt = Date.now();
          
          // In demo mode, set predictable timestamps
          setTxData({
            submittedAt,
            // Flashblock confirms in ~200ms
            flashConfirmedAt: submittedAt + 200,
            // Regular block confirms in ~2s
            regularConfirmedAt: submittedAt + 2000
          });
          
          setIsRacing(true);
        }, 4000); // 3 second countdown + 1 second buffer
      } else {
        setDemoMode(false);
    
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

       // Start countdown
       setCountdown(3);
       
       // When countdown finishes, send the transaction and start race
       setTimeout(async () => {
         try {
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
         } catch (txError) {
           console.error("Error sending transaction:", txError);
           setError(`Error: ${txError instanceof Error ? txError.message : String(txError)}`);
           setCountdown(null);
         }
       }, 4000); // 3 second countdown + 1 second buffer

    } catch (error) {
      console.error("Error starting race:", error);
      setError(`Error: ${error instanceof Error ? error.message : String(error)}`);
      setIsRacing(false);
      setCountdown(null);
    }
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
        console.log("WebSocket connection established at", new Date().toISOString());
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
        console.log("WebSocket connection closed at", new Date().toISOString());
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
    <div className={`min-h-screen p-4 bg-white text-gray-900`}>
      <div className="w-full max-w-7xl mx-auto space-y-6 md:space-y-8">
        {/* Header with theme toggle and race image */}
        <div className="flex flex-col items-center">
        {authenticated && (
          <div className="flex justify-between w-full items-center mb-4">
            
            {/* Wallet status */}
            
              <div className="text-xs md:text-sm px-2 py-1 rounded-full border border-gray-400">
                {user?.wallet?.address?.slice(0, 6)}...{user?.wallet?.address?.slice(-4)}
              </div>

<button
onClick={logout}
className="text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 font-medium cursor-pointer"
>
Disconnect
</button>
          

            
          </div>
            )}
          
          <div className="w-full max-w-md mb-4">
            <img 
              src="/images/race-banner.png" 
              alt="Blue vs Red Car Race" 
              className="w-full h-auto"
            />
          </div>
          
          <h1 className="text-3xl md:text-4xl font-bold text-center bg-gradient-to-r from-blue-400 to-red-500 bg-clip-text text-transparent mb-2">
            Flash vs Regular Block Race
          </h1>
          <p className="text-sm md:text-base text-center text-gray-600 dark:text-gray-400 max-w-3xl">
            Experience the <span className="font-bold text-blue-600 dark:text-blue-400">10x speed improvement</span> of 
            Flashblocks (200ms) vs regular blocks (2s) on Base Sepolia
          </p>
        </div>
        
        {/* Wallet connection and race controls */}
        <div className="flex flex-wrap justify-center gap-4">
          {!authenticated ? (
            <button
              onClick={login}
              className="bg-blue-500 text-white font-bold py-3 px-6 rounded-lg hover:from-blue-600 hover:to-blue-800 transform hover:scale-105 transition-all shadow-md cursor-pointer"
            >
              Connect Wallet to Race
            </button>
          ) : (
            <div className="flex flex-wrap gap-4 items-center justify-center">
              <button
                onClick={() => startRace(false)}
                disabled={isRacing || countdown !== null}
                className="bg-gradient-to-r from-green-500 to-green-700 text-white font-bold py-3 px-6 rounded-lg hover:from-green-600 hover:to-green-800 disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-105 transition-all shadow-md cursor-pointer"
              >
                {isRacing ? '🏁 Race in Progress...' : countdown !== null ? `Starting in ${countdown}...` : '🚦 Start Race'}
              </button>
              
             
            </div>
          )}
        </div>
        
        {/* Error display */}
        {error && (
          <div className="bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-500 rounded-lg p-4 text-center text-red-700 dark:text-red-300">
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
            isRacing={isRacing}
            countdown={countdown}
          />
        </div>

        {/* Transaction information */}
        {txHash && (
          <div className="bg-white rounded-lg p-4">
            <div className="mt-2 grid grid-cols-2 gap-4 max-w-xl mx-auto">
                
                <span className="text-gray-600">Transaction:</span>
                
                
                {!demoMode && (
                    <a 
                    href={`https://sepolia.basescan.org/tx/${txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 underline text-sm"
                    >
                    {txHash.slice(0, 10)}...{txHash.slice(-8)} 🔗
                    </a>
                )}
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4 max-w-xl mx-auto">
              <div className="flex items-center">
                <div className={`h-3 w-3 rounded-full mr-2 ${
                  txData.flashConfirmedAt > 0 ? 'bg-green-500' : 
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
            className="bg-white rounded-xl p-6 text-black"
          >
            <h2 className="text-3xl font-bold mb-4 text-center text-black">🏆 Race Results</h2>
            
            {results.flashIncluded ? (
              <>
                <div className="grid grid-cols-2 gap-4 text-center">
                  <div className="p-4 rounded-lg border border-gray-200">
                    <p className="text-2xl text-gray-900">Flashblock</p>
                    <p className="text-xl font-mono text-gray-500">{formatTime(results.flashTime)}</p>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-200">
                    <p className="text-2xl text-gray-900">Regular Block</p>
                    <p className="text-xl font-mono text-gray-500">{formatTime(results.regularTime)}</p>
                  </div>
                </div>
                <p className="text-2xl mt-6 text-center text-gray-800">
                  Flashblock won by {formatTime(results.diff)}!
                </p>
                <p className="text-lg mt-2 text-center text-gray-800">
                  That&apos;s {(results.regularTime / results.flashTime).toFixed(1)}x faster!
                </p>
                
                {/* Share button */}
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={shareResults}
                    disabled={isGeneratingShare}
                    className="flex items-center gap-2 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-md hover:from-blue-600 hover:to-purple-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingShare ? (
                      <>
                        <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Generating...
                      </>
                    ) : (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                        </svg>
                        Share Result
                      </>
                    )}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="p-4 rounded-lg bg-yellow-100 dark:bg-yellow-900/30 mb-4">
                  <p className="text-xl text-center text-yellow-800 dark:text-yellow-300">
                    Your transaction wasn&apos;t included in a Flashblock this time.
                  </p>
                  <p className="text-sm text-center mt-2 text-gray-600 dark:text-gray-400">
                    Not all transactions get included in Flashblocks - they are a preview feature on Base Sepolia. 
                    When transactions are included, they&apos;re about 10x faster!
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-red-100 dark:bg-red-900/30">
                  <p className="text-2xl text-center text-red-700 dark:text-red-300">🚗 Regular Block</p>
                  <p className="text-xl font-mono text-center text-gray-800 dark:text-gray-200">{formatTime(results.regularTime)}</p>
                </div>
                <p className="text-lg mt-4 text-center text-blue-600 dark:text-blue-300">
                  Try again to see if your next transaction gets included in a Flashblock!
                </p>
                
                {/* Share button for not included case */}
                <div className="mt-6 flex justify-center">
                  <button
                    onClick={shareResults}
                    disabled={isGeneratingShare}
                    className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white px-4 py-2 rounded-lg shadow-md hover:from-blue-600 hover:to-purple-700 transition-all cursor-pointer disabled:opacity-50"
                  >
                    {isGeneratingShare ? 'Generating...' : 'Share My Experience'}
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        
        {/* Footer */}
        <footer className="text-center text-gray-600 dark:text-gray-400 text-sm py-4">
          <p>
          <a 
              href="https://base.org/flashblocks" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-blue-600 font-medium"
            >
              Learn more about Base Flashblocks →
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
};