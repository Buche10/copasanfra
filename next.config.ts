import type { NextConfig } from "next";

// En GitHub Pages el sitio se sirve bajo /copasanfra. El workflow define
// NEXT_PUBLIC_BASE_PATH=/copasanfra; en local/Netlify queda vacío (raíz).
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig: NextConfig = {
  // The app is fully client-side (React + Supabase), so it can be exported as
  // static files (out/).
  output: 'export',
  images: { unoptimized: true },
  basePath: basePath || undefined,
  assetPrefix: basePath || undefined,
};

export default nextConfig;
