## What the comparison says (run of Nov 4 2026, engine rei-layout/2026.11.03.2)

The engine falls well short of what was actually designed on three of the four holdout projects when it is asked the
way a user would ask. The gaps have concrete causes, listed with the evidence that would close each. None of these
were fixed by fitting to the holdout values: the holdout stays an evaluation set.

**P35 Sierra Vista WB-30 (8.06 ac, 355 units, 4-story corridor buildings).** Asked plainly, the engine reaches 224
(exact) or 240 (as many as fit) units: it puts a 1.0 ac detention pond on the site, and the reference site has none
(the Sierra Vista specific plan drains to regional facilities). With detention taken off the surface the exact run
lands **355 units, 400 / 391 spaces, passing**: 8 buildings of 44 units against the reference's 5 × 64-plex plus a
35-unit clubhouse building; coverage 21% against 27% (the engine's corridor buildings are 9,000 sf footprints, the
KTGY 64-plex 17,100 sf). Two engine findings:
- *Detention default.* The engine always sizes an on-site pond from a rule of thumb unless the words say otherwise; a
  site in a master plan with regional detention loses about a third of its yield. Needs: a site input for "detention
  handled off site / by the master plan" offered in the brief (not a template value).
- *"As many as fit" finds less than an exact count.* With the pond off, maximize stops at 304 while exactly 355 passes on
  the same site (the exact run's winner is a "rows facing the street" arrangement the maximize run doesn't return; the
  cause isn't traced yet). A defect in the search, not a template: as many as fit should never come out below an exact
  count that fits.
- *Building size.* The mid-rise template (dev evidence: P28 / P11 Creekview, 50 x 65 ft bays) makes shorter bars than the
  64-plex (241 x 83 ft, 16 units a floor). Dev evidence for a longer corridor bar would be needed; the 64-plex itself is
  holdout and is not used.

**P36 Sierra Vista WB-32 (5.11 ac wedge, 192 units).** The engine places one corridor building (96-128 units) against
three. With the pond off it still gets only 112: the site is a wedge between a straight west line and Santucci Blvd's
curve, and the reference sets two of its three bars parallel to the curve and one square to the west line. The engine
lays out in one frame turned to one edge, so the wedge's far end stays empty. Finding: *irregular sites need more than
one frame* (bars turned to the edge they face). No template is involved.

**E054 Anderson (1.87 ac urban corner, 172 units, 5 residential levels over a 2-level podium, U round a podium
courtyard).** None of the engine's forms is this building:
- *Tower on podium* gives 61 units with suburban 25 / 10 / 20 ft setbacks and a surface pond; with 5 ft setbacks and
  detention off the surface (both assumptions: Redmond's AP zone wasn't read) 136 units, coverage 59%, and it fails
  parking (163 for 166 at the project's own 1.22). The engine's tower covers 60% of its podium (PODIUM.towerShare, an
  estimate); Anderson's residential levels cover about the whole podium (about 39,000 sf a level on a 38,701 sf
  footprint). Needs: dev-partition podium evidence (P25 Hawthorn Cottages, P27 The Rise) read for the tower-to-podium
  ratio before changing the estimate.
- *Wrap* doesn't form on 1.87 ac (35 and 80 units, laid out as bars): the wrap generator needs room for a garage plus
  65 ft wings plus a courtyard and surface drives. Finding: no compact urban wrap / podium-courtyard form ("5 over 2"
  with the courtyard on the podium deck) — a missing form, to be built from dev evidence.
- *Courtyard* (garden courtyard, surface parked) can't reach urban density at all: 40 units.

**P18 Lake Shore (15.75 ac lakefront, 82 fee-simple townhome lots).** On the 6.15 ac left after the 9.6 ac of open space,
the engine fits 59 townhomes as many as fit (9.6 an acre against 13.3) and only **33 when asked for exactly 82**. Two
findings:
- *Product.* The engine's townhomes are rental rows parked in lots; Lake Shore's are fee-simple lots with front-load
  garages and driveways on a 24 ft private road, which need no parking lots. There is no for-sale townhome-lot product
  in the words path (the subdivision street engine lays out house lots). Dev evidence exists (E053 Portland Road
  townhomes with garages) to build it from.
- *Exact count defect.* "Exactly 82 townhomes" returns a "Townhome court" of three 11-home buildings (33 homes, beyond
  the 6-home row the engine otherwise keeps) and fails, while the maximize run on the same land reaches 59. The exact
  path's fallback should not end below the maximize result.

**Reconstruction caveats.** P35 and P36 outlines are traced from the site plans and scaled to the printed area (the
north line of P35 and Santucci's curve on P36 simplified); E054 and P18 are rectangles (E054 in its plan's proportions;
P18's lakefront shoreline not traced, the engine given the net land). The parking rules are the projects' own (1.1 a
unit senior; 1.22 provided at Anderson; 2 a townhome); everything else is the engine's defaults.
