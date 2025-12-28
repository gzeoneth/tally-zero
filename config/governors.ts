import type { StageType } from "@/types/proposal-stage";

export type GovernorType = "core" | "treasury";

export interface GovernorConfig {
  address: string;
  type: GovernorType;
  name: string;
  description: string;
  quorum: string;
  l2TimelockAddress: string;
  l2TimelockDelay: string;
  l1TimelockAddress: string | null;
  l1TimelockDelay: string | null;
  hasL1Timelock: boolean;
  finalStage: StageType;
}

const CORE_GOVERNOR_CONFIG: GovernorConfig = {
  address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
  type: "core",
  name: "Core Governor",
  description: "Constitutional and non-emergency proposals",
  quorum: "4.5%",
  l2TimelockAddress: "0x34d45e99f7D8c45ed05B5cA72D54bbD1fb3F98f0",
  l2TimelockDelay: "8 days",
  l1TimelockAddress: "0xE6841D92B0C345144506576eC13ECf5103aC7f49",
  l1TimelockDelay: "3 days",
  hasL1Timelock: true,
  finalStage: "RETRYABLE_REDEEMED",
};

const TREASURY_GOVERNOR_CONFIG: GovernorConfig = {
  address: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
  type: "treasury",
  name: "Treasury Governor",
  description: "Treasury and funding proposals",
  quorum: "3%",
  l2TimelockAddress: "0xbFc1FECa8B09A5c5D3EFfE7429eBE24b9c09EF58",
  l2TimelockDelay: "3 days",
  l1TimelockAddress: null,
  l1TimelockDelay: null,
  hasL1Timelock: false,
  finalStage: "L2_TIMELOCK_EXECUTED",
};

export const GOVERNORS: Record<GovernorType, GovernorConfig> = {
  core: CORE_GOVERNOR_CONFIG,
  treasury: TREASURY_GOVERNOR_CONFIG,
};

export const GOVERNOR_LIST: GovernorConfig[] = Object.values(GOVERNORS);

export function getGovernorByAddress(
  address: string
): GovernorConfig | undefined {
  const normalized = address.toLowerCase();
  return GOVERNOR_LIST.find((g) => g.address.toLowerCase() === normalized);
}

export function isCoreGovernor(address: string): boolean {
  return address.toLowerCase() === CORE_GOVERNOR_CONFIG.address.toLowerCase();
}

export function isTreasuryGovernor(address: string): boolean {
  return (
    address.toLowerCase() === TREASURY_GOVERNOR_CONFIG.address.toLowerCase()
  );
}

export function getFinalStageForGovernor(
  governorAddress: string
): StageType | undefined {
  const config = getGovernorByAddress(governorAddress);
  return config?.finalStage;
}

export function getGovernorType(address: string): GovernorType | undefined {
  const config = getGovernorByAddress(address);
  return config?.type;
}

/**
 * Determine governor type from governor name string
 * Used for display logic in UI components
 */
export function getGovernorTypeFromName(
  governorName: string | undefined
): GovernorType {
  if (!governorName) return "treasury";
  return governorName.toLowerCase().includes("core") ? "core" : "treasury";
}
