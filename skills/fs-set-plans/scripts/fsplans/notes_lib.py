"""Standard general-note blocks for the discipline notes sheets (S-001, M-001, P-001, E-001). Typical
schematic-design wording, filtered by whether the set has dwellings, commercial buildings or both. The project's
own disc.<key>.notes still lead; these follow as the boilerplate a reviewer expects to see."""

LIB = {
    'structural': [
        ('Foundations', 'both', [
            'Foundation design is based on an assumed allowable bearing of 1,500 psf and PVR not over 1 in.; verify with the geotechnical report before final design.',
            'Remove topsoil, vegetation and organics under the building pad plus 5 ft; proof-roll and replace soft areas with select fill.',
            'Select fill: PI 10–20, placed in 8 in. lifts compacted to 95 % of standard Proctor (ASTM D698) at -1 to +3 % of optimum moisture.',
            'Bottom of grade beams at least 24 in. below finished grade and 12 in. into undisturbed soil or compacted select fill.',
            '10 mil polyethylene vapor retarder under slabs on grade, lapped 6 in. and taped; 15 mil under finished floors sensitive to moisture.']),
        ('Concrete', 'both', [
            'Concrete per ACI 318 and ACI 301: 3,000 psi at 28 days for slabs and grade beams, 4,000 psi for exterior flatwork exposed to weather.',
            'Maximum water-cement ratio 0.50; 4 in. ± 1 in. slump before admixtures; air entrainment not required in climate zone 2A.',
            'Cure slabs 7 days minimum by wet cure or an ASTM C309 compound; saw-cut control joints within 12 hours at 15 ft maximum each way (commercial).',
            'Clear cover: 3 in. cast against earth, 1-1/2 in. formed and exposed to weather, 3/4 in. interior slabs.']),
        ('Reinforcing', 'both', [
            'Reinforcing bars ASTM A615 Grade 60, detailed per ACI 315; lap splices 40 bar diameters unless noted.',
            'Corner bars at all grade-beam intersections; two #5 continuous top and bottom minimum in grade beams.',
            'Support slab reinforcing on chairs at mid-depth; do not lift mesh or bars during the pour.']),
        ('Wood framing', 'res', [
            'Lumber No. 2 Southern Yellow Pine or better, 19 % maximum moisture content; treated where in contact with concrete or within 8 in. of grade.',
            'Wall sheathing 7/16 in. OSB with 8d nails at 6 in. edges and 12 in. field; braced wall lines per IRC R602.10.',
            'Engineered roof trusses by a Texas-licensed truss engineer; truss layout and uplift connectors submitted before fabrication.',
            'Hurricane ties at every rafter or truss bearing; hold-downs at shear-wall ends as the engineer specifies.']),
        ('Steel and roof deck', 'com', [
            'Structural steel ASTM A992 (W shapes), A500 Grade C (HSS), A36 (plates and angles); connections per AISC 360.',
            'Open-web steel joists per SJI; bridging per SJI tables; joist girders where spans require.',
            '1-1/2 in. wide-rib metal roof deck, 22 gauge minimum, welded or fastened per the deck manufacturer and wind uplift design.',
            'Masonry or tilt walls, if used, designed by the engineer of record; load-bearing CMU per TMS 402/602.']),
        ('Special inspections', 'com', [
            'Special inspections per IBC Chapter 17 as required by the building official: concrete, reinforcing, welding, high-strength bolting and soils.',
            'Statement of special inspections submitted with the permit set; testing agency retained by the owner.']),
    ],
    'mechanical': [
        ('Equipment', 'both', [
            'Equipment efficiency at least the IECC 2021 / DOE minimum for climate zone 2A; heat pumps or gas heat as scheduled.',
            'Rooftop units on factory curbs with seismic / wind restraint per the manufacturer; curbs flashed by the roofing contractor.',
            'Provide 36 in. working clearance at service panels; maintain manufacturer clearances to parapets and roof edges (10 ft or guard).',
            'Condensate drained to an approved location; secondary drain pans with float switches where above finished space.']),
        ('Ductwork', 'both', [
            'Galvanized sheet metal per SMACNA; flexible duct runs 6 ft maximum, fully extended and supported every 4 ft.',
            'Seal all joints and seams per IECC C403.11 / R403.3; supply and return ducts insulated R-6 in conditioned plenums, R-8 in unconditioned spaces.',
            'Fire and smoke dampers wherever ducts penetrate rated assemblies, with access panels.']),
        ('Ventilation and exhaust', 'both', [
            'Outdoor air per IMC 403 by occupancy; economizers on units 54,000 Btu/h and larger per IECC C403.5.',
            'Restroom exhaust 70 cfm per water closet / urinal (commercial) or 50 cfm intermittent (dwellings), ducted to the outdoors.',
            'Dryer exhaust per IMC 504; kitchen hoods per IMC 507 where cooking appliances produce grease-laden vapors.']),
        ('Controls and testing', 'com', [
            'Programmable thermostats with setback and occupancy scheduling per IECC C403.4.',
            'Test, adjust and balance by an independent certified agency (AABC or NEBB); report submitted before substantial completion.',
            'Commissioning per IECC C408 where the building meets its thresholds.']),
    ],
    'plumbing': [
        ('Sanitary and vent', 'both', [
            'Waste and vent piping PVC DWV Schedule 40 (ASTM D2665) below and above grade unless noted; cast iron where required in plenums or rated assemblies.',
            'Slope horizontal drains 1/4 in. per ft for 3 in. and smaller, 1/8 in. per ft for 4 in. and larger.',
            'Cleanouts at the base of every stack, at each change of direction over 45°, every 100 ft and at the building exit.',
            'Vent terminals at least 10 ft from or 3 ft above any air intake; through-roof flashings by the roofing contractor.']),
        ('Domestic water', 'both', [
            'Water piping PEX-a (ASTM F876) or Type L copper above grade; Type K copper or PEX under slabs in continuous lengths without joints.',
            'Insulate hot-water piping per IECC; insulate cold-water piping in unconditioned spaces against freezing.',
            'Pressure-reducing valve where static pressure exceeds 80 psi; water hammer arrestors at quick-closing valves.',
            'Disinfect and pressure-test the system per IPC 312 and 610 before cover.']),
        ('Water heaters and gas', 'both', [
            'Water heaters listed and installed per the manufacturer; T&P relief piped full size to an approved location.',
            'Thermostatic mixing valves limiting lavatory water to 110 °F in public restrooms (IPC 416.5).',
            'Gas piping per the IFGC, sized from the connected load; sediment traps and shutoffs at each appliance.']),
        ('Fixtures and accessibility', 'com', [
            'Fixture counts per IPC Table 2902.1 for the occupant load; separate facilities by sex unless single-user.',
            'Accessible fixtures per TAS / 2010 ADA Standards: lavatory pipes insulated or concealed, lever handles, grab bars at water closets.',
            'Floor drains with trap primers or trap seal devices in restrooms and mechanical rooms.']),
    ],
    'electrical': [
        ('General', 'both', [
            'Work per the NEC (NFPA 70) as adopted by the jurisdiction, the electric provider\'s service rules and the owner\'s standards.',
            'Service, metering and transformer location by the electric provider; coordinate the pad, conduit and clearances early.',
            'Available fault current, coordination and arc-flash labeling by the engineer of record.']),
        ('Wiring methods', 'both', [
            'Copper conductors, THHN/THWN-2; minimum #12 AWG for branch circuits; aluminum feeders 100 A and larger allowed where the engineer approves.',
            'EMT in exposed and concealed commercial locations; PVC Schedule 40 underground, Schedule 80 where exposed to damage; NM cable only in dwellings.',
            'Firestop all penetrations of rated assemblies with a listed system.']),
        ('Lighting and controls', 'both', [
            'Lighting power and controls per IECC 2021: occupancy sensors, daylight-responsive controls and automatic shutoff where required.',
            'Exit signs and emergency lights with 90-minute battery backup at every exit and along the egress path (IBC 1008 and 1013).',
            'Exterior lighting full cutoff and on photocell / time clock; parking lot light levels per the jurisdiction (typically 1 fc average).']),
        ('Grounding and protection', 'both', [
            'Grounding electrode system per NEC 250: concrete-encased electrode (Ufer), ground rods and the water service where metallic.',
            'GFCI protection per NEC 210.8 and AFCI per 210.12; surge protection at the service per NEC 230.67 for dwellings.',
            'Each tenant space metered separately with its own panel, main breaker and disconnect at the space (multi-tenant buildings).']),
    ],
}


def blocks_for(key, types):
    """the library blocks that apply: 'res' for dwellings, 'com' for commercial, 'both' always"""
    from .design import is_res
    res = any(is_res(t) for t in types)
    com = any(not is_res(t) for t in types)
    out = []
    for title, scope, items in LIB.get(key, []):
        if scope == 'both' or (scope == 'res' and res) or (scope == 'com' and com):
            out.append((title, 'list', items))
    return out
