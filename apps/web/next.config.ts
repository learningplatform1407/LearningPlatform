import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@lp/contracts", "@lp/validation", "@lp/ui", "@lp/api-client"],
};

export default nextConfig;
