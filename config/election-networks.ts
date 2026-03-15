import { ADDRESSES } from "@gzeoneth/gov-tracker";

export interface ElectionContracts {
  nomineeGovernor: string;
  memberGovernor: string;
  securityCouncilManager: string;
  arbToken: string;
  chainId: number;
}

const ARB_ONE: ElectionContracts = {
  nomineeGovernor: ADDRESSES.ELECTION_NOMINEE_GOVERNOR,
  memberGovernor: ADDRESSES.ELECTION_MEMBER_GOVERNOR,
  securityCouncilManager: ADDRESSES.SECURITY_COUNCIL_MANAGER,
  arbToken: ADDRESSES.ARB_TOKEN,
  chainId: 42161,
};

const ARB_SEPOLIA: ElectionContracts = {
  nomineeGovernor: "0xE1DFF2B940940e743675496C91Ab589018282EA0",
  memberGovernor: "0x3D110E6045BC7990f6A2eFfd211852cE5f556736",
  securityCouncilManager: "0xe3002bCBf8EDD88c2BE65645a9038636be0bab9c",
  arbToken: "0x8e3A45b777F35Aa95829529e33b15815140Ba546",
  chainId: 421614,
};

export const ELECTION_NETWORKS: Record<number, ElectionContracts> = {
  [ARB_ONE.chainId]: ARB_ONE,
  [ARB_SEPOLIA.chainId]: ARB_SEPOLIA,
};

export const DEFAULT_ELECTION_NETWORK = ARB_ONE;
