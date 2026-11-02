# Highest and best use

The highest and best use is the use, or mix of uses, that is **legally permissible**, **physically possible**,
**financially feasible** and, among those, **maximally productive** (the highest residual land value). Test the
candidates in that order. A use that fails one test is out, whatever it would yield.

## 1. Pick the candidates

Start broad, then cut. Consider each of: retail strip / center, restaurant or QSR pads, fuel / convenience, office,
medical office, multifamily, townhomes, single-family lots, industrial / flex, self storage, and mixes of them.

The site usually tells you which ones are serious:

| Site signal (from the project files) | Points toward |
|---|---|
| High traffic (AADT 20,000+), a signalized or corner frontage, visibility, rooftops nearby | Pads, fuel, retail on the frontage |
| Deep site behind a busy frontage | Pads or retail in front, with residential, storage or flex behind (a mix) |
| Residential growth, schools, MUD utilities, an interior location | Single-family, townhomes, multifamily |
| Highway / rail access, an industrial area, flat land, a large site | Industrial / flex, outdoor storage |
| Small or odd-shaped site, moderate traffic | Self storage, a single pad, flex |
| Floodplain over much of the site, or a pipeline | Uses that live with open land (storage, parking-heavy uses, lots with detention as amenity) |

Two or three serious candidates plus one or two mixes is typical. Record the ones you rejected and why.

## 2. Legally permissible

Zoning or PD permitted uses, deed restrictions, plat notes, and use-specific rules (fuel distance limits, alcohol,
residential density caps, ETJ subdivision rules for lots). In unincorporated Texas there is no zoning, but deed
restrictions and county subdivision / drainage rules still apply. Mark the answer as Yes / Conditional (SUP) / No,
with its source and classification. An unverified "Yes" is written as "Likely (unverified)".

## 3. Physically possible

Size, shape, frontage, access, flood and floodway, easements and pipelines, topography, soils, and utility capacity.
`testfit.py` takes the land budget from the model: detention as a real pond (volume ÷ depth plus slopes and a
maintenance strip), buffers and easements, plus right-of-way and flood reserves you pass in:

```
python3 <skill>/scripts/testfit.py --model site-model.json [--row-ac 0.4] [--flood-reserve] [--coverage 0.5 --far 1.0 --density 24]
```

A use that needs more net acres than the site has (`min_ac`) is reported as not fitting. Override the archetype numbers
with local rules (`--params params.json`, e.g. `{"sfr": {"lot_sf": 6962}, "retail": {"park_per_ksf": 5}}`).

## 4. Financially feasible, and maximally productive

This needs market inputs. Put them in `market.json`, one block per use. `assets/example-market.json` shows the shape.

| Key | Meaning |
|---|---|
| `rent_psf_yr` | Annual rent per leasable sf (retail, office, industrial, storage) |
| `rent_unit_mo` | Monthly rent per unit (multifamily) |
| `lot_price` / `sale_per_unit` | Finished lot price, or home sale price (then give `hard_per_unit`) |
| `vacancy`, `opex_pct` (or `opex_psf`), `cap_rate` | Income to value |
| `hard_psf` / `hard_per_unit`, `site_per_ac`, `soft_pct`, `profit_pct` | Development cost and the developer's required margin |
| `max_sf` / `max_units` | **Market depth:** how much of this use the trade area can absorb. Without it, the test fit will happily put 40,000 sf of restaurants on a site. |
| `source` | Where the numbers came from |

Sources, best first: figures in the project files (broker opinions, appraisals, the app's Market page and reports),
figures the user gives, then published market reports you can cite. **Never invent a market number.** If you have
none, run the test fit without `--market`. The uses are then not ranked, so say what data is missing, rank them on
qualitative evidence, and present the result as provisional.

The test fit's residual land value is value (or sale revenue) minus hard, site and soft cost and developer profit. A
use is financially feasible when it's positive, and when it's in line with the land's appraised or asking value (from
the app's property card). The highest residual land value among the feasible uses is the maximally productive one.

## 5. Test mixes

Most good sites are a mix: the frontage earns more than the depth. Test mixes explicitly. The net acres are given out
in order, and `rest` takes the remainder:

```
python3 <skill>/scripts/testfit.py --model site-model.json --market market.json \
  --mix restaurant=1.6,retail=rest --mix fuel=2,storage=rest --mix retail=2.5,multifamily=rest
```

Choose the split from the site: frontage depth (often 200–300 ft) for pads or retail, the rest for the use that doesn't
need visibility.

## 6. Record it in the model

```json
"hbu": {
  "selected": "Three drive-thru pads + 51,600 sf retail strip",
  "statement": "Why, in two or three sentences, with the evidence (traffic, rooftops, rents, competition) and the test-fit result.",
  "candidates": [
    {"use": "3 pads + retail strip", "legal": "Yes (no zoning; deed restr. TBC)", "physical": "Fits", "feasible": "Yes: RLV $5.6M", "yield": "62,300 sf", "rank": 1, "chosen": true},
    {"use": "Self storage", "legal": "Yes", "physical": "Fits", "feasible": "Marginal: RLV ~$0", "yield": "~99,000 sf", "rank": 2}
  ],
  "evidence": ["TxDOT AADT 30,000 (app traffic report, 2025)", "Retail rents $24–28 NNN (broker opinion in project files)"]
}
```

Keep the cells short, because they print in a table. The test fit is a land budget, not a layout. After you lay out
the chosen use, its real yield is measured from the drawing, and `yield` on the chosen candidate should match the sheet.
