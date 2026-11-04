# Edits (`rei.edit/1`)

`layout.mjs edit --record out/run.json --words "..." --out out2/`, or `--edits edits.json` with a typed list. Each
edit set is one transaction, re-validated as a whole: locked pieces never move, and a result that loses a hard check
the option passed (or moves a lock) is **refused** with the conflicts listed and the record unchanged. The record keeps
every step, so it replays exactly. `--option N` edits option N (default 1).

| op | fields | example |
|---|---|---|
| `lock` / `unlock` | `target` | `{ "op": "lock", "target": { "kind": "building" } }` |
| `move` | `target`, `to`: `"center"`, `[x, y]` or `{ dx, dy }` | `{ "op": "move", "target": { "kind": "pool" }, "to": "center" }` |
| `keep-entrance` | `target: { entrance: "northwest" }` | keep that entrance, re-fit the rest round it |
| `regenerate` | — | lay out again round the locks |
| `set-quantity` | `use`, `quantity` | `{ "op": "set-quantity", "use": "multifamily", "quantity": { "mode": "exact", "value": 200, "unit": "units" } }` |
| `set-form` | `use`, `form` | `{ "op": "set-form", "use": "multifamily", "form": "mf-townhome" }` |
| `compare-forms` | `use`, `forms` | runs each form on the same program and reports; changes nothing on the plan |
| `set-office-share` | `use`, `share` (0-1) | flex office share (raises the parking required) |
| `place` | `use`, `where`: front / back / middle / corner | reorders the zones of a mixed plan |

Targets: `{ "ids": [...] }` (piece ids from run.json), `{ "kind": "building", "use": "amenity", "name": "Clubhouse" }`,
or `{ "entrance": "north" | "southwest" | ... }`.

Words the parser reads (deterministic, no AI): "keep the buildings and move the pool to the center", "keep the
northwest entrance and regenerate the rest", "keep 240 units but compare garden apartments with townhomes". Anything
else (changing the form, a new count, locking one building): write the typed edit; if a phrase isn't understood the
command says so and changes nothing.
