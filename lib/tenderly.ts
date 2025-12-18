import { L1_TIMELOCK } from "@config/arbitrum-governance";
import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@config/storage-keys";

const ADDRESS_ALIAS_OFFSET = BigInt(
  "0x1111000000000000000000000000000000001111"
);

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

export function calculateAddressAlias(l1Address: string): string {
  const address = BigInt(l1Address);
  const alias = (address + ADDRESS_ALIAS_OFFSET) % BigInt(2 ** 160);
  return "0x" + alias.toString(16).padStart(40, "0");
}

export function getL1TimelockAlias(): string {
  return calculateAddressAlias(L1_TIMELOCK.address);
}

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

export function getSimulationLink(simulationId: string): string {
  const { org, project } = getTenderlySettings();
  return `https://dashboard.tenderly.co/public/${org}/${project}/simulator/${simulationId}`;
}

export interface SimulationResult {
  simulationId: string;
  success: boolean;
}

export async function simulateTransaction(params: {
  networkId: string;
  from: string;
  to: string;
  input: string;
  value?: string;
}): Promise<SimulationResult> {
  const { org, project, accessToken } = getTenderlySettings();

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

  const requestBody: TenderlySimulationRequest = {
    network_id: params.networkId,
    from: params.from,
    to: params.to,
    input: params.input,
    value: params.value || "0",
    gas: 10000000,
    save: true,
  };

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

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

  return {
    simulationId: data.simulation.id,
    success: data.simulation.status,
  };
}

export async function simulateRetryableTicket(params: {
  l2Target: string;
  l2Calldata: string;
  l2Value?: string;
  chain: "arb1" | "nova" | "unknown";
}): Promise<{ simulationId: string; link: string; success: boolean }> {
  const chainKey = params.chain === "unknown" ? "arb1" : params.chain;
  const networkId = CHAIN_IDS[chainKey];
  const fromAddress = getL1TimelockAlias();

  const result = await simulateTransaction({
    networkId,
    from: fromAddress,
    to: params.l2Target,
    input: params.l2Calldata,
    value: params.l2Value,
  });

  return {
    simulationId: result.simulationId,
    link: getSimulationLink(result.simulationId),
    success: result.success,
  };
}

export type ChainType = "L1" | "Arb1" | "Nova" | "unknown";

function getNetworkIdForChain(chain: ChainType): string {
  switch (chain) {
    case "L1":
      return CHAIN_IDS.ethereum;
    case "Arb1":
      return CHAIN_IDS.arb1;
    case "Nova":
      return CHAIN_IDS.nova;
    default:
      return CHAIN_IDS.arb1;
  }
}

function getSenderForChain(chain: ChainType): string {
  if (chain === "L1") {
    return L1_TIMELOCK.address;
  }
  return getL1TimelockAlias();
}

export async function simulateCall(params: {
  target: string;
  calldata: string;
  value?: string;
  chain: ChainType;
}): Promise<{ simulationId: string; link: string; success: boolean }> {
  const networkId = getNetworkIdForChain(params.chain);
  const fromAddress = getSenderForChain(params.chain);

  const result = await simulateTransaction({
    networkId,
    from: fromAddress,
    to: params.target,
    input: params.calldata,
    value: params.value,
  });

  return {
    simulationId: result.simulationId,
    link: getSimulationLink(result.simulationId),
    success: result.success,
  };
}
