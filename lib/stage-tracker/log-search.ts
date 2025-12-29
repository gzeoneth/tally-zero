import { queryWithRetry } from "@/lib/rpc-utils";
import { ethers } from "ethers";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Search for logs in chunks with optional early exit
 * @param provider - The ethers provider
 * @param filter - The log filter (without fromBlock/toBlock)
 * @param fromBlock - Starting block number
 * @param toBlock - Ending block number
 * @param chunkSize - Number of blocks per chunk
 * @param delayBetweenChunks - Delay in ms between chunks
 * @param earlyExitCheck - Optional function to check for early exit
 * @returns Array of logs
 */
export async function searchLogsInChunks(
  provider: ethers.providers.Provider,
  filter: ethers.providers.Filter,
  fromBlock: number,
  toBlock: number,
  chunkSize: number,
  delayBetweenChunks: number,
  earlyExitCheck?: (logs: ethers.providers.Log[]) => ethers.providers.Log | null
): Promise<ethers.providers.Log[]> {
  const allLogs: ethers.providers.Log[] = [];

  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    const end = Math.min(start + chunkSize - 1, toBlock);

    const logs = await queryWithRetry(() =>
      provider.getLogs({
        ...filter,
        fromBlock: start,
        toBlock: end,
      })
    );

    allLogs.push(...logs);

    if (earlyExitCheck && logs.length > 0) {
      const match = earlyExitCheck(logs);
      if (match) {
        return allLogs;
      }
    }

    if (end < toBlock && delayBetweenChunks > 0) {
      await wait(delayBetweenChunks);
    }
  }

  return allLogs;
}

/**
 * Extract L1 block number from an Arbitrum transaction receipt
 * @param receipt - The transaction receipt
 * @returns The L1 block number
 * @throws If the receipt doesn't contain l1BlockNumber (must use ArbitrumProvider)
 */
export function getL1BlockNumberFromReceipt(
  receipt: ethers.providers.TransactionReceipt
): number {
  const l1BlockNumber = (receipt as { l1BlockNumber?: unknown }).l1BlockNumber;

  if (typeof l1BlockNumber === "number") {
    return l1BlockNumber;
  }
  if (typeof l1BlockNumber === "string") {
    return parseInt(l1BlockNumber, l1BlockNumber.startsWith("0x") ? 16 : 10);
  }
  if (
    l1BlockNumber &&
    typeof (l1BlockNumber as ethers.BigNumber).toNumber === "function"
  ) {
    return (l1BlockNumber as ethers.BigNumber).toNumber();
  }

  throw new Error("Receipt missing l1BlockNumber - must use ArbitrumProvider");
}
