import { login } from "../scraper/harvest";

login().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
