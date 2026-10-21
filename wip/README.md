# Work in progress: Phase 5 (detention, trails, sidewalks)

Phase 5 of `NEIGHBORHOOD-PLAN.md` was stopped part-way on Oct 20 at the user's request. Nothing here is live in the app; the app is exactly as Phase 4b left it (b1b1f11).

- `phase5.patch`: the unfinished changes (23 files, including new `lib/detention.mjs`, `lib/trails.mjs` and `test/sitewater.mjs`), made against b1b1f11.
- `phase5-spec.md`: the phase's implementation spec.

Where it stopped:
- Done: the core (low side, ponds and outfalls, sidewalks, metrics, map features, checks), the detention and trail engines, Change With AI, the AI schema, the editor, the pro forma and the PDF sheet.
- In progress: tests (`test/sitewater.mjs`), before/after numbers, renders, the product doc.
- Not yet run: the phase's three-way checks, fixes and the full `npm test`.

To pick it up: `git apply wip/phase5.patch` on top of b1b1f11 (or later, resolving conflicts), finish the tests, then check, fix, `npm test`, and delete this folder in the same push.
