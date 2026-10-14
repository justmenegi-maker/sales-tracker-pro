import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export to dist/ so Vercel and static hosting can serve the app from dist/
  output: "export",
  distDir: "dist",
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
