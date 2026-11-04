# The design brief (`rei.brief/1`)

`layout.mjs brief --site site.json --request "..."` writes one; edit the JSON, then `layout.mjs check --brief`.
Everything is in feet, x east, y north, in the site's local plane (`origin` is the lon/lat of 0,0).

```jsonc
{
  "schema": "rei.brief/1",
  "request": { "text": "exactly 240 garden apartments, 3 stories", "parser": "words" },   // kept, not hashed
  "site": {
    "crs": "local-ft", "units": "ft", "origin": [-95.80, 30.06],
    "ring": [[0,0],[900,0],[900,500],[0,500]],          // the property line, in order, no repeated closing point
    "holes": [],                                         // rings cut out of the site
    "front": 0, "streets": [1],                          // edge i runs ring[i] -> ring[i+1]; front = main street
    "access": { "edges": null, "entrances": [] },        // edges: the ONLY edges a drive may enter from (legal access)
    "setbacks": { "front": 25, "side": 10, "rear": 20, "paving": 10 },
    "exclusions": [{ "id": "ex1", "kind": "easement", "ring": [[...]], "source": "plat sheet 2" }],  // nothing built or paved on them
    "stormwater": null                                   // null / "onsite-pond" | "underground" | "offsite"
  },
  "program": {
    "uses": [{
      "id": "u1", "use": "multifamily",                  // multifamily, townhomes, duplex, sfr, retail, restaurant, office, industrial, storage, ...
      "form": "mf-garden",                               // see forms.md (the words set it; set it yourself to be sure)
      "quantity": { "mode": "exact", "value": 240, "unit": "units" },
      "depth": 83                                        // optional: corridor buildings this deep (an assumption, beyond the reviewed 65 ft)
    }],
    "overlays": [],                                      // senior / student / affordable: recorded only
    "parking": { "mode": "surface" },
    "engine": { ... }                                    // the engine's program, filled from the words: floors, zones, etc.
  },
  "rules": { "id": "...", "version": "...", "values": {
    "setbacks":        { "v": { "front": 25, "side": 10, "rear": 20, "paving": 10 }, "cls": "assumption", "source": "..." },
    "parkingPerUnit":  { "v": 1.6,  "cls": "verified",   "source": "City of X Code 35-123(b)" },
    "parkingPer1000":  { "v": null, "cls": "assumption", "source": "engine use default" },
    "buildingSeparation": { "v": 10, "units": "ft", "cls": "assumption", "source": "..." },
    "stall":           { "v": { "w": 9, "d": 18, "aisle": 24 }, "units": "ft", "cls": "assumption", "source": "..." },
    "buildingToDrive": { "v": 60, "units": "ft", "cls": "assumption", "source": "..." },
    "fireAccess":      { "v": 150, "units": "ft", "cls": "assumption", "source": "IFC 503.1.1" },
    "designVehicles":  { "v": { "car": "P", "fire": "FIRE", "service": "SU-30", "truck": "WB-67" }, "cls": "assumption", "source": "..." }
  }},
  "locks": [],
  "solver": { "seed": "rei-1", "tickMs": 25, "options": 3 }
}
```

## Quantity meaning

| mode | words | meaning |
|---|---|---|
| `exact` | "240 apartments", "exactly 28,000 sf" | exactly that (units 0 tolerance; sf 1%) |
| `min` | "at least 200" | that or more; the engine fills past it where the land allows |
| `max` | "up to 150" | that or fewer, aiming for the cap |
| `range` | "150-200 units" | `{ min, max }` |
| `maximize` | "as many as fit" | the most that passes every hard check |

`unit`: `units`, `sf` or `buildings`. A bare number with no qualifier is **exact**.

## Rules

Each rule is `{ v, cls, source }`. `cls: "verified"` only when you read the source (an ordinance section, an approved
plat, a recorded easement); everything else stays `"assumption"` and the check says the result rests on it. A rule
with `v: null` falls back to the engine's use default (shown as an assumption).

## Several uses

`program.uses` can hold several (mixed use, or garden + studio + townhomes); each gets its own zone. Placement words
("retail along the main road, apartments behind") set each zone's place (`front` / `middle` / `back`).

## Determinism

The input hash is the sha256 of the canonical brief (keys sorted, request text excluded). The same brief, seed and
engine version give the same layout; `layout.mjs replay` proves it.
