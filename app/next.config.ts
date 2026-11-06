import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // The local TypeScript 6 CLI emits no --showConfig output when Next pipes
  // stdout in this environment; keep Next's compiler-API checker enabled.
  experimental: {
    useTypeScriptCli: false,
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
