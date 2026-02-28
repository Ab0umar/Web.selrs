import "dotenv/config";
import * as db from "../server/db";

async function main() {
  const users = await db.getAllUsers();
  let updated = 0;

  for (const user of users) {
    const roleDefaults = await db.getRoleDefaultPermissions(user.role);
    await db.setUserPermissions(user.id, roleDefaults);
    updated += 1;
  }

  console.log(
    JSON.stringify(
      {
        success: true,
        usersUpdated: updated,
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error("[sync-user-permissions-to-role] Failed:", error);
  process.exit(1);
});

