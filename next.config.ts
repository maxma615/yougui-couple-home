import type { NextConfig } from "next";

// 隔离测试（scripts/test-e2e.ts）通过该变量把开发服务器放到独立 distDir，
// 获得独立的 dev 锁与编译缓存，与本机长驻预览的 .next/dev 互不影响。
// 不设置该变量时行为与默认完全一致。
const testDistDir = process.env.NEXT_DEV_DIST_DIR;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  ...(testDistDir ? { distDir: testDistDir } : {}),
  logging: {
    incomingRequests: false,
    browserToTerminal: false,
  },
};

export default nextConfig;
