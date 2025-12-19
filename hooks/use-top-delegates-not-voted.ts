"use client";

import { ethers } from "ethers";
import { useCallback, useEffect, useRef, useState } from "react";

import {
  getDelegateLabel,
  getTopDelegates,
  loadDelegateCache,
} from "@/lib/delegate-cache";
import type { DelegateInfo } from "@/types/delegate";
import { ARBITRUM_RPC_URL } from "@config/arbitrum-governance";
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
}: {
  proposalId: string;
  governorAddress: string;
  limit?: number;
}) {
  const [delegatesNotVoted, setDelegatesNotVoted] = useState<
    DelegateNotVoted[]
  >([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [allTopDelegatesVoted, setAllTopDelegatesVoted] = useState(false);

  const fetchedRef = useRef(false);

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

      const provider = new ethers.providers.JsonRpcProvider(ARBITRUM_RPC_URL);
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
      console.error("[useTopDelegatesNotVoted] Error:", err);
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  }, [proposalId, governorAddress, limit]);

  useEffect(() => {
    if (!fetchedRef.current) {
      fetchedRef.current = true;
      fetchDelegatesNotVoted();
    }
  }, [fetchDelegatesNotVoted]);

  return {
    delegatesNotVoted,
    isLoading,
    error,
    allTopDelegatesVoted,
  };
}
