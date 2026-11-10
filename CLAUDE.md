# Matcha stock and profit app

This app tracks stock and profit for the user's Etsy matcha shop (Marukyu Koyamaen, 5 SKUs) and a friend's store in Texas. The friend records store sales on a phone; the user checks the dashboard daily. It is live on Vercel with Neon Postgres and a read-only Etsy sync. Phases 1 and 2 are done; Telegram alerts (phase 3) and the backlog remain.

## Model and effort

- **Planning** (requirements, specs, implementation plans, reviews): use Opus 5.5 (`claude-opus-5-5`) at medium effort.
- **Executing** (building the app, writing code, designing screens or mockups): use Sonnet 5.5 (`claude-sonnet-5-5`) at medium effort. When delegating this work to an agent, set `model: "sonnet"` and `effort: "medium"`.

## Working with the user

- **Plain language, short answers, and a recommendation.** Use tables for comparisons. End with what wasn't checked.
- **The user pushes and merges.** Work on a branch and ask them to run `git push`. Open the PR with `gh pr create`, and let them press Merge.
- **Their account steps are theirs:** the Etsy portal, Vercel or GitHub sign-in, and pasting secrets. Have them put a secret in `.env.local`; you move it from there without printing it.
- **Secrets never appear in chat or output.** That covers `.env.local` values, `APP_KEY`, tokens and connection strings. Read them into variables or pipes.
- **Production data is real.** Tests run only on the Neon `test` branch. Confirm before any production write the user hasn't asked for.
- **Verify before you report.** Use live curl checks or a database read, and state what you saw.

## Project files

- **Operations runbook:** `docs/OPERATIONS.md`. It covers the live setup, commands, shipping a change, Etsy facts, money rules and lessons learned. Read it before you deploy, migrate, touch production data, work on the Etsy sync, or debug the live site.
- **Requirements:** `REQUIREMENTS.md`, a copy of the live document at https://claude.ai/artifact/TaFBwsKuvXB2z7tnaUfBA1. Update both together.
- **Design spec:** `docs/superpowers/specs/2026-11-06-matcha-stock-profit-app-design.md`. It is the binding authority. §12 records assumptions confirmed against the real shop.
- **Plans:**
  - phase 1: `docs/superpowers/plans/2026-11-06-phase-1-core-app.md`
  - phase 2: `docs/superpowers/plans/2026-11-09-phase-2-etsy-read.md`
- **Next.js 16 notes:** `AGENTS.md`.

## Repository

- **Official repo:** https://github.com/tuanmonn/matcha-stock-management (remote `origin`).
- **Branches:** `main` is the default and deploys production. Each change goes on its own branch.
