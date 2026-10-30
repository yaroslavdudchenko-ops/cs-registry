import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Production-образ (Dockerfile) собирается с BUILD_STANDALONE=1: минимальный
  // server.js + только нужные node_modules. Локальный `pnpm start` не меняется.
  ...(process.env.BUILD_STANDALONE === "1" ? { output: "standalone" as const } : {}),
  serverExternalPackages: ["exceljs", "pdfkit", "argon2"],
  outputFileTracingIncludes: {
    "*": ["./src/server/modules/export/fonts/**/*"],
  },
};

export default nextConfig;
