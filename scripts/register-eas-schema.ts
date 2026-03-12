/**
 * Register EAS Schema Script (one-time)
 *
 * Registers the candidate profile schema on Arbitrum One via SchemaRegistry.
 * After registration, paste the returned schema UID into config/eas.ts.
 *
 * Usage:
 *   npx ts-node scripts/register-eas-schema.ts
 *
 * Environment variables:
 *   PRIVATE_KEY - Wallet private key for signing the registration tx
 *   RPC_URL - Arbitrum One RPC URL (default: https://arb1.arbitrum.io/rpc)
 */

import { ethers } from "ethers";

const SCHEMA_REGISTRY_ADDRESS = "0xA310da9c5B885E7fb3fbA9D66E9Ba6Df512b78eB";

const CANDIDATE_PROFILE_SCHEMA =
  "uint256 proposalId, string name, string statement, string discourseHandle, string twitterHandle";

const SCHEMA_REGISTRY_ABI = [
  "function register(string schema, address resolver, bool revocable) external returns (bytes32)",
];

async function main(): Promise<void> {
  const privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    console.error("PRIVATE_KEY environment variable is required");
    process.exit(1);
  }

  const rpcUrl = process.env.RPC_URL || "https://arb1.arbitrum.io/rpc";
  const provider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);

  console.log("Registering schema with account:", wallet.address);
  console.log("Schema:", CANDIDATE_PROFILE_SCHEMA);

  const registry = new ethers.Contract(
    SCHEMA_REGISTRY_ADDRESS,
    SCHEMA_REGISTRY_ABI,
    wallet
  );

  const tx = await registry.register(
    CANDIDATE_PROFILE_SCHEMA,
    ethers.constants.AddressZero,
    true
  );

  console.log("Transaction hash:", tx.hash);
  const receipt = await tx.wait();

  const schemaUid = receipt.logs[0]?.topics[1];
  console.log("\nSchema UID:", schemaUid);
  console.log(
    "\nPaste this into config/eas.ts as CANDIDATE_PROFILE_SCHEMA_UID"
  );
}

main().catch((error) => {
  console.error("Failed to register schema:", error);
  process.exit(1);
});
