import type { NextConfig } from "next";

const config: NextConfig = {
  // The harvester is a local-only CLI concern; keep Playwright out of the server bundle
  // so the hosted demo builds without it.
  serverExternalPackages: ["@prisma/client", "playwright"],
};

export default config;
