# Decisions

One line per decision: what was chosen and why. Newest at the bottom of each phase.

## Phase 0: Setup
- Branch `experimental` cut from `main` (c1a6495, "Refresh data 2026-10-24"): `main` is the default branch and the only long-lived one in this repo.
- Integration rules live in `CLAUDE.md` as well as here, so every later session loads them automatically.
- The repo's existing rule (a CHANGELOG.md entry for every push) still applies on `experimental`; entries say "experimental branch" so they aren't mistaken for production releases.
