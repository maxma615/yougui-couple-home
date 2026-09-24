import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
  },
};

export default nextConfig;
