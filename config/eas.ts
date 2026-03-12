export const EAS_CONTRACT_ADDRESS =
  "0xbD75f629A22Dc1ceD33dDA0b68c546A1c035c458" as const;

export const SCHEMA_REGISTRY_ADDRESS =
  "0xA310da9c5B885E7fb3fbA9D66E9Ba6Df512b78eB" as const;

// TODO: Set after running scripts/register-eas-schema.ts
export const CANDIDATE_PROFILE_SCHEMA_UID =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

export const EAS_GRAPHQL_URL = "https://arbitrum.easscan.org/graphql";

export const CANDIDATE_PROFILE_SCHEMA =
  "uint256 proposalId, string name, string statement, string discourseHandle, string twitterHandle";

export const EAS_ABI = [
  {
    name: "attest",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "request",
        type: "tuple",
        components: [
          { name: "schema", type: "bytes32" },
          {
            name: "data",
            type: "tuple",
            components: [
              { name: "recipient", type: "address" },
              { name: "expirationTime", type: "uint64" },
              { name: "revocable", type: "bool" },
              { name: "refUID", type: "bytes32" },
              { name: "data", type: "bytes" },
              { name: "value", type: "uint256" },
            ],
          },
        ],
      },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;

export const PROFILE_PARAM_TYPES = [
  { name: "proposalId", type: "uint256" },
  { name: "name", type: "string" },
  { name: "statement", type: "string" },
  { name: "discourseHandle", type: "string" },
  { name: "twitterHandle", type: "string" },
] as const;

export const SCHEMA_REGISTRY_ABI = [
  {
    name: "register",
    type: "function",
    stateMutability: "nonpayable",
    inputs: [
      { name: "schema", type: "string" },
      { name: "resolver", type: "address" },
      { name: "revocable", type: "bool" },
    ],
    outputs: [{ name: "", type: "bytes32" }],
  },
] as const;
