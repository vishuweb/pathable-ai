import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The end-to-end test runs its own server; a separate build folder keeps it from clashing
  // with a dev server that is already running.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // The development badge sits over the bottom-left corner of small screens and swallows taps there.
  devIndicators: false,
};

export default nextConfig;
