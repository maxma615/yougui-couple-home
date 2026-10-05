import type { NextConfig } from "next";

// 隔离测试（scripts/test-e2e.ts）通过该变量把开发服务器放到独立 distDir，
// 使用 .local/e2e/next 获得独立 dev 锁与缓存，避免生产构建清理 .next 时中断测试。
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
