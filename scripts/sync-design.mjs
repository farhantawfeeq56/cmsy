/**
 * Regenerates app/dashboard/[space]/design.generated.json from DESIGN.md, the
 * single source of truth for the design system. Runs before dev and build
 * (`predev` / `prebuild` in package.json) so the artifact cannot go stale.
 *
 *   node scripts/sync-design.mjs
 *
 * Plain JS on purpose: it must run under any Node the team has, and the app
 * only ever imports the generated JSON.
 */
import { readFileSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);

/** One line and a non-zero exit, rather than an assertion dump in a build log. */
function fail(message) {
  console.error(`design:sync: ${message}`);
  process.exit(1);
}

/** Minimal YAML subset: `key: value` pairs and nested blocks by indentation. */
function parseYaml(src) {
  const root = {};
  const stack = [{ indent: -1, node: root }];

  for (const line of src.split("\n")) {
    if (!line.trim() || line.trim().startsWith("#")) continue;

    const indent = line.search(/\S/);
    const [key, ...rest] = line.trim().split(":");
    const value = rest.join(":").trim().replace(/^["']|["']$/g, "");

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();

    const parent = stack[stack.length - 1].node;
    if (value) {
      parent[key] = value;
    } else {
      const node = {};
      parent[key] = node;
      stack.push({ indent, node });
    }
  }
  return root;
}

const asTree = (value) =>
  typeof value === "object" && value !== null ? value : {};

/** DESIGN.md → the rules the Design System view renders. */
function parseDesign(source) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(source);
  if (!match) fail("DESIGN.md is missing its YAML frontmatter");

  const meta = parseYaml(match[1]);
  const prose = match[2];

  return {
    colors: Object.entries(asTree(meta.colors)).map(([name, value]) => ({
      name,
      value: String(value),
    })),
    typography: Object.entries(asTree(meta.typography)).map(([name, value]) => {
      const step = asTree(value);
      return {
        name,
        font: String(step.fontFamily ?? ""),
        size: String(step.fontSize ?? ""),
        weight: String(step.fontWeight ?? ""),
      };
    }),
    rounded: Object.entries(asTree(meta.rounded)).map(([name, value]) => ({
      name,
      value: String(value),
    })),
    guidelines: prose
      .split(/^## /m)
      .slice(1)
      .map((block) => {
        const [title, ...lines] = block.split("\n");
        return { title: title.trim(), lines };
      })
      .filter((section) => section.title),
  };
}

const design = parseDesign(
  // Normalised so the artifact is byte-identical on Windows and Linux: the
  // prose is embedded in the JSON, and a checkout with CRLF would otherwise
  // commit different bytes than CI generates.
  readFileSync(new URL("DESIGN.md", root), "utf8").replace(/\r\n/g, "\n"),
);

// Fail the build rather than shipping an empty design system view.
if (!design.colors.length) fail("DESIGN.md has no colors in its frontmatter");

// A value that is not hex (a stray inline comment, a named colour) renders as a
// blank swatch, so fail the sync rather than ship one.
const notHex = design.colors.filter((color) => !/^#[0-9a-f]{3,8}$/i.test(color.value));
if (notHex.length) {
  fail(`DESIGN.md has colours that are not hex: ${JSON.stringify(notHex)}`);
}

if (!design.typography.length) fail("DESIGN.md has no typography in its frontmatter");
if (!design.rounded.length) fail("DESIGN.md has no rounded values in its frontmatter");
if (!design.guidelines.length) fail("DESIGN.md has no `## Section` prose");

const out = new URL("app/dashboard/[space]/design.generated.json", root);
writeFileSync(out, `${JSON.stringify(design, null, 2)}\n`);
console.log(
  `design:sync wrote ${design.colors.length} colors, ${design.typography.length} type steps, ` +
    `${design.rounded.length} radii, ${design.guidelines.length} guideline sections`,
);
