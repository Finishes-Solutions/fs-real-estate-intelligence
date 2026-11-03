# Reference-plan extraction helpers

These scripts read the multifamily reference library in place and produce the small reviewed
fixtures under `data/reference/`. **The PDFs, page renders and aerials stay outside Git** — never
copy them into this repo. Only compact JSON (values + provenance) is committed.

## Setup

- Python 3 with PyMuPDF (`pip install pymupdf`). Run scripts with `python -I`.
- Point at the library with `REI_REF_LIB=/path/to/REI_Complete_Reference_Library` (or `--lib`).
  The default is the author's Dropbox path documented in `refs_common.py`.
- Send renders to a scratch folder outside the repo and outside the library (`-o`).

## Scripts

| Script | What it does |
|---|---|
| `refs_common.py` | Library root, manifest + inventory loading; resolves each manifest document to its file by sha256. |
| `list_docs.py P01 P20 …` | Lists a project's documents (page count, kind, resolved path). |
| `search_text.py FILE [-p PAGES] PATTERN…` | Regex search over the text layer with short context; `--chars` shows per-page text size (0 = scanned raster). |
| `render_pages.py FILE -p PAGES -o OUT [--crop x0,y0,x1,y1] [--width PX]` | Renders pages or page crops to PNG for visual review. |
| `contact_sheet.py FILE -p PAGES -o OUT.png` | One labelled thumbnail grid for triage of long sets. |
| `drawings_in.py FILE -p PAGE --region …` | Vector path bounding boxes in a region (PDF points) — used to calibrate graphic scales and scale building outlines. |
| `scan_uses.py > hits.tsv` | Keyword triage of pages 1–3 of every document for retail / industrial / flex / office / mixed-use leads. Leads, not evidence. |
| `curate_fixtures.py REPO` | The reviewed values (with page, sheet, method, confidence, status, review) → `data/reference/projects/<ID>.json`. Edit values here, then re-run. |
| `build_index.py --uses hits.tsv` | Builds `data/reference/index.json` (all 87 projects, families, dev/holdout partitions, coverage). |

`data/reference/templates.json` is hand-written from the fixtures; every template lists the
fixture values it uses.

## Rerun

```sh
export REI_REF_LIB=…/REI_Complete_Reference_Library
python -I scripts/refs/scan_uses.py > /tmp/uses.tsv
python -I scripts/refs/curate_fixtures.py .
python -I scripts/refs/build_index.py --uses /tmp/uses.tsv
```

## Rules used when reviewing

- `review: "visually-reviewed"` only when the rendered page was looked at and the value confirmed;
  otherwise `"text-only"`.
- Scaled measurements state the scale and how it was calibrated (graphic scale bar or a printed
  dimension; never paper size) and an error estimate.
- Revisions and phases are kept apart; each value carries its sheet and date.
- Missing data stays `status: "unknown"` with `v: null`.
- Partitions are assigned by project family; holdout families must not be used for tuning.
