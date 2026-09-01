import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The app is fully client-side (React + Supabase), so it can be exported as
  // static files. This makes the Netlify deploy trivial: just publish `out/`.
  output: 'export',
  images: { unoptimized: true },
};

export default nextConfig;
