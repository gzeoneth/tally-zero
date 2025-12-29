"use client";

import { useDeepLink } from "@/context/DeepLinkContext";
import { useCallback, useState } from "react";

type DefaultTab = "description" | "payload" | "stages" | "vote";

/**
 * Hook for managing proposal modal open state with deep linking.
 * Syncs modal open/close with URL deep link state.
 */
export function useProposalModal(proposalId: string, defaultTab?: DefaultTab) {
  const { openProposal, clearDeepLink } = useDeepLink();
  const [open, setOpen] = useState(false);

  const handleOpenChange = useCallback(
    (newOpen: boolean) => {
      setOpen(newOpen);
      if (newOpen) {
        openProposal(proposalId, defaultTab);
      } else {
        clearDeepLink();
      }
    },
    [proposalId, defaultTab, openProposal, clearDeepLink]
  );

  return { open, handleOpenChange };
}

/**
 * Hook for getting a modal open change handler without managing state.
 * Use when the parent component (e.g., ResponsiveModal) manages open state.
 */
export function useProposalModalHandler(
  proposalId: string,
  defaultTab?: DefaultTab
) {
  const { openProposal, clearDeepLink } = useDeepLink();

  return useCallback(
    (open: boolean) => {
      if (open) {
        openProposal(proposalId, defaultTab);
      } else {
        clearDeepLink();
      }
    },
    [proposalId, defaultTab, openProposal, clearDeepLink]
  );
}
