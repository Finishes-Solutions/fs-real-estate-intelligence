---
name: fs-site-renderings
description: Make five photoreal midday renderings of a planned property, from five different angles, true to its site layout and schematic design set, using OpenAI's gpt-image-2.5-sunburst at high quality. Builds an exact 3D massing model from the project (the fs-site-plan hand-off with the fs-set-plans building designs), renders the five camera views, has the image model paint each one photographically while keeping the geometry, checks every picture against its massing, and puts them on a renderings sheet and back into the plan set. Use when the user asks for "renderings", "3D views", "what will it look like", "marketing images" or "/fs-site-renderings" for a project that has a site layout and a plan set.
---

# fs-site-renderings: five midday renderings that match the drawings

This is the third agent in the chain: **fs-site-plan** (SP-1 layout + model) → **fs-set-plans** (the schematic design
set) → **fs-site-renderings** (this skill). It makes five photoreal renderings of the property at midday, from five
different angles, that agree with the layout and the plans.

**How it stays true to the plans.** An image model given only words will move, add and resize buildings. So this skill
never asks it to invent the scene. It first builds an exact **3D massing model** from the project file:

- every building at its real footprint, height and roof, with the window, storefront and door openings placed exactly as
  the elevation sheets draw them;
- the parking with its striping and accessible stalls, the drives, walks, ponds and streets;
- midday sun shadows.

It renders that from five cameras, then sends each picture to OpenAI's Images **edit** endpoint (`gpt-image-2.5-sunburst`,
`quality: high`, `input_fidelity: high`), together with the elevation drawings, and asks the model to *paint* it
photographically without changing the geometry or the camera. Then it lays the massing outlines over each result and
scores them, so a moved, missing or extra building gets caught.

Be honest about the limits: no image model is guaranteed to be pixel-exact. This pipeline gets placement, size, storeys,
roof form and openings right in most pictures, and the check catches most of the rest. Materials, landscaping, cars,
people and the surroundings are the model's interpretation of the plans' notes. Say so when you deliver.

## Files in this skill

`<skill>` is this skill's folder. Needs Python 3 with `numpy`, `Pillow`, `reportlab`, `pypdf` and `pdfplumber`
(`pip install numpy pillow reportlab pypdf pdfplumber`), plus `pdftoppm` / `pdftotext` (poppler). No OpenAI SDK is needed.

| File | What it does |
|---|---|
| `scripts/render_views.py` | Builds the scene, renders the five massing views, and (with `--yes`) paints them through the API. Checks each result, and writes the pictures, prompts and `renders.json`. |
| `scripts/plan_refs.py` | Crops the exterior elevations out of the plan-set PDF as reference images. |
| `scripts/render_sheet.py` | Lays out the R-1 renderings sheet (24 x 36 title block, key plan of the cameras). `--update` adds the pictures to the project's `renders` for fs-set-plans (A-901 to A-905). |
| `scripts/fsrender/` | The scene builder, renderer, cameras, prompt, API client and fidelity check. |
| `assets/example-project.json` | A complete example (8.1 ac retail: a 14-bay strip and three drive-thru pads, with designs), labelled EXAMPLE. |
| `assets/titleblock.pdf` | The Finishes Solutions border. |
| `references/setup.md` | **Read first.** The OpenAI key and network access, on each surface Claude runs on. |
| `references/inputs.md` | Which project files to use, and checking the model against the set. |
| `references/views.md` | The five views, and how to adjust one. |
| `references/review.md` | How to judge a rendering against its massing, and when to re-paint. |

## Workflow

Work in a folder like `./renderings/<project-slug>/`.

### 1. Check the setup

Follow `references/setup.md`. The paid step needs `OPENAI_API_KEY` in the environment and network access to
`api.openai.com`. **Never ask the user to paste the key into the chat**, and never print or save it. If the key or the
network is missing, do steps 2–4 (no key needed), tell the user exactly what to set up, and stop before step 5.

### 2. Gather the inputs

Follow `references/inputs.md`. You need:
- **the project file the set was built from:** the fs-site-plan hand-off (`<slug>-site-model.json`) as the fs-set-plans
  agent left it, with each building type's `design`;
- **the plan-set PDF and its `sheet-index.csv`;**
- **SP-1, the site layout PDF**, to cross-check.

Compare them before rendering: the same buildings in the same places (C-101 against SP-1), the same types and storeys
(A-1xx and A-2xx), and the exterior materials (the table on each A-2xx sheet) matching each type's `design.exterior`.
If a type has no `design`, its facades will be generic. Tell the user, and recommend finishing the set first.

### 3. Pull the elevation references

```
python3 <skill>/scripts/plan_refs.py <set>.pdf --out refs/
```

Look at every cropped image. Each must be one clean elevation. Remove any bad one from `refs/refs.json`.

### 4. Render the massing and look at it

```
python3 <skill>/scripts/render_views.py project.json --out renders/ --refs refs/refs.json --massing-only
```

Read `renders/scene.txt`: each building's footprint, storeys and height, and whether its facades came from the design.
Open all five `*-massing.png` and check them:
- every building is there, in the right place, at the right height;
- the street side reads correctly;
- no view is blocked or pointless (for example, a street view that only shows the back of a pad).

Adjust a camera with `--views-file` if needed (see `references/views.md`). These pictures are exactly what the image model
will keep, so fix problems here, not after paying for a rendering.

### 5. Confirm the cost, then paint

Run the same command without `--massing-only`. It prints what it would do, and the estimate (five paid calls, roughly
$0.20–0.50 each). **Ask the user to confirm**, then:

```
python3 <skill>/scripts/render_views.py project.json --out renders/ --refs refs/refs.json --yes
```

It uses `gpt-image-2.5-sunburst` when the key has it, or the newest GPT Image model the key lists, and says so. It asks for
1920 x 1080, steps down to 1536 x 1024 if the model refuses (re-rendering the massing to match), retries busy and
dropped connections, and saves `renders.json` after each view.

### 6. Review every picture

Follow `references/review.md`. Open each `*-compare.png` (massing | rendering | overlay: cyan outlines where the rendering
agrees, red where it doesn't). Check every picture by eye, not just the flagged ones:
- the building count, positions, storeys and roofs;
- the openings and canopies;
- nothing added (extra buildings, floors, parking decks, towers);
- no readable text or brands;
- the camera unchanged;
- midday light.

Re-paint a failing view with `--views <id> --yes`. Do that at most twice per view (ask the user before spending more), then
report what is still wrong. Never retouch a rendering, and never present one that failed review as faithful.

### 7. The sheet, and back into the set

```
python3 <skill>/scripts/render_sheet.py project.json renders/ --update
```

This writes `renders/<slug>-renderings.pdf` (sheet R-1: all five views, a key plan of the camera positions, and notes)
and adds the five pictures to the project's `renders`. Rebuilding the set with fs-set-plans then adds them as A-901 to
A-905.

### 8. Deliver

Give the user the five JPEGs, the R-1 PDF and the updated project file. Then summarize:
- the model actually used and the size;
- the cost (the estimate printed by the run);
- each view's fidelity, and anything re-painted or still imperfect;
- that the pictures are AI concept illustrations: geometry from the drawings, while materials, plantings, cars, people
  and surroundings are illustrative;
- the next step (rebuild the set to add A-901 to A-905).

## Rules

- The key stays in the environment. Never ask for it in chat, echo it, write it to a file, or put it in a command line.
- Never spend on API calls without the user's go-ahead for this run; each re-paint after the first round needs a fresh okay.
- The massing comes only from the project file. Don't add buildings, floors or features to make a prettier picture. If
  the design is wrong, it gets fixed in the set, not in the rendering.
- Use generic signage only: no real tenant brands, logos or readable names.
- Never call a rendering exact, guaranteed or approved. They're concept illustrations for marketing and coordination.
