import {
  ARBITRUM_CHAIN_ID,
  ARBITRUM_RPC_URL,
  CORE_GOVERNOR,
  TREASURY_GOVERNOR,
} from "./arbitrum-governance";

export { ARBITRUM_CHAIN_ID, ARBITRUM_RPC_URL };

export const ARBITRUM_GOVERNORS = [
  { id: "core" as const, ...CORE_GOVERNOR },
  { id: "treasury" as const, ...TREASURY_GOVERNOR },
] as const;

export type GovernorId = (typeof ARBITRUM_GOVERNORS)[number]["id"];
