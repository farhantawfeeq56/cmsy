#!/usr/bin/env node
// Lists the open PRs that touch the same files as your work, so an overlap is
// found before it becomes a merge conflict (#41).
//
//   node scripts/pr-overlap.mjs                        # this branch's changes vs origin/main
//   node scripts/pr-overlap.mjs app/dashboard db/index.ts  # files or folders you plan to touch
//   node scripts/pr-overlap.mjs --pr 42                # PR #42's files vs every other open PR
//
// A path argument matches a PR file exactly or as a folder prefix. Exits 0 when
// nothing overlaps, 1 when something does, 2 when it could not check. Needs
// `gh` signed in (or GH_TOKEN) and, without arguments, a fetched origin/main.
//
// Under GitHub Actions it also writes the result to the job summary and raises
// a warning annotation on each shared file.

import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";

const run = (cmd, args) => execFileSync(cmd, args, { encoding: "utf8" }).trim();
const lines = (text) => text.split("\n").filter(Boolean);

function parseArgs(argv) {
  const options = { pr: null, paths: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--pr") options.pr = Number(argv[++i]);
    else options.paths.push(argv[i].replace(/\/+$/, ""));
  }
  if (options.pr !== null && !Number.isInteger(options.pr)) {
    throw new Error("--pr needs a PR number");
  }
  return options;
}

/**
 * Committed, staged and unstaged changes on this branch. Untracked files are
 * left out: they are local until added, and a new file cannot conflict.
 */
function branchChanges() {
  const base = run("git", ["merge-base", "origin/main", "HEAD"]);
  return lines(run("git", ["diff", "--name-only", base]));
}

const touches = (path, file) => file === path || file.startsWith(`${path}/`);

function main() {
  const { pr, paths } = parseArgs(process.argv.slice(2));

  const open = JSON.parse(
    run("gh", [
      "pr", "list", "--state", "open", "--limit", "100",
      "--json", "number,title,url,author,headRefName,files",
    ]),
  );

  const branch = run("git", ["branch", "--show-current"]);
  const self = pr ?? open.find((p) => p.headRefName === branch)?.number;

  let mine;
  if (pr !== null) {
    const target = open.find((p) => p.number === pr);
    if (!target) throw new Error(`#${pr} is not an open PR`);
    mine = target.files.map((f) => f.path);
  } else {
    mine = paths.length ? paths : branchChanges();
  }
  mine = [...new Set(mine)];

  if (!mine.length) {
    console.log("No changed or planned files to check.");
    return 0;
  }

  const overlaps = open
    .filter((p) => p.number !== self)
    .map((p) => ({
      ...p,
      shared: p.files.map((f) => f.path).filter((file) => mine.some((path) => touches(path, file))),
    }))
    .filter((p) => p.shared.length);

  report(overlaps, mine.length, self);
  return overlaps.length ? 1 : 0;
}

function report(overlaps, checked, self) {
  const subject = self ? `#${self}` : "these files";
  if (!overlaps.length) {
    console.log(`No open PR overlaps ${subject} (${checked} file${checked === 1 ? "" : "s"} checked).`);
  }
  for (const p of overlaps) {
    console.log(`#${p.number} ${p.title}  (@${p.author.login}, ${p.headRefName})`);
    for (const file of p.shared) console.log(`    ${file}`);
  }

  if (!process.env.GITHUB_ACTIONS) return;

  for (const p of overlaps) {
    for (const file of p.shared) {
      console.log(`::warning file=${file}::#${p.number} (@${p.author.login}) also changes this file`);
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const body = overlaps.length
      ? [
          `### Shares files with ${overlaps.length} open PR${overlaps.length === 1 ? "" : "s"}`,
          "",
          "Coordinate on the issue before both land; whichever merges second resolves the conflict.",
          "",
          ...overlaps.flatMap((p) => [
            `- [#${p.number}](${p.url}) ${p.title} (@${p.author.login})`,
            ...p.shared.map((file) => `  - \`${file}\``),
          ]),
        ]
      : [`### No open PR overlaps ${subject}`];
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${body.join("\n")}\n`);
  }
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(`pr-overlap: ${error.message}`);
  process.exitCode = 2;
}
