import { defineConfig } from "@playwright/test";
import "dotenv/config";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  use: {
    baseURL: process.env.BASE_URL || "http://127.0.0.1:4000",
    headless: true,
    channel: "msedge",
  },
});
