# The five views

All five are placed relative to the site's **street side** (the front edge in `site.edges.front`, or the boundary edge
nearest a street), so they work on any site orientation. The aerials are fitted so the whole site fills the frame.

| # | id | View | Camera |
|---|---|---|---|
| 1 | `corner_left` | Aerial from the front-left corner | 30° above the horizon, 42° left of straight-on, 45° lens; the whole site framed |
| 2 | `corner_right` | Aerial from the front-right corner | The same, 42° to the right |
| 3 | `street` | Street level from across the road | Eye height (5.5 ft) on the far sidewalk, toward the right end of the frontage, looking diagonally at the main building; 62° lens; horizon a little below the middle |
| 4 | `entry` | Arriving at the main entrance | 32 ft up, just outside the drive that meets the street, looking up the drive at the main building; 58° lens |
| 5 | `rear` | High aerial from the rear corner | 42° above the horizon from behind the site, looking back toward the road |

"Main building": the one with the largest floor area. Trees within 45 ft of the street and entry cameras are left out, so a
crown doesn't fill the lens.

## Adjusting a view

Write a JSON list with only what changes, and pass it with `--views-file views.json`:

```json
[
  {"id": "corner_left", "az": -30, "el": 24},
  {"id": "rear", "az": 160, "el": 50},
  {"id": "street", "fov": 50}
]
```

`az` is in degrees from straight-on to the street side (negative = left as seen from the street), `el` is degrees above the
horizon, and `fov` is the horizontal lens angle. Change the `words` too when the description no longer fits: the prompt
uses them. Keep five distinct angles, as the user asked for five different ones.

Typical fixes:
- The **street** view only shows the side of a pad: narrow the lens (`"fov": 45`), or turn it into a very low aerial from
  a better angle (`{"id": "street", "kind": "aerial", "az": 15, "el": 8, "words": "a low view from just above the road…"}`).
- A deep site looks flat in the aerials: raise `el` (35–40).
- Several main buildings: two aerials from the sides that show the most storefront.

## Midday

The sun is at 62° elevation and 190° azimuth (just past solar noon, from the south), so shadows are short and fall to the
north. That's a realistic Texas midday from spring to fall. `--sun-el` and `--sun-az` change it. Keep it midday unless the
user asks otherwise. The prompt describes the same light, and the massing's shadows set its direction.
