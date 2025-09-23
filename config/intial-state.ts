import { State } from "@/types/search";

export const initialState: State = {
  system: {},
  governor: {
    address: undefined,
    contract: null,
    name: undefined,
  },
  token: {
    address: undefined,
    contract: null,
  },
  proposals: [],
};

export enum ProposalState {
  Pending,
  Active,
  Canceled,
  Defeated,
  Succeeded,
  Queued,
  Expired,
  Executed,
}

export enum ProposalOptimismState {
  Pending,
  Active,
  Canceled,
  Defeated,
  Succeeded,
  Queued,
  Expired,
  Executed,
}
