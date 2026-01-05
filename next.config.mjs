/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "export",
  images: {
    unoptimized: true,
    domains: ["placehold.co", "www.tally.xyz", "raw.githubusercontent.com"],
  },
  webpack: (config) => {
    config.externals.push("pino-pretty", "lokijs", "encoding");
    // Polyfill/fallback for Node.js modules used by @gzeoneth/gov-tracker
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      async_hooks: false,
      net: false,
      tls: false,
      dns: false,
      child_process: false,
    };
    return config;
  },
};

import withBundleAnalyzer from "@next/bundle-analyzer";

export default process.env.ANALYZE === "true"
  ? withBundleAnalyzer(nextConfig)
  : nextConfig;
