// Applies db/schema.sql and seeds a demo space when the database is empty.
// Usage: npm run db:push
import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set (run with --env-file=.env.local)");

const sql = neon(url);
const schema = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

for (const statement of schema.split(";").map((s) => s.trim()).filter(Boolean)) {
  await sql.query(statement);
}
console.log("schema applied");

const [{ count }] = await sql`select count(*)::int as count from spaces`;
if (count > 0) {
  console.log(`seed skipped (${count} spaces exist)`);
  process.exit(0);
}

async function space(name, slug) {
  const [row] = await sql`insert into spaces (name, slug) values (${name}, ${slug}) returning id`;
  const [ds] = await sql`
    insert into design_systems (space_id, name, tokens)
    values (${row.id}, ${`${name} design system`}, ${JSON.stringify({ ink: "#111111", paper: "#F6F5F3", accent: "#B7EFB2" })}::jsonb)
    returning id`;
  await sql`update spaces set design_system_id = ${ds.id} where id = ${row.id}`;
  return row.id;
}

const marketing = await space("Marketing site", "marketing-site");
const docs = await space("Docs", "docs");

// Components in both spaces, so imports have something real to pull from.
for (const [spaceId, name, description] of [
  [marketing, "Hero", "Full-bleed landing hero with headline and CTA."],
  [marketing, "Navbar", "Sticky top navigation with logo and links."],
  [marketing, "PricingCard", "Single pricing tier card."],
  [docs, "CodeBlock", "Syntax-highlighted code sample."],
  [docs, "Sidebar", "Docs tree navigation."],
]) {
  await sql`insert into components (space_id, name, description) values (${spaceId}, ${name}, ${description})`;
}

for (const [spaceId, title, slug] of [
  [marketing, "Home", "home"],
  [marketing, "Pricing", "pricing"],
  [marketing, "About", "about"],
  [docs, "Getting started", "getting-started"],
  [docs, "Components API", "components-api"],
]) {
  await sql`insert into pages (space_id, title, slug) values (${spaceId}, ${title}, ${slug})`;
}

console.log("seeded 2 spaces, 5 components, 5 pages");
