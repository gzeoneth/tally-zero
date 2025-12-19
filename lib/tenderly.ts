import {
  L1_TIMELOCK,
  L2_CORE_TIMELOCK,
  L2_TREASURY_TIMELOCK,
} from "@config/arbitrum-governance";
import {
  DEFAULT_TENDERLY_ORG,
  DEFAULT_TENDERLY_PROJECT,
  STORAGE_KEYS,
} from "@config/storage-keys";
import { getStoredJsonString } from "@lib/storage-utils";
import { encodeAbiParameters, keccak256 } from "viem";

const ADDRESS_ALIAS_OFFSET = BigInt(
  "0x1111000000000000000000000000000000001111"
);

const CHAIN_IDS = {
  arb1: "42161",
  nova: "42170",
  ethereum: "1",
} as const;

const FUNCTION_SELECTORS = {
  schedule: "0x01d5062a",
  execute: "0x134008d3",
  scheduleBatch: "0x8f2a0bb0",
  executeBatch: "0xe38335e5",
} as const;

export interface TenderlySimulationRequest {
  network_id: string;
  from: string;
  to: string;
  input: string;
  value: string;
  gas: number;
  save: boolean;
  save_if_fails?: boolean;
  block_header?: {
    number?: string;
    timestamp: string;
  };
  state_objects?: Record<
    string,
    { balance?: string; storage?: Record<string, string> }
  >;
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
  const org = getStoredJsonString(
    STORAGE_KEYS.TENDERLY_ORG,
    DEFAULT_TENDERLY_ORG
  );
  const project = getStoredJsonString(
    STORAGE_KEYS.TENDERLY_PROJECT,
    DEFAULT_TENDERLY_PROJECT
  );
  const accessToken =
    getStoredJsonString(STORAGE_KEYS.TENDERLY_ACCESS_TOKEN, "") || null;

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
  from?: string;
}): Promise<{ simulationId: string; link: string; success: boolean }> {
  const networkId = getNetworkIdForChain(params.chain);
  const fromAddress = params.from || getSenderForChain(params.chain);

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

function hashOperationBatchOz(
  targets: `0x${string}`[],
  values: bigint[],
  calldatas: `0x${string}`[],
  predecessor: `0x${string}`,
  salt: `0x${string}`
): `0x${string}` {
  const encoded = encodeAbiParameters(
    [
      { type: "address[]" },
      { type: "uint256[]" },
      { type: "bytes[]" },
      { type: "bytes32" },
      { type: "bytes32" },
    ],
    [targets, values, calldatas, predecessor, salt]
  );
  return keccak256(encoded);
}

interface StorageEncodingResponse {
  stateOverrides: Record<string, { value: Record<string, string> }>;
}

async function encodeStorageOverrides(
  networkId: string,
  contractAddress: string,
  storageObj: Record<string, string>
): Promise<Record<string, string>> {
  const { org, project, accessToken } = getTenderlySettings();

  if (!accessToken) {
    throw new Error("Tenderly access token required for storage encoding");
  }

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/contracts/encode-states`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": accessToken,
    },
    body: JSON.stringify({
      networkID: networkId,
      stateOverrides: {
        [contractAddress]: { value: storageObj },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Tenderly encode API error (${response.status}): ${errorText}`
    );
  }

  const data = (await response.json()) as StorageEncodingResponse;
  return data.stateOverrides[contractAddress.toLowerCase()].value;
}

function getTimelockConfig(timelockAddress: string): {
  networkId: string;
  fromAddress: string;
} {
  const addr = timelockAddress.toLowerCase();

  if (addr === L1_TIMELOCK.address.toLowerCase()) {
    return { networkId: CHAIN_IDS.ethereum, fromAddress: L1_TIMELOCK.address };
  }
  if (addr === L2_CORE_TIMELOCK.address.toLowerCase()) {
    return { networkId: CHAIN_IDS.arb1, fromAddress: L2_CORE_TIMELOCK.address };
  }
  if (addr === L2_TREASURY_TIMELOCK.address.toLowerCase()) {
    return {
      networkId: CHAIN_IDS.arb1,
      fromAddress: L2_TREASURY_TIMELOCK.address,
    };
  }

  // Default to L1 for unknown timelocks
  return { networkId: CHAIN_IDS.ethereum, fromAddress: timelockAddress };
}

export async function simulateTimelockBatch(params: {
  timelockAddress: string;
  calldata: string;
  networkId?: string;
}): Promise<{ simulationId: string; link: string; success: boolean }> {
  const { org, project, accessToken } = getTenderlySettings();

  if (!accessToken) {
    throw new Error("Tenderly access token required for timelock simulation");
  }

  const calldata = params.calldata;
  const isScheduleBatch = calldata.startsWith(FUNCTION_SELECTORS.scheduleBatch);
  const isSchedule = calldata.startsWith(FUNCTION_SELECTORS.schedule);

  if (!isScheduleBatch && !isSchedule) {
    throw new Error("Calldata must be a schedule or scheduleBatch call");
  }

  const executeBatchCalldata = calldata
    .replace(FUNCTION_SELECTORS.schedule, FUNCTION_SELECTORS.execute)
    .replace(FUNCTION_SELECTORS.scheduleBatch, FUNCTION_SELECTORS.executeBatch);

  const decoded = decodeScheduleBatchCalldata(calldata);
  const operationId = hashOperationBatchOz(
    decoded.targets,
    decoded.values,
    decoded.calldatas,
    decoded.predecessor,
    decoded.salt
  );

  const simTimestamp = Math.floor(Date.now() / 1000) + 1;
  const storageObj: Record<string, string> = {
    [`_timestamps[${operationId}]`]: simTimestamp.toString(),
  };

  const timelockConfig = getTimelockConfig(params.timelockAddress);
  const networkId = params.networkId || timelockConfig.networkId;
  const fromAddress = timelockConfig.fromAddress;

  const encodedStorage = await encodeStorageOverrides(
    networkId,
    params.timelockAddress,
    storageObj
  );

  const endpoint = `https://api.tenderly.co/api/v1/account/${org}/project/${project}/simulate`;

  const requestBody: TenderlySimulationRequest = {
    network_id: networkId,
    from: fromAddress,
    to: params.timelockAddress,
    input: executeBatchCalldata,
    value: "1000000000000000",
    gas: 30000000,
    save: true,
    save_if_fails: true,
    block_header: {
      timestamp: "0x" + simTimestamp.toString(16),
    },
    state_objects: {
      [fromAddress]: { balance: "1000000000000000" },
      [params.timelockAddress]: { storage: encodedStorage },
    },
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Access-Key": accessToken,
    },
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
    link: getSimulationLink(data.simulation.id),
    success: data.simulation.status,
  };
}

function decodeScheduleBatchCalldata(calldata: string): {
  targets: `0x${string}`[];
  values: bigint[];
  calldatas: `0x${string}`[];
  predecessor: `0x${string}`;
  salt: `0x${string}`;
} {
  const data = calldata.slice(10);

  const getWord = (offset: number) => data.slice(offset * 2, (offset + 32) * 2);
  const getNumber = (offset: number) => parseInt(getWord(offset), 16);

  const targetsOffset = getNumber(0);
  const valuesOffset = getNumber(32);
  const calldatasOffset = getNumber(64);
  const predecessor = ("0x" + getWord(96)) as `0x${string}`;
  const salt = ("0x" + getWord(128)) as `0x${string}`;

  const targetsLen = getNumber(targetsOffset);
  const targets: `0x${string}`[] = [];
  for (let i = 0; i < targetsLen; i++) {
    targets.push(
      ("0x" + getWord(targetsOffset + 32 + i * 32).slice(24)) as `0x${string}`
    );
  }

  const valuesLen = getNumber(valuesOffset);
  const values: bigint[] = [];
  for (let i = 0; i < valuesLen; i++) {
    values.push(BigInt("0x" + getWord(valuesOffset + 32 + i * 32)));
  }

  const calldatasLen = getNumber(calldatasOffset);
  const calldatas: `0x${string}`[] = [];
  const calldatasBase = calldatasOffset + 32;
  for (let i = 0; i < calldatasLen; i++) {
    const itemOffset = calldatasBase + getNumber(calldatasBase + i * 32);
    const itemLen = getNumber(itemOffset);
    const itemData = data.slice(
      (itemOffset + 32) * 2,
      (itemOffset + 32 + itemLen) * 2
    );
    calldatas.push(("0x" + itemData) as `0x${string}`);
  }

  return { targets, values, calldatas, predecessor, salt };
}
