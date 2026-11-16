# Drawing and sketch intake

The site-layout skill can start from an uploaded reference drawing, but it does not treat an image as survey geometry.
Use the extraction preview and get the user's confirmation of the boundary, scale basis, and frontage before creating
the site model.

## Supported paths

| Input | Workflow | Scale rule |
|---|---|---|
| GeoJSON polygon | Import directly with `scripts/intake.mjs geojson` | Coordinates are projected to local feet. Treat provider/appraisal geometry as approximate, not a survey. |
| DXF | Extract candidates, inspect `preview.png`, choose a boundary and frontage, then import the selected candidate | Respect declared drawing units. Unitless DXF requires explicit confirmation. A measured boundary more than 2% from the user's confirmed acreage is rejected, not silently rescaled. |
| Vector PDF | Extract candidates and inspect `preview.png`; select boundary and frontage | Use a printed or user-confirmed sheet scale. A PDF with no usable scale can only be uniformly area-fitted after confirming the acreage; report the resulting dimensions as approximate. |
| Scanned PDF or image | Generate `grid.png`, trace the parcel corners into a JSON ring, inspect the trace, then import it | Require user-confirmed acreage or a known dimension. Area fitting is low confidence and never creates survey accuracy. |
| DWG | Convert to DXF with ODA File Converter or LibreDWG, then follow the DXF workflow | Same unit and acreage checks as DXF. |

`extract_geometry.py` can read DXF and vector PDF geometry and make a labelled grid for scans. Optional Python packages
are listed in `scripts/intake/requirements.txt`. A scanned PDF also needs `pdftoppm`; DWG conversion needs ODA File
Converter or LibreDWG. The layout engine itself remains Node-only, offline, and package-free.

## Workflow

1. Read the source drawing and record its filename, date, stated acreage, units, scale, north arrow, and relevant notes.
   Prefer a signed boundary survey or recorded plat over a parcel map; a sketch is the least reliable source.
2. Ask the user to confirm the total site acreage if it is not already confirmed. Do not treat the number printed on a
   marketing image or inferred by the model as verified.
3. Extract a candidate and inspect the generated preview before selecting a `layer#index`. Never select the largest
   closed shape only because it is largest; it could be a building, sheet border, or adjacent parcel.
4. Ask the user to confirm the parcel outline and the edge index of the principal street frontage. Ask about allowed
   entrances and no-build areas. Only add an exclusion when its geometry and meaning are clear.
5. Convert the selected boundary:

   ```sh
   node <skill>/scripts/intake.mjs candidate \
     --file intake/geometry.json --layer "PROPERTY" --index 0 \
     --confirmed-acres 7.71 --confirm-boundary --confirm-units feet \
     --front 0 --out site.json
   ```

   Omit `--confirm-units feet` when the DXF declares units. For a PDF whose vector linework has no usable sheet scale,
   add `--fit-to-confirmed-acres` only after confirming the boundary and acreage; the output is marked low confidence.
6. For a hand trace, save the traced pixel corners as `{"ring":[[x,y],...]}` in the labelled grid's pixel
   coordinates, with y increasing downward. After reviewing it with the user:

   ```sh
   node <skill>/scripts/intake.mjs trace --ring trace.json \
     --confirmed-acres 7.71 --confirm-boundary --front 0 --out site.json
   ```

   This flips the y-axis and fits the trace uniformly to the stated acreage. Dimensions, north, and boundary accuracy
   still require independent verification.
7. Review the generated `site-review.svg`: edge labels must match the confirmed frontage and the outline/exclusions
   must match the source. Fix the input and rerun if anything is wrong. Do not proceed when the acreage mismatch,
   units, boundary, or legal access is unresolved.
8. Run the existing layout workflow:

   ```sh
   node <skill>/scripts/layout.mjs brief --site site.json \
     --request "exactly 120 garden apartments, 3 stories" --out brief.json
   node <skill>/scripts/layout.mjs check --brief brief.json
   node <skill>/scripts/layout.mjs run --brief brief.json --out out/
   node <skill>/scripts/layout.mjs replay --record out/run.json
   ```

   Check every `option-N.svg`, report every failing or unknown check, and deliver the conceptual PDF only with its
   assumptions and provenance.

## Guardrails

- `--confirm-boundary` is a deliberate user-confirmation gate, not a claim that the source is a survey.
- For DXF and scaled vector PDFs, an acreage mismatch over 2% stops import. Resolve drawing units, parcel selection,
  right-of-way inclusion, or the stated acreage; do not make a measured survey appear to match by rescaling it.
- Only an unscaled vector PDF can be area-fitted, and only with confirmed acreage. A scan/sketch trace also fits to
  confirmed acreage, is marked low confidence, and must not be used as evidence of actual dimensions.
- Keep easements, wetlands, buildings and other features as reference-only until their location and classification
  are confirmed. If confirmed as a no-build area, include it as an exclusion with its source.
- The engine's geometry checks are planning checks, not boundary, title, code, civil, fire, utility, or drainage
  engineering. All outputs remain conceptual and are not for permitting or construction.
