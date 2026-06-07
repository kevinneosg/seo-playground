import { initSchema } from "../src/lib/db";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set");

  console.log("[migrate] applying schema");
  await initSchema();
  console.log("[migrate] done");
  process.exit(0);
}

main().catch((e) => {
  console.error("[migrate] FAILED", e);
  process.exit(1);
});
