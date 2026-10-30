import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ['impers', 'koffi'],
  experimental: {
    // Recompile local assets after branch changes or pulls instead of reusing
    // persisted development CSS from an earlier source tree.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
