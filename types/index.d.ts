/**
 * Core type definitions for navigation, site config, and marketing content.
 */

/** Navigation item with route and optional disabled state */
export type NavItem = {
  /** Display title for the nav link */
  title: string;
  /** Route path or external URL */
  href: string;
  /** Whether the nav item is disabled */
  disabled?: boolean;
};

/** Main navigation item - alias for NavItem */
export type MainNavItem = NavItem;

/** Site-wide configuration */
export type SiteConfig = {
  /** Site name */
  name: string;
  /** Site description for SEO */
  description: string;
  /** Base URL of the site */
  url: string;
  /** Open Graph image URL */
  ogImage: string;
  /** Web manifest path */
  manifest: string;
  /** Social media links */
  links: {
    /** Twitter/X profile URL */
    twitter: string;
    /** GitHub repository URL */
    github: string;
  };
};

/** Marketing page configuration */
export type MarketingConfig = {
  /** Navigation items for marketing pages */
  mainNav: MainNavItem[];
};

/** Statistics display item */
export type Stat = {
  /** Stat title/label */
  title: string;
};
