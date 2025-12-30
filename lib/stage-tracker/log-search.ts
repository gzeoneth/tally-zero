import { debugLog, delay } from "@/lib/delay-utils";
import { queryWithRetry } from "@/lib/rpc-utils";
import { ethers } from "ethers";

/**
 * Arbitrum transaction receipt with l1BlockNumber field
 * (added by ArbitrumProvider from @arbitrum/sdk)
 */
export interface ArbitrumTransactionReceipt
  extends ethers.providers.TransactionReceipt {
  l1BlockNumber?: number | string | ethers.BigNumber;
}

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
  const totalBlocks = toBlock - fromBlock;
  const totalChunks = Math.ceil(totalBlocks / chunkSize);
  debugLog(
    `[searchLogsInChunks] Searching ${fromBlock} to ${toBlock} (${totalBlocks} blocks, ${totalChunks} chunks)`
  );
  const startTime = Date.now();
  const allLogs: ethers.providers.Log[] = [];

  let chunkNum = 0;
  for (let start = fromBlock; start <= toBlock; start += chunkSize) {
    chunkNum++;
    const end = Math.min(start + chunkSize - 1, toBlock);

    if (chunkNum === 1 || chunkNum % 10 === 0 || chunkNum === totalChunks) {
      debugLog(
        `[searchLogsInChunks] Chunk ${chunkNum}/${totalChunks}: ${start}-${end}`
      );
    }

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
        debugLog(
          `[searchLogsInChunks] Early exit at chunk ${chunkNum}, found ${allLogs.length} logs in ${Date.now() - startTime}ms`
        );
        return allLogs;
      }
    }

    if (end < toBlock && delayBetweenChunks > 0) {
      await delay(delayBetweenChunks);
    }
  }

  debugLog(
    `[searchLogsInChunks] Completed: ${allLogs.length} logs found in ${Date.now() - startTime}ms`
  );
  return allLogs;
}

/**
 * Extract L1 block number from an Arbitrum transaction receipt
 * @param receipt - The transaction receipt (must be from ArbitrumProvider)
 * @returns The L1 block number
 * @throws If the receipt doesn't contain l1BlockNumber
 */
export function getL1BlockNumberFromReceipt(
  receipt: ArbitrumTransactionReceipt
): number {
  const { l1BlockNumber } = receipt;

  if (typeof l1BlockNumber === "number") {
    return l1BlockNumber;
  }
  if (typeof l1BlockNumber === "string") {
    return parseInt(l1BlockNumber, l1BlockNumber.startsWith("0x") ? 16 : 10);
  }
  if (l1BlockNumber && typeof l1BlockNumber.toNumber === "function") {
    return l1BlockNumber.toNumber();
  }

  throw new Error("Receipt missing l1BlockNumber - must use ArbitrumProvider");
}
