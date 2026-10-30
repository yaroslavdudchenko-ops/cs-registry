import { loadEnvFile } from "node:process";

import { defineConfig } from "drizzle-kit";

try {
  loadEnvFile(".env");
} catch {
  // .env is optional when URLs are already in the environment
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/server/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url:
      process.env.DATABASE_ADMIN_URL ??
      process.env.DATABASE_URL ??
      "postgres://postgres:postgres@127.0.0.1:5432/cs_registry",
  },
});
