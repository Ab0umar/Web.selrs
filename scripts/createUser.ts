import "dotenv/config";
import bcrypt from "bcryptjs";
import { getDb } from "../server/db";
import { users } from "../drizzle/schema";

/**
 * Usage: pnpm create-user <username> <password> [admin|manager|doctor|nurse|technician|reception] [branch]
 */
async function main() {
  const rawArgs = process.argv.slice(2);
  const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;
  const [username, password, role = "admin", branch = "examinations"] = args;

  if (!username || !password) {
    throw new Error("Username and password are required");
  }

  const db = await getDb();
  if (!db) {
    throw new Error("Unable to connect to the database");
  }

  const hashed = await bcrypt.hash(password, 10);
  const result = await db.insert(users).values({
    username,
    password: hashed,
    name: username,
    role: role as any,
    branch: branch as any,
  });

  console.log("Created user with id", result.insertId || result.insertId?.toString() || result["insertId"] || "unknown");
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
