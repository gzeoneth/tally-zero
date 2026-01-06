/**
 * Chain configuration type definitions
 *
 * Provides types for EVM chain metadata including RPC endpoints,
 * native currency, and block explorer configurations.
 */

/** EVM chain configuration */
export interface Chain {
  /** Human-readable chain name */
  name: string;
  /** Chain identifier string (e.g., "ETH", "ARB") */
  chain: string;
  /** Optional icon identifier */
  icon?: string;
  /** Array of RPC endpoint URLs */
  rpc: string[];
  /** Supported chain features */
  features: Feature[];
  /** Array of faucet URLs for testnets */
  faucets: string[];
  /** Native currency configuration */
  nativeCurrency: NativeCurrency;
  /** URL for chain information */
  infoURL: string;
  /** Short name identifier (e.g., "eth", "arb1") */
  shortName: string;
  /** Unique chain ID (e.g., 1 for Ethereum, 42161 for Arbitrum) */
  chainId: number;
  /** Network ID (usually same as chainId) */
  networkId: number;
  /** SLIP-44 coin type for HD wallet derivation */
  slip44: number;
  /** ENS registry configuration */
  ens?: Ens;
  /** Block explorer configurations */
  explorers: Explorer[];
  /** Optional display title */
  title?: string;
}

/** Chain feature descriptor */
interface Feature {
  /** Feature name (e.g., "EIP-1559") */
  name: string;
}

/** Native currency configuration */
interface NativeCurrency {
  /** Currency name (e.g., "Ether") */
  name: string;
  /** Currency symbol (e.g., "ETH") */
  symbol: string;
  /** Decimal places (typically 18) */
  decimals: number;
}

/** ENS registry configuration */
interface Ens {
  /** ENS registry contract address */
  registry: string;
}

/** Block explorer configuration */
interface Explorer {
  /** Explorer name (e.g., "Etherscan") */
  name: string;
  /** Explorer base URL */
  url: string;
  /** Optional icon identifier */
  icon?: string;
  /** Standard (e.g., "EIP3091") */
  standard: string;
}
