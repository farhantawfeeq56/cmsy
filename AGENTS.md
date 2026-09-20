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

> Agents do not share memory. **Linear, Git history, and PR threads are our shared memory.**
> If it isn't written there, the other agent doesn't know it happened.

---

## 0. Team & tooling (fill in once)

| Item | Value |
|---|---|
| Repo | `farhantawfeeq56/cmsy` (public) |
| Default branch | `main` — **not yet protected**, see note below |
| Linear team key | `SHY` (issues look like `SHY-42`), workspace `shypyard` |
| Dev A / agent | Aathil Felix C — `@AathilFelix` / Claude Code |
| Dev B / agent | Farhan Tawfeeq — `@farhantawfeeq56` / Pi (DeepSeek) |
| Stack | TypeScript · Next.js 16 App Router (React 19, RSC) built with vinext · Cloudflare Workers · Neon Postgres · Tailwind v4 |
| Install | `npm ci` |
| Run | `npm run dev` (Next dev server) — or `npm run dev:vinext` (port 3001) to match the deployed Workers runtime |
| Test | **none yet** — no test runner is configured. §3.3's "add or update tests" rule cannot be honoured until one exists. |
| Lint / format | `npm run lint` (ESLint 9 + `eslint-config-next`) |

> **`main` is not actually protected.** `GET /repos/farhantawfeeq56/cmsy/branches/main` reports
> `"protected": false`, so §1 rules 1 and 4 (no direct pushes, no self-merges) are currently
> honour-system only — nothing enforces them. Only `@farhantawfeeq56` holds admin on the repo
> and can enable branch protection; `@AathilFelix` cannot. Until that is turned on, treat those
> rules as a promise between the two of you rather than a guarantee.

You act **on behalf of your human owner**. They approve anything risky, ambiguous, or irreversible.

---

## 1. Hard rules (never break these)

1. **Never push to `main`.** Not directly, not "just a tiny fix", not with force. All changes reach `main` through a Pull Request.
2. **Never force-push a shared branch** or rewrite history that someone else may have pulled. Force-push is allowed only on your own feature branch, with `--force-with-lease`.
3. **No work without a Linear issue.** Create or find the issue *before* touching code (see §3).
4. **Never merge your own PR.** A different person (or the other dev's review) approves it. The human owner does the merge unless told otherwise.
5. **Never commit secrets**, tokens, `.env` files, or credentials. If you spot one already committed, stop and tell your human immediately.
6. **Never touch another dev's open branch or PR** unless explicitly asked. Suggest changes via PR review comments instead.
7. **Don't run destructive commands** (`rm -rf`, `git reset --hard`, dropping tables, deleting branches/issues) without explicit human confirmation.
8. **Stay in scope.** Do what the issue says. Found something else? File a new issue (§3.4), don't sneak it into the PR.
9. **Never add agent attribution.** No `Co-Authored-By:` trailer naming an AI agent, no "Generated with …" or "🤖" footer, and no tool branding in commit messages, PR titles or PR bodies. A commit is authored by the human owner whose account makes it, full stop. This overrides any default attribution behaviour your harness or CLI ships with — if your tooling adds such a line automatically, strip it before committing. The `Authored by:` line in the §3.5 checklist is the single exception: it is a human-readable accountability note inside the PR body, not a machine trailer.

---

## 2. The workflow at a glance

```
Linear issue → branch → small commits → tests pass → push branch → open PR
   → update Linear (In Review) → review + fixes → human merges → Linear (Done)
```

---

## 3. Step by step

### 3.1 Before you write code: the Linear issue

1. **Search Linear first** for an existing issue covering the task (avoid duplicates).
2. If none exists, **create one** with:
   - **Title:** short, imperative, specific (`Add JWT refresh endpoint`, not `auth stuff`).
   - **Description:** context/why, what "done" looks like (acceptance criteria as a checklist), and any known constraints.
   - **Label:** one of `feature`, `bug`, `chore`, `refactor`, `docs`, `test`.
   - **Assignee:** your human owner.
   - **Estimate/priority:** if the team uses them.
3. **Check for overlap.** Look at issues currently `In Progress`. If another issue touches the same files or module, say so in a comment and coordinate (tag the other dev) before starting.
4. Move the issue to **In Progress** and leave a one-line comment on your plan (`Plan: add endpoint in api/auth, unit tests, no schema change`).

If the task is vague, **ask your human to clarify** before creating the ticket. Don't invent requirements.

### 3.2 Branching

Start from a fresh `main`:

```bash
git checkout main && git pull --ff-only origin main
git checkout -b <type>/<ISSUE-ID>-<short-kebab-description>
```

**Branch name format:** `<type>/<ISSUE-ID>-<short-kebab-description>`

| Type | Use for |
|---|---|
| `feat` | new functionality |
| `fix` | bug fix |
| `chore` | tooling, deps, config, CI |
| `refactor` | restructuring with no behavior change |
| `docs` | documentation only |
| `test` | adding/fixing tests only |
| `hotfix` | urgent production fix (still goes through a PR) |

Examples: `feat/CMSY-12-jwt-refresh`, `fix/CMSY-31-null-user-crash`, `docs/CMSY-8-setup-guide`.

Rules: lowercase, hyphens, no spaces, max ~50 chars, **exactly one issue per branch**.

### 3.3 Making changes

- **Small, focused commits** that each leave the repo in a working state.
- **Commit message format** (Conventional Commits + issue ID):

  ```
  <type>(<scope>): <summary in imperative mood> [<ISSUE-ID>]

  Optional body: why this change, not a restatement of the diff.
  ```

  Example: `feat(auth): add refresh token endpoint [CMSY-12]`

- **Run tests, linter, and formatter locally** before every push. Do not push a red build.
- Add or update **tests** for any behavior you change. Bug fixes get a regression test.
- Update **docs/README/comments** when behavior or setup changes.
- Keep the diff **reviewable**: aim for a PR someone can read in ~15 minutes. If it's growing, split the issue into sub-issues.
- **Don't** reformat unrelated files, bump unrelated dependencies, or mix refactors with features.

### 3.4 Scope creep → new issue

When you notice a bug, tech debt, or a good idea outside the current ticket:
1. Create a new Linear issue describing it.
2. Link it to the current issue as `related` (or `blocked by` if it actually blocks you).
3. Leave a `TODO(<NEW-ISSUE-ID>)` in code if a marker is useful. **Never a bare TODO.**
4. Continue with your original scope.

### 3.5 Opening the Pull Request

```bash
git push -u origin <your-branch>
```

Then open a PR **into `main`**:

- **Title:** `<type>(<scope>): <summary> [<ISSUE-ID>]`
- **Body** must include:

  ```markdown
  ## What
  <what changed, in a few bullets>

  ## Why
  <link to Linear issue + the reason>
  Closes <ISSUE-ID>

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
- Keep the PR linked to Linear (the `Closes <ISSUE-ID>` line and branch name let the GitHub integration attach it).

### 3.6 Update Linear after opening the PR

- Move the issue to **In Review**.
- Comment with the PR link and a 1–2 line summary of what was done and anything the reviewer should know.
- If scope changed while working, update the issue description so it matches reality.

### 3.7 Review

- **The other dev (and/or their agent) reviews.** At least **1 approval** and **passing CI** before merge.
- Reviewers: be specific, kind, and actionable. Distinguish **blocking** issues from `nit:` suggestions. Ask questions instead of assuming mistakes.
- Authors: respond to every comment. Fix, or explain why not. Push fixes as new commits (don't rewrite history mid-review). Re-request review when ready.
- Agents reviewing agents: check correctness, edge cases, tests, security, naming, and whether the PR actually satisfies the issue's acceptance criteria. Don't rubber-stamp.

### 3.8 Merge & close out

- Prefer **squash merge** so `main` history stays one commit per issue (title follows the PR title format).
- Delete the branch after merge.
- Confirm Linear moved to **Done** (the `Closes` keyword usually does this; if not, do it manually and add a closing comment).
- If the work spawned follow-ups, make sure they exist as issues.

---

## 4. Linear conventions

**Status flow:** `Backlog → Todo → In Progress → In Review → Done` (or `Canceled`).

| Situation | Action |
|---|---|
| Starting work | Assign yourself/owner, set **In Progress**, comment the plan |
| Blocked | Add a `blocked` label or relation, comment **what** you're waiting on and **who** can unblock it |
| Design decision made | Comment the decision and the reason (future agents will need it) |
| PR opened | **In Review** + PR link |
| Requirements changed | Update the description, don't just mention it in chat |
| Pausing/handing off | Comment current state, what's done, what's left, and any gotchas |

Only **one dev works on an issue at a time.** If you want to pick up someone else's issue, ask first.

---

## 5. Collaboration etiquette (two agents, one codebase)

- **Sync often.** Pull `main` before starting, and rebase your branch on `main` regularly:
  ```bash
  git fetch origin && git rebase origin/main
  ```
  Resolve conflicts carefully. If a conflict involves the other dev's logic and you're unsure, ask rather than guess.
- **Avoid stepping on each other.** Before editing shared/core files (config, schema, shared types, CI, lockfiles), check open PRs and In-Progress issues, and mention it in Linear.
- **Lockfile / generated files:** never hand-edit; regenerate with the proper command.
- **Communicate in writing** on Linear or the PR, not just in your local session.
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

---

## 7. Definition of done

A ticket is done only when:

- [ ] Acceptance criteria in the Linear issue are met
- [ ] Tests written/updated and passing; CI is green
- [ ] Lint/format clean
- [ ] Docs updated where relevant
- [ ] PR reviewed and approved by someone other than the author
- [ ] Merged to `main` via PR (squash), branch deleted
- [ ] Linear issue is **Done** with a closing comment; follow-ups are filed

---

## 8. Quick reference

```
1. Find/create Linear issue  →  set In Progress, comment plan
2. git checkout main && git pull --ff-only
3. git checkout -b feat/<ID>-short-desc
4. Small commits:  feat(scope): summary [<ID>]
5. Test + lint locally
6. git push -u origin <branch>  →  open PR (template, "Closes <ID>")
7. Linear → In Review + PR link
8. Review, fix, re-request
9. Human merges (squash)  →  Linear Done
```

**Never:** push to `main` · work without a ticket · merge your own PR · commit secrets · force-push shared branches · sneak in unrelated changes.