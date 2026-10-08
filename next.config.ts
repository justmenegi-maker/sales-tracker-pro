import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tailwind v4 + PostCSS
  // (tailwindcss and @tailwindcss/postcss are configured via postcss.config.mjs)

  // Defaults that keep the app Vercel-friendly.
  // Adjust later if we need images, i18n, redirects, etc.
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "repo.githubusercontent.com",
      },
    ],
  },

  // Keep builds strict about missing env vars in prod.
  // Local dev can still start with placeholder values.
  env: {
    // No defaults for secrets here; those stay in .env.local / Vercel env.
  },
};

export default nextConfig;
