import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",

  distDir: "dist",

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "repo.githubusercontent.com",
      },
    ],
  },

  env: {},
};

export default nextConfig;
