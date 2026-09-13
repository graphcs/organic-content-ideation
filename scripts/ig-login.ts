import "./env";
import { login } from "../scraper/harvest";

login()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(`\n${err instanceof Error ? err.message : err}\n`);
    process.exit(1);
  });
