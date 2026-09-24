// Gives existing design systems DESIGN.md's tokens, for rows created before
// new spaces were seeded from it. Only rows nobody has chosen tokens for are
// touched: an empty `{}` (what createSpace used to write) and the three-colour
// placeholder the old `db:push` demo seed wrote. Anything else is left alone.
//
//   npm run db:seed-tokens            # dry run: lists what would change
//   npm run db:seed-tokens -- --apply # writes
//
// This writes to whatever database .env.local points at, which may be shared
// with the deployed Worker — get a go-ahead before running with --apply.
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (run with --env-file=.env.local)");

const apply = process.argv.includes("--apply");
const sql = neon(url);

const { tokens } = JSON.parse(
  readFileSync(new URL("../app/dashboard/[space]/design.generated.json", import.meta.url), "utf8"),
);
if (!tokens?.colors || !Object.keys(tokens.colors).length) {
  throw new Error("design.generated.json has no tokens — run `npm run design:sync` first");
}

const PLACEHOLDER = { ink: "#111111", paper: "#F6F5F3", accent: "#B7EFB2" };

const unset = await sql`
  select d.id, d.name, d.tokens
  from design_systems d
  where d.tokens = '{}'::jsonb or d.tokens = ${JSON.stringify(PLACEHOLDER)}::jsonb
  order by d.created_at
`;

if (!unset.length) {
  console.log("Nothing to seed: every design system already has its own tokens.");
  process.exit(0);
}

for (const row of unset) {
  const was = Object.keys(row.tokens).length ? "demo placeholder" : "empty";
  console.log(`${apply ? "seeding" : "would seed"} ${row.name} (${row.id}) — was ${was}`);
}

if (!apply) {
  console.log(`\n${unset.length} row(s). Dry run — re-run with --apply to write.`);
  process.exit(0);
}

// The same predicate again, so a row edited since the select is not overwritten.
const updated = await sql`
  update design_systems
  set tokens = ${JSON.stringify(tokens)}::jsonb
  where id = any(${unset.map((row) => row.id)}::uuid[])
    and (tokens = '{}'::jsonb or tokens = ${JSON.stringify(PLACEHOLDER)}::jsonb)
  returning id
`;
console.log(`\nSeeded ${updated.length} of ${unset.length} row(s).`);
