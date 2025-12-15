import { State } from "@/types/search";

export const initialState: State = {
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
