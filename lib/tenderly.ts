/**
 * Tenderly Transaction Simulation Utilities
 *
 * Provides functions to simulate L2 transactions using the Tenderly API,
 * primarily used for simulating retryable ticket executions.
 */

import { L1_TIMELOCK } from "@config/arbitrum-governance";
import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@config/storage-keys";

// Arbitrum address alias offset
// When L1 contracts call L2 via retryable tickets, the msg.sender on L2 is the aliased address
const ADDRESS_ALIAS_OFFSET = BigInt(
  "0x1111000000000000000000000000000000001111"
);

// Chain ID mapping for Tenderly
const CHAIN_IDS = {
  arb1: "42161",
  nova: "42170",
  ethereum: "1",
} as const;

export interface TenderlySimulationRequest {
  network_id: string;
  from: string;
  to: string;
  input: string;
  value: string;
  gas: number;
  save: boolean;
}

export interface TenderlySimulationResponse {
  simulation: {
    id: string;
    status: boolean;
  };
  transaction?: {
    call_trace?: Array<{
      error?: string;
    }>;
  };
}

/**
 * Calculate the L2 alias of an L1 address
 * When L1 contracts send messages to L2 via retryable tickets,
 * the msg.sender on L2 is the original L1 address + ADDRESS_ALIAS_OFFSET
 */
export function calculateAddressAlias(l1Address: string): string {
  const address = BigInt(l1Address);
  const alias = (address + ADDRESS_ALIAS_OFFSET) % BigInt(2 ** 160);
  return "0x" + alias.toString(16).padStart(40, "0");
}

/**
 * Get the L2 alias of the L1 Timelock contract
 * This is the address that appears as msg.sender when the L1 Timelock
 * creates retryable tickets to execute governance actions on L2
 */
export function getL1TimelockAlias(): string {
  return calculateAddressAlias(L1_TIMELOCK.address);
}

/**
 * Get Tenderly settings from localStorage
 */
export function getTenderlySettings(): {
  org: string;
  project: string;
  accessToken: string | null;
} {
  if (typeof window === "undefined") {
    return {
      org: DEFAULT_TENDERLY_ORG,
      project: DEFAULT_TENDERLY_PROJECT,
      accessToken: null,
    };
  }

  let org = DEFAULT_TENDERLY_ORG;
  let project = DEFAULT_TENDERLY_PROJECT;
  let accessToken: string | null = null;

  try {
    const storedOrg = localStorage.getItem(STORAGE_KEYS.TENDERLY_ORG);
    if (storedOrg) {
      org = JSON.parse(storedOrg) || DEFAULT_TENDERLY_ORG;
    }
  } catch {
    // Use default
  }

  try {
    const storedProject = localStorage.getItem(STORAGE_KEYS.TENDERLY_PROJECT);
    if (storedProject) {
      project = JSON.parse(storedProject) || DEFAULT_TENDERLY_PROJECT;
    }
  } catch {
    // Use default
  }

  try {
    const storedToken = localStorage.getItem(
      STORAGE_KEYS.TENDERLY_ACCESS_TOKEN
    );
    if (storedToken) {
      accessToken = JSON.parse(storedToken) || null;
    }
  } catch {
    // No token
  }

  return { org, project, accessToken };
}

/**
 * Build the Tenderly simulation dashboard URL
 */
export function getSimulationLink(simulationId: string): string {
  const { org, project } = getTenderlySettings();
  return `https://dashboard.tenderly.co/public/${org}/${project}/simulator/${simulationId}`;
}

/**
 * Simulate a transaction using Tenderly API
 *
 * @param params.networkId - Chain ID (42161 for Arbitrum One, 42170 for Nova)
 * @param params.from - Sender address (typically L1 Timelock alias)
 * @param params.to - Target contract address
 * @param params.input - Encoded calldata
 * @param params.value - ETH value in wei (as string)
 * @returns Simulation ID on success, or throws error
 */
export async function simulateTransaction(params: {
  networkId: string;
  from: string;
  to: string;
  input: string;
  value?: string;
}): Promise<string> {
  const { org, project, accessToken } = getTenderlySettings();

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

  const requestBody: TenderlySimulationRequest = {
    network_id: params.networkId,
    from: params.from,
    to: params.to,
    input: params.input,
    value: params.value || "0",
    gas: 10000000, // 10M gas limit should be enough for most governance actions
    save: true, // Save the simulation so it can be viewed later
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  // Add access token if available
  if (accessToken) {
    headers["X-Access-Key"] = accessToken;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Tenderly API error (${response.status}): ${errorText}`);
  }

  const data = (await response.json()) as TenderlySimulationResponse;

  if (!data.simulation?.id) {
    throw new Error("No simulation ID returned from Tenderly");
  }

  return data.simulation.id;
}

/**
 * Simulate a retryable ticket execution
 *
 * @param params.l2Target - Target contract on L2
 * @param params.l2Calldata - Calldata to execute on L2
 * @param params.l2Value - ETH value to send (in wei)
 * @param params.chain - Target chain ("arb1" or "nova")
 * @returns Object with simulation ID and dashboard link
 */
export async function simulateRetryableTicket(params: {
  l2Target: string;
  l2Calldata: string;
  l2Value?: string;
  chain: "arb1" | "nova" | "unknown";
}): Promise<{ simulationId: string; link: string }> {
  // Default to Arbitrum One if chain is unknown
  const chainKey = params.chain === "unknown" ? "arb1" : params.chain;
  const networkId = CHAIN_IDS[chainKey];

  // The L1 Timelock's alias is the msg.sender for retryable ticket executions
  const fromAddress = getL1TimelockAlias();

  const simulationId = await simulateTransaction({
    networkId,
    from: fromAddress,
    to: params.l2Target,
    input: params.l2Calldata,
    value: params.l2Value,
  });

  return {
    simulationId,
    link: getSimulationLink(simulationId),
  };
}

export type ChainType = "L1" | "Arb1" | "Nova" | "unknown";

/**
 * Get the network ID for a chain type
 */
function getNetworkIdForChain(chain: ChainType): string {
  switch (chain) {
    case "L1":
      return CHAIN_IDS.ethereum;
    case "Arb1":
      return CHAIN_IDS.arb1;
    case "Nova":
      return CHAIN_IDS.nova;
    default:
      return CHAIN_IDS.arb1; // Default to Arbitrum One
  }
}

/**
 * Get the appropriate sender address for a simulation based on the chain
 * - For L1 calls: Use the L1 Timelock address directly
 * - For L2 calls (Arb1/Nova): Use the L1 Timelock alias (simulating the retryable ticket execution)
 */
function getSenderForChain(chain: ChainType): string {
  if (chain === "L1") {
    // On L1, the Timelock itself is the caller
    return L1_TIMELOCK.address;
  }
  // On L2, the aliased address is the caller (via retryable ticket)
  return getL1TimelockAlias();
}

/**
 * Simulate any governance call (L1 or L2)
 *
 * @param params.target - Target contract address
 * @param params.calldata - Encoded calldata
 * @param params.value - ETH value in wei (as string)
 * @param params.chain - Target chain ("L1", "Arb1", "Nova", or "unknown")
 * @returns Object with simulation ID and dashboard link
 */
export async function simulateCall(params: {
  target: string;
  calldata: string;
  value?: string;
  chain: ChainType;
}): Promise<{ simulationId: string; link: string }> {
  const networkId = getNetworkIdForChain(params.chain);
  const fromAddress = getSenderForChain(params.chain);

  const simulationId = await simulateTransaction({
    networkId,
    from: fromAddress,
    to: params.target,
    input: params.calldata,
    value: params.value,
  });

  return {
    simulationId,
    link: getSimulationLink(simulationId),
  };
}
