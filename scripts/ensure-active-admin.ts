import "dotenv/config";
import mysql from "mysql2/promise";

type CliOptions = {
  userId: number;
};

function parseArgs(argv: string[]): CliOptions {
  const idArg = argv.find((arg) => arg.startsWith("--user-id="));
  const userId = Number(idArg?.split("=")[1] ?? 1);
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error(`Invalid --user-id value: ${idArg ?? "undefined"}`);
  }
  return { userId };
}

async function main() {
  const { userId } = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required");
  }

  const conn = await mysql.createConnection(databaseUrl);
  try {
    const [rows] = await conn.query<any[]>(
      "SELECT id, username, role, isActive FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    if (!rows.length) {
      throw new Error(`User id ${userId} not found`);
    }

    const user = rows[0];
    const wasActive = Number(user.isActive) === 1;
    if (!wasActive) {
      await conn.query("UPDATE users SET isActive = 1 WHERE id = ?", [userId]);
    }

    const [afterRows] = await conn.query<any[]>(
      "SELECT id, username, role, isActive FROM users WHERE id = ? LIMIT 1",
      [userId]
    );

    const after = afterRows[0];
    console.log(
      JSON.stringify(
        {
          success: true,
          changed: !wasActive,
          user: {
            id: after.id,
            username: after.username,
            role: after.role,
            isActive: Number(after.isActive) === 1,
          },
        },
        null,
        2
      )
    );
  } finally {
    await conn.end();
  }
}

main().catch((error) => {
  console.error("[ensure-active-admin] Failed:", error);
  process.exit(1);
});

