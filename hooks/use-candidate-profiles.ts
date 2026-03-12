"use client";

import { useEffect, useState } from "react";

import { fetchCandidateProfiles } from "@/lib/eas";
import type { CandidateProfile } from "@/types/eas";

interface UseCandidateProfilesResult {
  profiles: Map<string, CandidateProfile>;
  isLoading: boolean;
  error: Error | null;
  refetch: () => void;
}

export function useCandidateProfiles(
  proposalId: string | undefined
): UseCandidateProfilesResult {
  const [profiles, setProfiles] = useState<Map<string, CandidateProfile>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [fetchCount, setFetchCount] = useState(0);

  useEffect(() => {
    if (!proposalId) return;

    let isMounted = true;

    const load = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const result = await fetchCandidateProfiles(proposalId);
        if (isMounted) {
          setProfiles(result);
        }
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e : new Error(String(e)));
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    load();

    return () => {
      isMounted = false;
    };
  }, [proposalId, fetchCount]);

  function refetch(): void {
    setFetchCount((c) => c + 1);
  }

  return { profiles, isLoading, error, refetch };
}
