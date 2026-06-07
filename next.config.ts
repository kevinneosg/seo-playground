import type { NextConfig } from "next";
import { execSync } from "child_process";

let gitCommit = "unknown";
try {
  gitCommit = execSync("git rev-parse --short HEAD").toString().trim();
} catch {}

const nextConfig: NextConfig = {
  output: 'standalone',
  // Served as a subpath behind marketing.scholarbasketball.com/seo (reverse-proxied).
  basePath: '/seo',
  // pg is a runtime dependency with optional native bindings — keep it external so
  // webpack doesn't try to bundle it (replaces the old better-sqlite3 external).
  serverExternalPackages: ['pg'],
  devIndicators: false,
  experimental: {
    // Server Action POSTs arrive via the proxy carrying the public origin.
    serverActions: {
      allowedOrigins: ['marketing.scholarbasketball.com'],
    },
  },
  env: {
    NEXT_PUBLIC_GIT_COMMIT: gitCommit,
  },
};

export default nextConfig;
