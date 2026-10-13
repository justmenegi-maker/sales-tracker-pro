import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export to dist/ so hosting can serve the app without a Node server.
  output: "export",
  distDir: "dist",
};

export default nextConfig;
