import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Swarm serves static files only, so export the whole site to `out/`.
  output: "export",
  // Emit `route/index.html` so Swarm gateway directory indexes resolve
  // clean URLs without server rewrites.
  trailingSlash: true,
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
