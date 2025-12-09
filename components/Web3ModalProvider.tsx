"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import {
  arbitrum,
  arbitrumNova,
  avalanche,
  bsc,
  fantom,
  mainnet,
  optimism,
  polygon,
  sepolia,
  type AppKitNetwork,
} from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { type ReactNode } from "react";
import { WagmiProvider, type Config } from "wagmi";

import { env } from "../env";

// Setup queryClient
const queryClient = new QueryClient();

// Get project ID from environment
const projectId = env.NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID is not defined");
}

// Define networks
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [
  mainnet,
  arbitrum,
  arbitrumNova,
  optimism,
  polygon,
  avalanche,
  fantom,
  bsc,
  sepolia,
];

// Metadata for your app
const metadata = {
  name: "Arbitrum Governance",
  description: "Decentralized voting platform for onchain governance",
  url: "https://zero.tally.xyz",
  icons: ["/favicon/favicon.ico"],
};

// Configure Wagmi Adapter
const wagmiAdapter = new WagmiAdapter({
  projectId,
  networks,
});

// Create modal instance
createAppKit({
  adapters: [wagmiAdapter],
  projectId,
  networks,
  defaultNetwork: arbitrum,
  metadata,
  features: {
    analytics: true,
  },
});

export function Web3ModalProvider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}

// Export wagmi config for use elsewhere
export const wagmiConfig = wagmiAdapter.wagmiConfig;
