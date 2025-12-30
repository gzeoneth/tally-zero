"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

import { ARBITRUM_RPC_URL } from "@/config/arbitrum-governance";
import { STORAGE_KEYS } from "@/config/storage-keys";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { debug } from "@/lib/debug";
import {
  getDelegateLabel,
  getTopDelegates,
  loadDelegateCache,
} from "@/lib/delegate-cache";
import { toError } from "@/lib/error-utils";
import type { DelegateInfo } from "@/types/delegate";
import OzGovernor_ABI from "@data/OzGovernor_ABI.json";

export interface DelegateNotVoted {
  address: string;
  label: string | undefined;
  votingPower: string;
}

const BATCH_SIZE = 20;
const MAX_DELEGATES_TO_CHECK = 100;
const DEFAULT_LIMIT = 5;

export function useTopDelegatesNotVoted({
  proposalId,
  governorAddress,
  limit = DEFAULT_LIMIT,
  customRpcUrl,
}: {
  proposalId: string;
  governorAddress: string;
  limit?: number;
  customRpcUrl?: string;
}) {
  const [storedL2Rpc, , l2RpcHydrated] = useLocalStorage(
    STORAGE_KEYS.L2_RPC,
    ""
  );

  const [delegatesNotVoted, setDelegatesNotVoted] = useState<
    DelegateNotVoted[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [allTopDelegatesVoted, setAllTopDelegatesVoted] = useState(false);

  const fetchedRef = useRef(false);
  const effectiveRpcUrl = customRpcUrl || storedL2Rpc || ARBITRUM_RPC_URL;

  const fetchDelegatesNotVoted = useCallback(async () => {
    if (!proposalId || !governorAddress) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const cache = await loadDelegateCache();
      if (!cache) {
        setIsLoading(false);
        return;
      }

      const allDelegates: DelegateInfo[] = getTopDelegates(
        cache,
        MAX_DELEGATES_TO_CHECK
      );
      if (allDelegates.length === 0) {
        setIsLoading(false);
        return;
      }

      const provider = new ethers.providers.JsonRpcProvider(effectiveRpcUrl);
      await provider.ready;

      const governor = new ethers.Contract(
        governorAddress,
        OzGovernor_ABI,
        provider
      );

      const notVoted: DelegateNotVoted[] = [];
      let offset = 0;

      while (notVoted.length < limit && offset < allDelegates.length) {
        const batch = allDelegates.slice(offset, offset + BATCH_SIZE);

        const hasVotedResults = await Promise.all(
          batch.map(async (delegate) => {
            const voted = await governor.hasVoted(proposalId, delegate.address);
            return { delegate, voted };
          })
        );

        for (const result of hasVotedResults) {
          if (!result.voted && notVoted.length < limit) {
            notVoted.push({
              address: result.delegate.address,
              label: getDelegateLabel(result.delegate.address),
              votingPower: result.delegate.votingPower,
            });
          }
        }

        offset += BATCH_SIZE;
      }

      setDelegatesNotVoted(notVoted);
      setAllTopDelegatesVoted(notVoted.length === 0 && offset >= BATCH_SIZE);
    } catch (err) {
      debug.delegates("top delegates not voted error: %O", err);
      setError(toError(err));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, governorAddress, limit, effectiveRpcUrl]);

  useEffect(() => {
    if (!l2RpcHydrated) return;
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchDelegatesNotVoted();
    }
  }, [l2RpcHydrated, fetchDelegatesNotVoted]);

  return {
    delegatesNotVoted,
    isLoading,
    error,
    allTopDelegatesVoted,
  };
}
