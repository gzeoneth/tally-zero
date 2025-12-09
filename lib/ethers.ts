import { ethers } from "ethers";
import { type PublicClient } from "viem";

// Convert Viem PublicClient to Ethers Provider
export function publicClientToProvider(publicClient: PublicClient) {
  const { chain, transport } = publicClient;

  if (!chain) {
    throw new Error("Chain is required");
  }

  const network = {
    chainId: chain.id,
    name: chain.name,
    ensAddress: chain.contracts?.ensRegistry?.address,
  };

  if (transport.type === "fallback") {
    return new ethers.providers.FallbackProvider(
      (transport.transports as { value?: { url?: string } }[]).map(
        ({ value }) => new ethers.providers.JsonRpcProvider(value?.url, network)
      )
    );
  }

  // Get the URL from the transport
  const url = (transport as { url?: string }).url;

  return new ethers.providers.JsonRpcProvider(url, network);
}
