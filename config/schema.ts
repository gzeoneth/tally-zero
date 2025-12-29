import { ETH_ADDRESS_REGEX } from "@/lib/address-utils";
import { isValidRpcUrl } from "@lib/utils";
import * as z from "zod";

import { DEFAULT_FORM_VALUES } from "./arbitrum-governance";

// RPC URL validation schema
const rpcUrlSchema = z
  .string()
  .optional()
  .refine(
    (url) => {
      if (!url || url === "") return true;
      return isValidRpcUrl(url);
    },
    {
      message: "RPC URL must be a valid HTTP or HTTPS URL",
    }
  )
  .or(z.literal(""));

export const formSchema = z.object({
  address: z.string().regex(ETH_ADDRESS_REGEX, "Invalid Ethereum address"),
  networkId: z.string(),
  daysToSearch: z
    .number()
    .min(1)
    .optional()
    .default(DEFAULT_FORM_VALUES.daysToSearch),
  rpcUrl: rpcUrlSchema,
  l1RpcUrl: rpcUrlSchema,
  blockRange: z
    .number()
    .min(100)
    .optional()
    .default(DEFAULT_FORM_VALUES.blockRange),
  l1BlockRange: z
    .number()
    .min(100)
    .optional()
    .default(DEFAULT_FORM_VALUES.l1BlockRange),
  autoRun: z.boolean().optional().default(false),
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
  creationTxHash: z.string().optional(),
});
