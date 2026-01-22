/**
 * Proposal utilities
 *
 * Provides utility functions for working with proposals.
 */

import type { ParsedProposal } from "@/types/proposal";

/**
 * Sort proposals by state and start block
 *
 * Active proposals come first, then sorted by start block descending.
 *
 * @param proposals - Array of proposals to sort
 * @returns Sorted array of proposals
 */
export function sortProposals(proposals: ParsedProposal[]): ParsedProposal[] {
  return [...proposals].sort((a, b) => {
    if (a.state === "Active" && b.state !== "Active") return -1;
    if (a.state !== "Active" && b.state === "Active") return 1;
    return parseInt(b.startBlock, 10) - parseInt(a.startBlock, 10);
  });
}
