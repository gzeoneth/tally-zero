/**
 * Marketing configuration for TallyZero
 * Defines main navigation structure and marketing page content
 */

import { MarketingConfig } from "@types";

/** Marketing site configuration including navigation links */
export const marketingConfig: MarketingConfig = {
  mainNav: [
    {
      title: "Proposals",
      href: "/explore",
    },
    {
      title: "Delegates",
      href: "/delegates",
    },
    {
      title: "Arbitrum DAO",
      href: "https://arbitrum.io/",
    },
  ],
};
