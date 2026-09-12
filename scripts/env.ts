/** Load .env for standalone scripts. Next loads it on its own; tsx does not. */
try {
  process.loadEnvFile?.(".env");
} catch {
  // No .env yet — the CLI still works against the database, just not the writing bot.
}
