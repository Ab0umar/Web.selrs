import { z } from "zod";

const envSchema = z.object({
  VITE_APP_ID: z.string().optional().default(""),
  JWT_SECRET: z.string().optional().default("dev-only-change-me"),
  DATABASE_URL: z.string().optional().default(""),
  OAUTH_SERVER_URL: z.string().optional().default(""),
  OWNER_OPEN_ID: z.string().optional().default(""),
  BUILT_IN_FORGE_API_URL: z.string().optional().default(""),
  BUILT_IN_FORGE_API_KEY: z.string().optional().default(""),
  NODE_ENV: z.enum(["development", "production", "test"]).optional().default("development"),
});

const parsed = envSchema.parse(process.env);

if (parsed.NODE_ENV === "production") {
  const missing: string[] = [];
  if (!parsed.DATABASE_URL) missing.push("DATABASE_URL");
  if (!parsed.JWT_SECRET || parsed.JWT_SECRET === "dev-only-change-me") missing.push("JWT_SECRET");
  if (missing.length > 0) {
    throw new Error(`[env] Missing required production env vars: ${missing.join(", ")}`);
  }
}

export const ENV = {
  appId: parsed.VITE_APP_ID,
  cookieSecret: parsed.JWT_SECRET,
  JWT_SECRET: parsed.JWT_SECRET,
  databaseUrl: parsed.DATABASE_URL,
  oAuthServerUrl: parsed.OAUTH_SERVER_URL,
  ownerOpenId: parsed.OWNER_OPEN_ID,
  isProduction: parsed.NODE_ENV === "production",
  forgeApiUrl: parsed.BUILT_IN_FORGE_API_URL,
  forgeApiKey: parsed.BUILT_IN_FORGE_API_KEY,
};
