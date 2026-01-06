/**
 * Site configuration for TallyZero
 * Contains metadata, URLs, and social links
 */

import type { SiteConfig } from "@types";

/** Base URL for the site */
const url = "https://zero.tally.xyz";

/** Site-wide configuration for metadata and links */
export const siteConfig = {
  name: "Arbitrum Governance",
  description: "Vote on Arbitrum DAO proposals",
  url,
  ogImage: `${url}/og.png`,
  links: {
    twitter: "https://twitter.com/arbitrum",
    github: "https://github.com/withtally/tally-zero",
  },
  manifest: `${url}/site.webmanifest`,
} as const satisfies SiteConfig;
