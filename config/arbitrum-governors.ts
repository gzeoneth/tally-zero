import { ARBITRUM_CHAIN_ID, ARBITRUM_RPC_URL } from "./arbitrum-governance";

export { ARBITRUM_CHAIN_ID, ARBITRUM_RPC_URL };

export const ARBITRUM_GOVERNORS = [
  {
    id: "core",
    name: "Core Governor",
    address: "0xf07DeD9dC292157749B6Fd268E37DF6EA38395B9",
    description: "Constitutional and non-emergency proposals",
  },
  {
    id: "treasury",
    name: "Treasury Governor",
    address: "0x789fC99093B09aD01C34DC7251D0C89ce743e5a4",
    description: "Treasury and funding proposals",
  },
] as const;

export type GovernorId = (typeof ARBITRUM_GOVERNORS)[number]["id"];
