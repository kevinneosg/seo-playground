import type { NextConfig } from "next";
import { execSync } from "child_process";

let gitCommit = "unknown";
try {
  gitCommit = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

const nextConfig: NextConfig = {
  output: 'standalone',
  serverExternalPackages: ['better-sqlite3'],
  devIndicators: false,
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
  },
};

export default nextConfig;
