import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the workspace root to this app so Next does not walk up to the home
  // directory (a stray package-lock.json there otherwise confuses inference).
  turbopack: {
    root: path.resolve("."),
  },
};

export default nextConfig;
