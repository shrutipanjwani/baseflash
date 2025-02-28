"use client";

import React from "react";
import { PrivyProvider } from "@privy-io/react-auth";
import { baseSepolia } from "viem/chains";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { http } from "viem";
import { WagmiProvider, createConfig } from "@privy-io/wagmi";
import "./globals.css";

export const wagmiConfig = createConfig({
    chains: [baseSepolia],
    transports: {
      [baseSepolia.id]: http(),
    },
  });

export function Providers({ children }: { children: React.ReactNode }) {
    const PRIVY_APP_ID = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

    if (!PRIVY_APP_ID) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            <p>Error: NEXT_PUBLIC_PRIVY_APP_ID is not set in .env.local</p>
            <p className="text-sm">Please add your Privy App ID to .env.local file</p>
          </div>
        </div>
      );
    }

    const queryClient = new QueryClient();

  return (
    <PrivyProvider
      appId={PRIVY_APP_ID}
      config={{
        loginMethods: ["wallet"],
        supportedChains: [baseSepolia],
        appearance: {
          theme: "#0e1016",
          accentColor: "#0055FF",
          // logo: "/images/logo_white.png",
          walletList: ["coinbase_wallet", "metamask", "rainbow"],
        },
        defaultChain: baseSepolia,
      }}
    >
    <QueryClientProvider client={queryClient}>
    <WagmiProvider config={wagmiConfig} reconnectOnMount={false}>
    {children}
      </WagmiProvider>
    </QueryClientProvider>
    </PrivyProvider>
  );
}