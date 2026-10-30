import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["exceljs", "pdfkit", "argon2"],
  outputFileTracingIncludes: {
    "*": ["./src/server/modules/export/fonts/**/*"],
  },
};

export default nextConfig;
