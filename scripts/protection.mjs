#!/usr/bin/env node
// Enforces the two review lanes on main (#83). See AGENTS.md §3.7.
//
//   node scripts/protection.mjs lane --pr 42   # may PR #42 merge, as far as review goes?
//   node scripts/protection.mjs drift          # do main's live rules match the checked-in spec?
//
// `lane` puts a PR in the human lane when it touches a path listed in
// .github/CODEOWNERS, read from the PR's base branch so a PR cannot edit itself
// out. A human-lane PR passes once the other dev has approved its head commit
// with a non-empty review body. Any PR, in either lane, fails while someone's
// latest review requests changes.
//
// `drift` compares the rules GitHub enforces on main with
// .github/rulesets/main-protection.json and fails on any difference, and checks
// that GitHub accepts .github/CODEOWNERS. It cannot see the ruleset's bypass
// list: that needs admin, and the Actions token is not admin.
//
// Exits 0 on pass, 1 on fail, 2 when it could not check. Needs `gh` signed in,
// or GH_TOKEN. Under GitHub Actions it also writes the result to the job
// summary.

import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const SPEC_PATH = ".github/rulesets/main-protection.json";
const CODEOWNERS_PATH = ".github/CODEOWNERS";
const BRANCH = "main";

/**
 * Parses CODEOWNERS into `{ pattern, owners }` rules, in file order. Only
 * anchored paths are accepted (`/file` or `/folder/`), because the matching
 * here is deliberately simpler than GitHub's gitignore-style globbing; a
 * pattern it cannot match exactly as GitHub would is an error, not a guess.
 */
export function parseCodeowners(text) {
  return text
    .split("\n")
    .map((line) => line.replace(/#.*/, "").trim())
    .filter(Boolean)
    .map((line) => {
      const [pattern, ...owners] = line.split(/\s+/);
      if (!pattern.startsWith("/") || /[*?[\]!\\]/.test(pattern)) {
        throw new Error(
          `CODEOWNERS: "${pattern}" is not an anchored path. Use /file or /folder/, without wildcards.`,
        );
      }
      if (!owners.length) throw new Error(`CODEOWNERS: "${pattern}" has no owners.`);
      return { pattern, owners: owners.map((owner) => owner.replace(/^@/, "").toLowerCase()) };
    });
}

function matches(pattern, file) {
  const path = pattern.slice(1);
  if (path.endsWith("/")) return file.startsWith(path);
  return file === path || file.startsWith(`${path}/`);
}

/** The owners of `file`. As on GitHub, the last matching line wins. */
export function ownersFor(rules, file) {
  let owners = [];
  for (const rule of rules) if (matches(rule.pattern, file)) owners = rule.owners;
  return owners;
}

/**
 * Each reviewer's latest decisive review. A plain comment does not cancel an
 * approval or a change request, so COMMENTED reviews are skipped, as GitHub
 * does. Pending (unsubmitted) reviews and bots are ignored.
 */
function latestDecisive(reviews) {
  const latest = new Map();
  const decisive = reviews
    .filter((r) => r.submitted_at && r.user?.type !== "Bot")
    .filter((r) => ["APPROVED", "CHANGES_REQUESTED", "DISMISSED"].includes(r.state))
    .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
  for (const review of decisive) latest.set(review.user.login.toLowerCase(), review);
  return latest;
}

/**
 * Decides whether a PR may merge as far as review goes.
 *
 * @param {object} pr
 * @param {string} pr.author    login of the PR's author
 * @param {string} pr.headSha   the PR's head commit
 * @param {string[]} pr.files   paths the PR changes, including removed and renamed-from paths
 * @param {object[]} pr.reviews the PR's reviews, as the REST API returns them
 * @param {{pattern: string, owners: string[]}[]} pr.rules parsed CODEOWNERS
 */
export function laneVerdict({ author, headSha, files, reviews, rules }) {
  const guarded = files
    .map((file) => ({ file, owners: ownersFor(rules, file) }))
    .filter(({ owners }) => owners.length);
  const lane = guarded.length ? "human" : "fast";
  const latest = latestDecisive(reviews);
  const problems = [];

  for (const [login, review] of latest) {
    if (review.state === "CHANGES_REQUESTED") {
      problems.push(`@${login} has requested changes. They must approve or dismiss that review first.`);
    }
  }

  if (lane === "human") {
    const me = author.toLowerCase();
    const approvers = [...latest.values()].filter(
      (r) =>
        r.state === "APPROVED" &&
        r.user.login.toLowerCase() !== me &&
        r.commit_id === headSha &&
        r.body?.trim(),
    );
    for (const { file, owners } of guarded) {
      const others = owners.filter((owner) => owner !== me);
      if (!approvers.some((r) => others.includes(r.user.login.toLowerCase()))) {
        problems.push(
          `${file} is in the human lane and needs an Approve on the head commit, with a line on what was checked, from ${others.map((o) => `@${o}`).join(" or ") || "an owner other than the author"}.`,
        );
      }
    }
  }

  return { lane, guarded: guarded.map(({ file }) => file), ok: problems.length === 0, problems };
}

// Arrays are compared as sets, so the order GitHub returns them in is not drift.
function canonical(value) {
  if (Array.isArray(value)) return value.map((v) => JSON.stringify(canonical(v))).sort();
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
const show = (value) => (value === undefined ? "unset" : JSON.stringify(value));

/**
 * Lists every way the live rules on main differ from the spec. Only the
 * parameters the spec names are compared, since GitHub adds new ones over time.
 *
 * @param {object} spec the ruleset spec, as checked in
 * @param {object[]} liveRules GET /repos/{repo}/rules/branches/main
 * @param {string | undefined} liveEnforcement the enforcement of the live ruleset with the spec's name
 */
export function driftFrom(spec, liveRules, liveEnforcement) {
  const problems = [];
  if (liveEnforcement !== spec.enforcement) {
    problems.push(`ruleset "${spec.name}" enforcement is ${show(liveEnforcement)}, spec says ${show(spec.enforcement)}`);
  }

  for (const rule of spec.rules) {
    const candidates = liveRules.filter((live) => live.type === rule.type);
    if (!candidates.length) {
      problems.push(`${rule.type}: missing on ${BRANCH}`);
      continue;
    }
    const diffs = candidates.map((live) =>
      Object.entries(rule.parameters ?? {})
        .filter(([key, want]) => !same(want, live.parameters?.[key]))
        .map(([key, want]) => `${rule.type}: ${key} is ${show(live.parameters?.[key])}, spec says ${show(want)}`),
    );
    if (!diffs.some((d) => d.length === 0)) problems.push(...diffs[0]);
  }

  const specTypes = new Set(spec.rules.map((rule) => rule.type));
  for (const live of liveRules) {
    if (!specTypes.has(live.type)) problems.push(`${live.type}: enforced on ${BRANCH} but not in the spec`);
  }
  return problems;
}

// stderr is captured, not printed: it rides along in the error when a call fails.
const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const notFound = (error) => /HTTP 404/.test(`${error.stderr ?? ""}${error.message}`);
const api = (path) => JSON.parse(run("gh", ["api", path]));
const apiAll = (path) => JSON.parse(run("gh", ["api", "--paginate", "--slurp", path])).flat();

function repo() {
  return process.env.GITHUB_REPOSITORY || run("gh", ["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"]);
}

function summary(lines) {
  const text = lines.join("\n");
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

function readCodeowners(name, ref) {
  try {
    const file = api(`repos/${name}/contents/${CODEOWNERS_PATH}?ref=${ref}`);
    return Buffer.from(file.content, "base64").toString("utf8");
  } catch (error) {
    // Only a missing file counts as "no CODEOWNERS". Any other failure must not
    // fall through to the PR's own, possibly edited, copy.
    if (notFound(error)) return null;
    throw error;
  }
}

function lane(prNumber) {
  const name = repo();
  const pr = api(`repos/${name}/pulls/${prNumber}`);
  const files = apiAll(`repos/${name}/pulls/${prNumber}/files?per_page=100`).flatMap((f) =>
    f.previous_filename ? [f.filename, f.previous_filename] : [f.filename],
  );
  const reviews = apiAll(`repos/${name}/pulls/${prNumber}/reviews?per_page=100`);

  // The base branch's CODEOWNERS decides, as it does for GitHub. Only when the
  // base has none (the PR that first adds it) does the PR's own copy stand in.
  const text = readCodeowners(name, pr.base.sha) ?? readCodeowners(name, pr.head.sha) ?? "";
  const verdict = laneVerdict({
    author: pr.user.login,
    headSha: pr.head.sha,
    files,
    reviews,
    rules: parseCodeowners(text),
  });

  summary([
    `### Review lane: ${verdict.lane}`,
    "",
    verdict.lane === "human"
      ? `Human-lane files:\n${verdict.guarded.map((f) => `- \`${f}\``).join("\n")}`
      : "No file here is listed in `.github/CODEOWNERS`, so no approval is needed.",
    "",
    verdict.ok ? "Review requirements are met." : verdict.problems.map((p) => `- ${p}`).join("\n"),
  ]);
  return verdict.ok ? 0 : 1;
}

function drift() {
  const name = repo();
  const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
  const liveRules = api(`repos/${name}/rules/branches/${BRANCH}`);
  const ruleset = api(`repos/${name}/rulesets`).find((r) => r.name === spec.name);
  const problems = driftFrom(spec, liveRules, ruleset?.enforcement);

  try {
    parseCodeowners(readFileSync(CODEOWNERS_PATH, "utf8"));
  } catch (error) {
    problems.push(error.code === "ENOENT" ? `${CODEOWNERS_PATH} is missing` : error.message);
  }
  const ref = process.env.GITHUB_SHA || run("git", ["rev-parse", "HEAD"]);
  try {
    const { errors } = api(`repos/${name}/codeowners/errors?ref=${ref}`);
    for (const e of errors) problems.push(`CODEOWNERS line ${e.line}: ${e.message.split("\n")[0]}`);
  } catch (error) {
    // 404 until the commit is on GitHub; the local parse above still ran.
    if (!notFound(error)) throw error;
  }

  summary(
    problems.length
      ? [
          `### ${BRANCH} protection has drifted from \`${SPEC_PATH}\``,
          "",
          ...problems.map((p) => `- ${p}`),
          "",
          "Either the ruleset was changed without a PR, or a PR changed the spec and it has not been applied yet.",
          "The repo admin applies the spec with:",
          "",
          "```bash",
          ruleset
            ? `gh api -X PUT repos/${name}/rulesets/${ruleset.id} --input ${SPEC_PATH}`
            : `gh api -X POST repos/${name}/rulesets --input ${SPEC_PATH}`,
          "```",
        ]
      : [`### ${BRANCH} protection matches \`${SPEC_PATH}\``],
  );
  return problems.length ? 1 : 0;
}

function main(argv) {
  const [command, flag, value] = argv;
  if (command === "drift") return drift();
  if (command === "lane" && flag === "--pr" && /^\d+$/.test(value ?? "")) return lane(Number(value));
  console.error("Usage: node scripts/protection.mjs lane --pr <number> | drift");
  return 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
