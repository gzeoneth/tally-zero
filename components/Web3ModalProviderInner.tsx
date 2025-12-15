"use client";

import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { arbitrum, type AppKitNetwork } from "@reown/appkit/networks";
import { createAppKit } from "@reown/appkit/react";
import { useEffect, useState, type ReactNode } from "react";
import { WagmiProvider, type Config } from "wagmi";

import { env } from "../env";

// Get project ID from environment
const projectId = env.NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID;

if (!projectId) {
  throw new Error("NEXT_PUBLIC_WEB3STORAGE_PROJECT_ID is not defined");
}

// Define networks - only Arbitrum One
const networks: [AppKitNetwork, ...AppKitNetwork[]] = [arbitrum];

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

export default function Web3ModalProviderInner({
  children,
}: {
  children: ReactNode;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config}>
      {children}
    </WagmiProvider>
  );
}

// Export wagmi config for use elsewhere
export const wagmiConfig = wagmiAdapter.wagmiConfig;
