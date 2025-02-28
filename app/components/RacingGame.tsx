'use client';

import { usePrivy } from '@privy-io/react-auth';
import { useState, useEffect } from 'react';
import { RaceTrack } from './RaceTrack';

export const RacingGame = () => {
  const { ready, authenticated, logout, login } = usePrivy();
  const [isRacing, setIsRacing] = useState(false);
  const [carPositions, setCarPositions] = useState({
    flash: 0,
    regular: 0
  });
  const [results, setResults] = useState<{
    flashTime: number;
    regularTime: number;
    diff: number;
  } | null>(null);

  useEffect(() => {
    if (!isRacing) {
      setCarPositions({ flash: 0, regular: 0 });
      return;
    }

    const flashInterval = setInterval(() => {
      setCarPositions(prev => {
        const newFlash = Math.min(prev.flash + 2, 100);
        // Check if race is complete
        if (newFlash >= 100 && prev.regular >= 100) {
          clearInterval(flashInterval);
          clearInterval(regularInterval);
          setResults({
            flashTime: 200,
            regularTime: 2000,
            diff: 1800
          });
          setIsRacing(false);
        }
        return { ...prev, flash: newFlash };
      });
    }, 20);

    const regularInterval = setInterval(() => {
      setCarPositions(prev => {
        const newRegular = Math.min(prev.regular + 0.2, 100);
        // Check if race is complete
        if (prev.flash >= 100 && newRegular >= 100) {
          clearInterval(flashInterval);
          clearInterval(regularInterval);
          setResults({
            flashTime: 200,
            regularTime: 2000,
            diff: 1800
          });
          setIsRacing(false);
        }
        return { ...prev, regular: newRegular };
      });
    }, 20);

    return () => {
      clearInterval(flashInterval);
      clearInterval(regularInterval);
    };
  }, [isRacing]); // Now we only depend on isRacing

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-xl text-white">Loading...</div>
      </div>
    );
  }

  const startRace = async () => {
    if (!authenticated) return;
    setIsRacing(true);
    setResults(null);
  };

  return (
    <div className="min-h-screen p-4 flex flex-col items-center justify-center text-white">
      <div className="w-full max-w-4xl mx-auto space-y-8">
        <h1 className="text-4xl font-bold text-center bg-gradient-to-r from-yellow-400 via-blue-500 to-purple-600 bg-clip-text text-transparent">
          ⚡ Flash vs Regular Block Race 🏎️
        </h1>
        
        <div className="flex justify-center gap-4">
          {!authenticated ? (
            <button
              onClick={login}
              className="bg-gradient-to-r from-blue-600 to-blue-800 text-white font-bold py-3 px-6 rounded-lg hover:from-blue-700 hover:to-blue-900 transform hover:scale-105 transition-all"
            >
              Connect Wallet to Race
            </button>
          ) : (
            <div className="flex gap-4">
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

        <div className="relative rounded-xl overflow-hidden border-2 border-gray-800 bg-black/50 backdrop-blur-sm">
          <RaceTrack
            flashPosition={carPositions.flash}
            regularPosition={carPositions.regular}
          />
        </div>

        {results && (
          <div className="bg-gradient-to-r from-purple-900/50 to-blue-900/50 rounded-xl p-6 backdrop-blur-sm border border-purple-500/20">
            <h2 className="text-3xl font-bold mb-4 text-center">🏆 Race Results</h2>
            <div className="grid grid-cols-2 gap-4 text-center">
              <div className="p-4 rounded-lg bg-yellow-400/10">
                <p className="text-2xl">⚡ Flashblock</p>
                <p className="text-xl font-mono">{results.flashTime}ms</p>
              </div>
              <div className="p-4 rounded-lg bg-blue-400/10">
                <p className="text-2xl">🚗 Regular Block</p>
                <p className="text-xl font-mono">{results.regularTime}ms</p>
              </div>
            </div>
            <p className="text-2xl mt-6 text-center text-green-400">
              Flashblock won by {(results.diff / 1000).toFixed(2)}s!
            </p>
          </div>
        )}
      </div>
    </div>
  );
}; 