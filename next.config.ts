import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export to dist/ so hosting can serve the app without a Node server.
  output: "export",
  distDir: "dist",

  // Production debugging off: no framework banner, no browser source maps, and
  // the console is stripped at build time except for warnings and errors (which
  // `src/lib/log.ts` sends through redaction).
  poweredByHeader: false,
  productionBrowserSourceMaps: false,
  compiler: {
    removeConsole:
      process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
};

export default nextConfig;
