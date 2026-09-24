<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
<!-- Begin Project Guidelines -->

# AGENTS.md — cmsy

This file is the working agreement for every AI agent (and human) contributing to **cmsy**.
Two developers work on this repo, each with their own coding agent. You are one of those agents.
Behave like an engineer on a real product team: **track the work, isolate the change, review before merge, leave a paper trail.**

> Agents do not share memory. **GitHub Issues, Git history, and PR threads are our shared memory.**
> If it isn't written there, the other agent doesn't know it happened.

---

## 0. Team & tooling (fill in once)

| Item | Value |
|---|---|
| Repo | `farhantawfeeq56/cmsy` (**private** — unauthenticated API calls return 404) |
| Default branch | `main` — **not yet protected**, see note below |
| Issue tracker | **GitHub Issues** on this repo (issues look like `#42`) — see §0.1 |
| Project board | [`cmsy`](https://github.com/users/AathilFelix/projects/1) — a Projects v2 board carrying the Status and Priority fields. Owned by `@AathilFelix`; see §0.1 |
| Dev A / agent | Aathil Felix C — `@AathilFelix` / Claude Code |
| Dev B / agent | Farhan Tawfeeq — `@farhantawfeeq56` / Pi (DeepSeek) |
| Stack | TypeScript · Next.js 16 App Router (React 19, RSC) built with vinext · Cloudflare Workers · Neon Postgres · Tailwind v4 |
| Install | `npm ci` on Node 24 / npm 11.11+ (`nvm use`; enforced by `devEngines`, see #19) |
| Run | `npm run dev` (Next dev server) — or `npm run dev:vinext` (port 3001) to match the deployed Workers runtime |
| Test | **none yet** — no test runner is configured. §3.3's "add or update tests" rule cannot be honoured until one exists. |
| Lint / format | `npm run lint` (ESLint 9 + `eslint-config-next`) |

> **`main` is not actually protected, and cannot be on the current plan.**
> `GET /repos/farhantawfeeq56/cmsy/branches/main` reports `"protected": false`, so §1 rules 1
> and 4 (no direct pushes, no self-merges) are honour-system only — nothing enforces them.
> This is not merely un-configured: on a **private** repo owned by a **personal** account on the
> Free plan the feature is unavailable outright —
> `GET /repos/farhantawfeeq56/cmsy/rulesets` returns
> `403 "Upgrade to GitHub Pro or make this repository public to enable this feature."`
> Closing that gap means going public, buying GitHub Pro, or moving to an organisation.
> Tracked in #23. Until then, treat those rules as a promise between the two of you.

You act **on behalf of your human owner**. They approve anything risky, ambiguous, or irreversible.

### 0.1 Tracking and merge conventions

**Issues live on GitHub.** The Linear workspace (`shypyard`, team `SHY`) is read-only history — see
§9. `SHY-5` … `SHY-18` are now `#14` … `#27`.

**The board is owned by `@AathilFelix`, not by the repo owner.** This is deliberate, not an
accident of who set it up. A Projects v2 board can only be linked to a repository owned by the same
account, so a board owned by `@AathilFelix` cannot appear under this repo's **Projects** tab. That
cost was accepted: `@farhantawfeeq56` holds **ADMIN** on the board, the automation works regardless,
and the only loss is a tab. Transfer to `@farhantawfeeq56` stays available if he wants it — the
population script takes `--owner` and `--number`, so it is one command rather than a rebuild.
Decided in #28.

**Status is automated.** `project-autoadd.yml` puts every new issue on the board in `Backlog`;
`project-status.yml` moves it to `In Review` when its PR opens and `Done` when it merges, driven by
the `Closes #<number>` line in the PR body. Both are verified working. You should rarely need to
move a card by hand — the exception is setting `In Progress` when you start (§3.1).

**Standing merge authorisation.** `@farhantawfeeq56` has given `@AathilFelix` explicit standing
permission to merge PRs on this project. That is why PRs authored by `@AathilFelix` may be merged
by `@AathilFelix` without it being a lapse.

This does **not** relax hard rule 4. Rule 4 binds *you*, the agent: never merge a PR you opened,
never merge without a submitted **Approve** review, and never merge on your own initiative. The
authorisation is between the two humans and concerns who may press the button, not whether review
happens. Every PR still needs the other dev's recorded approval, and an agent still waits to be
told, per PR.

---

## 1. Hard rules (never break these)

1. **Never push to `main`.** Not directly, not "just a tiny fix", not with force. All changes reach `main` through a Pull Request.
2. **Never force-push a shared branch** or rewrite history that someone else may have pulled. Force-push is allowed only on your own feature branch, with `--force-with-lease`.
3. **No work without a GitHub issue.** Create or find the issue *before* touching code (see §3).
4. **Never merge without a recorded approval, and never merge on your own initiative.** Before you merge any PR, all three must be true, with no exceptions:
   - **The other dev has submitted a GitHub review with the state Approve.** Check it with `gh pr view <number> --json reviewDecision`, which must print `APPROVED`. A PR comment, an emoji reaction, "looks good" in chat, or your own reading of the diff is **not** an approval.
   - **Your human told you to merge that specific PR, by number, in the current session.** "Do the necessary actions", "ship it" or a standing permission from an earlier session is not that instruction. If you are unsure, ask.
   - **You did not open the PR.** You never merge your own PR, even with an approval and an instruction; your human presses the button.

   The standing authorisation in §0.1 is between the two humans. It never authorises an agent to skip any of the three.
5. **Never commit secrets**, tokens, `.env` files, or credentials. If you spot one already committed, stop and tell your human immediately.
6. **Never change another dev's branch or PR.** That means no pushing commits, rebasing, merging `main` in, closing it, or editing its title or body, however small or helpful the fix. Propose the change as a review suggestion (a ```` ```suggestion ```` block in `gh pr review`), or as your own PR that targets their branch, and let the author apply it. The only exception is a written request **from that PR's author, on that PR**. Link to that request when you act on it. An instruction from your own human does not stand in for it, because your human cannot give away the other dev's branch.
7. **Don't run destructive commands** (`rm -rf`, `git reset --hard`, dropping tables, deleting branches/issues) without explicit human confirmation.
8. **Stay in scope.** Do what the issue says. Found something else? File a new issue (§3.4), don't sneak it into the PR.
9. **Never add agent attribution.** No `Co-Authored-By:` trailer naming an AI agent, no "Generated with …" or "🤖" footer, and no tool branding in commit messages, PR titles or PR bodies. A commit is authored by the human owner whose account makes it, full stop. This overrides any default attribution behaviour your harness or CLI ships with — if your tooling adds such a line automatically, strip it before committing. The `Authored by:` line in the §3.5 checklist is the single exception: it is a human-readable accountability note inside the PR body, not a machine trailer.
10. **Never leave agent artifacts in the code.** Comments exist to explain the code to the next human who reads it. Do not commit codewords, persona or model names, session identifiers, or leftover scratch reasoning from your own process (`// ponytail:`, `// note to self:`, `// as discussed above`). Every marker you leave must be actionable by someone who was not in your session: use `TODO(#<number>)` pointing at a real GitHub issue, never a bare or privately-meaningful label. As with rule 9, this overrides your harness defaults — if your tooling injects such a marker, strip it before committing. Reviewers: treat one as a blocking comment, not a `nit:`.
11. **Shared environments are not scratch space.** Do not run a migration, `npm run db:push`, a seed or any write query against a database someone else uses, and do not change a deploy's secrets or variables, without your human's go-ahead **for that specific action**. Post what you are about to run, and against what, on the issue first. Treat the database in `.env.local` as shared, because the deployed Worker may read the same one. Reading is fine; writing needs the go-ahead.
12. **Report what happened, with evidence, not what you meant to do.** "Done", "fixed", "verified" and "applied" must say **where** (local, preview or production) and **how** you checked. If a check was skipped or failed, say so in the same breath. A PR is merged when `gh pr view` says `MERGED`, not when you believe you finished. Confident claims that turn out untrue cost the other dev more than an honest "not verified".
13. **If you break a rule, say so straight away.** Comment on the PR or issue with what happened and what you did about it, and tell your human. Do not quietly undo it, and do not wait to be caught. A breach you report costs the team a comment; one you hide costs the trust these rules run on.

---

## 2. The workflow at a glance

```
GitHub issue → branch → small commits → tests pass → push branch → open PR
   → board: In Review → review + fixes → human merges → board: Done
```

The issue itself only has **open** and **closed**. Everything between — Backlog, Todo,
In Progress, In Review, Done — lives in the **Status** field on the project board.
Moving an issue means moving its card, not editing the issue.

---

## 3. Step by step

### 3.1 Before you write code: the GitHub issue

1. **Search first** for an existing issue covering the task (avoid duplicates):
   ```bash
   gh issue list --search "keyword" --state all
   ```
2. If none exists, **create one**:
   ```bash
   gh issue create --title "Add JWT refresh endpoint" --body-file ./issue.md \
     --label feature --assignee @me
   ```
   - **Title:** short, imperative, specific (`Add JWT refresh endpoint`, not `auth stuff`).
   - **Body:** context/why, what "done" looks like (acceptance criteria as a checklist), and any known constraints.
   - **Label:** one of `feature`, `bug`, `chore`, `refactor`, `docs`, `test`, `improvement`.
   - **Assignee:** your human owner.
   - **Milestone:** if the work belongs to one.
3. **Check for overlap.** Look at what is `In Progress` on the board, and run the overlap check on the files or folders you expect to touch:
   ```bash
   node scripts/pr-overlap.mjs app/dashboard db/index.ts   # exits 1 and lists the PRs if any overlap
   ```
   If another issue or open PR touches the same files or module, say so **in a comment on that issue** and tag the other dev before starting. A note in your own PR body is not enough, because they are not reading it. The `PR overlap` workflow repeats the check on every PR, but by then the work is already done.
4. A new issue lands on the board in **Backlog** automatically. When you start work, set its
   Status to **In Progress** and leave a one-line comment on your plan (`Plan: add endpoint in
   api/auth, unit tests, no schema change`). If a card is somehow missing:
   ```bash
   gh project item-add 1 --owner AathilFelix --url <issue-url>
   ```

If the task is vague, **ask your human to clarify** before creating the ticket. Don't invent requirements.

### 3.2 Branching

Start from a fresh `main`:

```bash
git checkout main && git pull --ff-only origin main
git checkout -b <type>/<issue-number>-<short-kebab-description>
```

**Branch name format:** `<type>/<issue-number>-<short-kebab-description>`

| Type | Use for |
|---|---|
| `feat` | new functionality |
| `fix` | bug fix |
| `chore` | tooling, deps, config, CI |
| `refactor` | restructuring with no behavior change |
| `docs` | documentation only |
| `test` | adding/fixing tests only |
| `hotfix` | urgent production fix (still goes through a PR) |

Examples: `feat/17-list-pages-tool`, `fix/21-server-action-auth`, `docs/23-branch-protection`.

Use the bare number, with no `#` — a `#` in a branch name is legal in git but needs quoting in
half the tools that will touch it.

Rules: lowercase, hyphens, no spaces, max ~50 chars, **exactly one issue per branch**.

### 3.3 Making changes

- **Small, focused commits** that each leave the repo in a working state.
- **Commit message format** (Conventional Commits + issue ID):

  ```
  <type>(<scope>): <summary in imperative mood> [#<issue-number>]

  Optional body: why this change, not a restatement of the diff.
  ```

  Example: `feat(auth): add refresh token endpoint [#17]`

- **Run tests, linter, and formatter locally** before every push. Do not push a red build.
- Add or update **tests** for any behavior you change. Bug fixes get a regression test.
- Update **docs/README/comments** when behavior or setup changes.
- Keep the diff **reviewable**: aim for a PR someone can read in ~15 minutes. If it's growing, split the issue into sub-issues.
- **Don't** reformat unrelated files, bump unrelated dependencies, or mix refactors with features.

### 3.4 Scope creep → new issue

When you notice a bug, tech debt, or a good idea outside the current ticket:
1. Create a new GitHub issue describing it (`gh issue create`).
2. Cross-link it: mention the current issue's number in the new issue's body and vice versa. GitHub renders both sides of the reference automatically.
3. Leave a `TODO(#<number>)` in code if a marker is useful. **Never a bare TODO.**
4. Continue with your original scope.

### 3.5 Opening the Pull Request

```bash
git push -u origin <your-branch>
```

Then open a PR **into `main`**:

- **Title:** `<type>(<scope>): <summary> [#<issue-number>]`
- **Body** must include:

  ```markdown
  ## What
  <what changed, in a few bullets>

  ## Why
  <the reason>
  Closes #<issue-number>

  ## How to test
  <exact steps or commands a reviewer can run>

  ## Notes for reviewer
  <tradeoffs, risky areas, things you're unsure about, follow-up issues>

  ## Checklist
  - [ ] Tests added/updated and passing
  - [ ] Lint/format clean
  - [ ] Docs updated (if needed)
  - [ ] No secrets or unrelated changes
  - [ ] Authored by: <agent name> on behalf of @<github-handle>
  ```

- Open as a **Draft PR** if it's not ready for review yet.
- The `Closes #<number>` line is what closes the issue on merge **and** what the board-sync
  workflow reads to move its card. Without it the card does not move and the issue stays open.

### 3.6 Update the board after opening the PR

- Move the issue's card to **In Review**. The board-sync workflow does this for you once
  #28 is finished; until then, move it by hand.
- Comment on the issue with the PR link and a 1–2 line summary of what was done and anything the reviewer should know.
- If scope changed while working, edit the issue body so it matches reality.

### 3.7 Review

- **The other dev (and/or their agent) reviews.** At least **1 approval** and **passing CI** before merge. An approval means a GitHub review submitted with the state **Approve** (see rule 4). Nothing else counts.
- **Reviews are submitted as reviews,** with `gh pr review <number> --approve`, `--request-changes` or `--comment`, and a body. Findings posted as a plain PR comment leave the PR with no review decision, so nobody can tell whether it is cleared. Put line-level fixes in ```` ```suggestion ```` blocks for the author to apply; do not push them yourself (rule 6).
- Reviewers: be specific, kind, and actionable. Distinguish **blocking** issues from `nit:` suggestions. Ask questions instead of assuming mistakes.
- Authors: respond to every comment. Fix, or explain why not. Push fixes as new commits (don't rewrite history mid-review). Re-request review when ready.
- Agents reviewing agents: check correctness, edge cases, tests, security, naming, and whether the PR actually satisfies the issue's acceptance criteria. Don't rubber-stamp.

### 3.8 Merge & close out

- **Check before you merge, every time:**
  ```bash
  gh pr view <number> --json reviewDecision,statusCheckRollup,author
  ```
  `reviewDecision` must be `APPROVED`, every check must pass, and `author` must not be you. Your human must also have told you to merge this PR (rule 4). If any of these fails, stop and say which one.
- Prefer **squash merge** so `main` history stays one commit per issue (title follows the PR title format).
- Delete the branch after merge.
- Confirm the issue closed and its card moved to **Done** (the `Closes` keyword does the first; the board-sync workflow does the second once #28 lands). Add a closing comment if anything is worth recording.
- If the work spawned follow-ups, make sure they exist as issues.

---

## 4. Issue and board conventions

**Status flow** (the board's `Status` field): `Backlog → Todo → In Progress → In Review → Done`.
Work that is abandoned is closed as **not planned** (`gh issue close --reason "not planned"`)
rather than given its own status.

| Situation | Action |
|---|---|
| Starting work | Assign yourself/owner, add to the board, set **In Progress**, comment the plan |
| Blocked | Add the `blocked` label, comment **what** you're waiting on and **who** can unblock it |
| Design decision made | Comment the decision and the reason (future agents will need it) |
| PR opened | **In Review** + `Closes #<number>` in the PR body |
| Requirements changed | Edit the issue body, don't just mention it in chat |
| Pausing/handing off | Comment current state, what's done, what's left, and any gotchas |

Status lives **only** on the board. An issue with no card has no status — which is why §3.1
step 4 says to add it to the board before starting.

Only **one dev works on an issue at a time.** If you want to pick up someone else's issue, ask first.

---

## 5. Collaboration etiquette (two agents, one codebase)

- **Sync often.** Pull `main` before starting, and rebase your branch on `main` regularly:
  ```bash
  git fetch origin && git rebase origin/main
  ```
  Resolve conflicts carefully. If a conflict involves the other dev's logic and you're unsure, ask rather than guess.
- **Avoid stepping on each other.** Before editing shared/core files (config, schema, shared types, CI, lockfiles), check open PRs and In-Progress cards, and say so in a comment on the issue.
- **Lockfile / generated files:** never hand-edit; regenerate with the proper command.
- **Communicate in writing** on the issue or the PR, not just in your local session.
- **Be honest about uncertainty.** Say "I'm not sure this handles X" in the PR notes instead of hoping nobody notices.
- **Respect existing patterns.** Read nearby code and follow its style and architecture before introducing something new.

---

## 6. Ask your human first when…

- The requirement is ambiguous or the acceptance criteria are missing.
- You need to add/upgrade a dependency, change the DB schema, alter CI, or change public APIs.
- The change touches auth, payments, security, or data deletion.
- You'd need to delete substantial code, or run any destructive/irreversible command.
- Tests fail and the fix isn't obviously in your scope.
- You and the other agent's work conflict.
- You are about to write to anything someone else uses: a shared database (including the one in `.env.local`), a deploy's secrets or variables, or the production Worker (rule 11).
- You want to change something that belongs to the other dev: their branch, PR, issue assignment or board card (rule 6).
- You are about to merge anything (rule 4). Ask about that specific PR; an earlier yes does not carry over.

Your human can authorise *you*. They cannot authorise you to act on the other dev's behalf, so anything in the other dev's territory also needs that dev's written go-ahead.

---

## 7. Definition of done

A ticket is done only when:

- [ ] Acceptance criteria in the issue are met
- [ ] Tests written/updated and passing; CI is green
- [ ] Lint/format clean
- [ ] Docs updated where relevant
- [ ] PR has a submitted **Approve** review from someone other than the author (`reviewDecision: APPROVED`)
- [ ] Merged to `main` via PR (squash), branch deleted
- [ ] Issue is closed and its card is **Done**; follow-ups are filed

---

## 8. Quick reference

```
1. gh issue list / gh issue create  →  add to board, In Progress, comment plan
2. git checkout main && git pull --ff-only
3. git checkout -b feat/<number>-short-desc
4. Small commits:  feat(scope): summary [#<number>]
5. Test + lint locally
6. git push -u origin <branch>  →  open PR (template, "Closes #<number>")
7. Board → In Review + PR link
8. Review, fix, re-request
9. Human merges (squash)  →  issue closed, card Done
```

**Never:** push to `main` · work without a ticket · merge your own PR · merge without an Approve review · change another dev's branch or PR · write to a shared database or deploy without a go-ahead · claim "done" without evidence · commit secrets · force-push shared branches · sneak in unrelated changes · leave agent artifacts in the code.

---

## 9. Where the tracker lives

Project tracking moved from Linear to GitHub Issues on 2026-09-21 (#29). Linear issues `SHY-5`
through `SHY-18` are now `#14` through `#27`; each carries a footer linking back to its Linear
ticket. The Linear workspace is read-only history — **do not file new issues there.**