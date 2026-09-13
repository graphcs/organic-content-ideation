import "./env";
import { existsSync } from "node:fs";
import { sessionStatus } from "../scraper/harvest";

/**
 * Is there a usable Instagram session on this machine, and whose is it?
 *
 * Worth its own command because the failure it catches is a silent one: a session
 * that has quietly expired produces an empty harvest that looks like "the feed had
 * nothing", not like "you are logged out".
 */
async function main() {
  if (!existsSync(".ig-profile/Default/Cookies")) {
    console.log("\nNo session yet. Run `npm run ig:login` and log in by hand.\n");
    process.exit(1);
  }

  console.log("Checking the saved session…");
  const status = await sessionStatus();

  if (status.loggedIn) {
    console.log(`\nLogged in${status.handle ? ` as @${status.handle}` : ""}. Ready to harvest.\n`);
    process.exit(0);
  }

  console.log("\nThe saved session is not logged in any more. Run `npm run ig:login` again.\n");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
