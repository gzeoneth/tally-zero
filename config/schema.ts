import * as z from "zod";

// `0x${string}` is a valid Ethereum address
const ethAddressRegex = /^0x[a-fA-F0-9]{40}$/;

export const formSchema = z.object({
  address: z.string().regex(ethAddressRegex, "Invalid Ethereum address"),
  networkId: z.string(),
  daysToSearch: z.number().min(1).optional().default(30),
  rpcUrl: z.string().url().optional(),
  blockRange: z.number().min(100).optional().default(1000000),
});

export const voteSchema = z.object({
  vote: z.string().refine((data) => ["0", "1", "2"].includes(data), {
    message: "Please select a valid vote option",
  }),
});

export const proposalSchema = z.object({
  id: z.string(),
  proposer: z.string(),
  contractAddress: z.string(),
  targets: z.array(z.string()),
  values: z.array(z.string()),
  signatures: z.array(z.string()),
  calldatas: z.array(z.string()),
  startBlock: z.string(),
  endBlock: z.string(),
  description: z.string(),
  networkId: z.string(),
  state: z.string(),
});

export const daoSchema = z.object({
  name: z.string(),
  networkId: z.number(),
  imageUrl: z.string(),
  ethAddresses: z.array(z.string().regex(ethAddressRegex)),
  maxBlockRange: z.number(),
});
export type DAO = z.infer<typeof daoSchema>;
