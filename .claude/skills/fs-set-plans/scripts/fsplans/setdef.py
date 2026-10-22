"""The set definition: which sheets a project gets. Sheet numbers follow the US National CAD Standard (discipline,
sheet type, sequence): 0 general, 1 plans, 2 elevations, 3 sections, 4 enlarged, 5 details, 6 schedules / diagrams,
9 3D views. Building sheets are per type: A-101 is type A's plans, A-102 type B's..."""
from .design import RESIDENTIAL

SECTIONS = [
    ('general', 'General', True), ('civil', 'Site & civil', True), ('landscape', 'Landscape', True), ('arch', 'Architecture', True),
    ('structural', 'Structural', True), ('mechanical', 'Mechanical', True), ('plumbing', 'Plumbing', True), ('electrical', 'Electrical', True),
    ('fire', 'Fire protection & life safety', True), ('renderings', 'Renderings', True), ('telecom', 'Telecom / fiber', False),
]
SECTION_LABEL = {k: v for k, v, _ in SECTIONS}
NEEDS_ARCH = ['structural', 'mechanical', 'plumbing', 'electrical', 'fire']


def pick_sections(asked=None):
    want = set(asked if asked else [k for k, _, on in SECTIONS if on])
    want.add('general')
    if 'arch' not in want:
        want -= set(NEEDS_ARCH)
    return [k for k, _, _ in SECTIONS if k in want]


def sheet_list(p, types):
    """p: the project dict; types: normalized types (with designs) -> [{number, title, sub, section, kind, type?, scale}]"""
    on = set(pick_sections(p.get('sections')))
    site = p.get('site') or {}
    has_site = len(site.get('boundary') or []) >= 3
    out = []

    def add(number, title, sub, section, kind, **x):
        out.append(dict(number=number, title=title, sub=sub, section=section, kind=kind, scale=x.pop('scale', ''), **x))

    def each(prefix, base, title, kind, section, pick=lambda t: True):
        for i, t in enumerate([t for t in types if pick(t)]):
            add('%s-%d' % (prefix, base + i + 1), '%s — Type %s' % (title, t['id']), '%s, %s\' × %s\'' % (t['label'], t['W'], t['D']), section, kind, type=t['id'])

    non_res = lambda t: t['use'] not in RESIDENTIAL
    acres = p.get('_acres', 0)
    add('G-001', 'Cover sheet', 'Sheet index · Project data · Notes', 'general', 'cover', scale='As noted')
    add('G-002', 'General notes', 'Codes · Symbols · Abbreviations', 'general', 'g-notes', scale='N.T.S.')
    if any(non_res(t) for t in types):
        add('G-003', 'Code analysis', 'Occupancy · Construction · Occupant load · Egress', 'general', 'g-code', scale='N.T.S.')
    if has_site and 'civil' in on:
        add('C-001', 'Existing conditions', 'Boundary · Easements · Flood zone', 'civil', 'c-existing')
        add('C-101', 'Overall site plan', 'Land use · Circulation · Program · Parking', 'civil', 'siteplan')
        add('C-102', 'Dimension & paving plan', 'Setbacks · Drives · Parking · Fire lanes', 'civil', 'c-dims')
        if site.get('lots'):
            add('C-103', 'Typical lot plot plans', 'Lots · Setbacks · Driveways', 'civil', 'c-lots')
        add('C-201', 'Grading & drainage plan', 'Schematic grading · Storm sewer · Inlets', 'civil', 'c-grading')
        add('C-202', 'Detention summary', 'Storage required and provided', 'civil', 'c-detention', scale='N.T.S.')
        add('C-301', 'Utility plan', 'Water · Sanitary sewer · Storm · Services', 'civil', 'c-utility')
        if acres >= 1:
            add('C-401', 'Erosion & sediment control plan', 'SWPPP layout', 'civil', 'c-erosion')
        add('C-501', 'Civil details', 'Paving · Curb · Ramp · Enclosure · Erosion control', 'civil', 'c-details', scale='N.T.S.')
    if has_site and 'landscape' in on:
        add('L-101', 'Landscape plan', 'Trees · Shrubs · Sod · Plant schedule', 'landscape', 'l-plan')
        add('L-501', 'Landscape details', 'Planting details', 'landscape', 'l-details', scale='N.T.S.')
    if 'arch' in on and types:
        each('A', 100, 'Floor & roof plans', 'a-plans', 'arch')
        each('A', 200, 'Exterior elevations', 'a-elev', 'arch')
        each('A', 300, 'Building sections', 'a-section', 'arch')
        add('A-501', 'Wall sections & typical details', 'By construction type', 'arch', 'a-details', scale='As noted')
        each('A', 600, 'Door, window & finish schedules', 'a-sched', 'arch')
    if 'structural' in on and types:
        add('S-001', 'Structural general notes', 'Design criteria', 'structural', 's-notes', scale='N.T.S.')
        each('S', 100, 'Foundation plan', 's-found', 'structural')
        each('S', 200, 'Framing plans', 's-frame', 'structural')
        add('S-501', 'Structural details', 'Typical details', 'structural', 's-details', scale='As noted')
    if 'mechanical' in on and types:
        add('M-001', 'Mechanical notes & schedules', 'Legend · Equipment', 'mechanical', 'm-notes', scale='N.T.S.')
        each('M', 100, 'HVAC plans', 'm-hvac', 'mechanical')
    if 'plumbing' in on and types:
        add('P-001', 'Plumbing notes & schedules', 'Legend · Fixtures', 'plumbing', 'p-notes', scale='N.T.S.')
        each('P', 100, 'Plumbing plans', 'p-plan', 'plumbing')
        add('P-601', 'Plumbing riser diagrams', 'Water · Waste and vent', 'plumbing', 'p-riser', scale='N.T.S.')
    if 'electrical' in on and types:
        add('E-001', 'Electrical notes & schedules', 'Legend · Panels · Loads', 'electrical', 'e-notes', scale='N.T.S.')
        if has_site:
            add('E-101', 'Site lighting plan', 'Poles · Wall packs', 'electrical', 'e-site')
        each('E', 200, 'Power & lighting plans', 'e-plan', 'electrical')
        add('E-601', 'Electrical one-line diagram', 'Service · Panels', 'electrical', 'e-oneline', scale='N.T.S.')
    if 'fire' in on and types:
        if has_site:
            add('FP-101', 'Fire access & hydrant plan', 'Fire lanes · Hydrants · Hose reach', 'fire', 'fp-access')
        each('FP', 200, 'Fire sprinkler plan', 'fp-sprinkler', 'fire', lambda t: t.get('sprinklered'))
        each('FA', 200, 'Fire alarm plan', 'fa-plan', 'fire', lambda t: non_res(t) and (t.get('sprinklered') or t['occupancy'].startswith('A')))
        each('LS', 100, 'Life safety plan', 'ls-plan', 'fire', non_res)
    if 'telecom' in on:
        add('T-001', 'Telecom notes & legend', 'Fiber · Structured cabling', 'telecom', 't-notes', scale='N.T.S.')
        if has_site:
            add('T-101', 'Site fiber backbone plan', 'Conduit · Handholes · MPOE', 'telecom', 't-site')
        each('T', 200, 'Structured cabling plans', 't-bldg', 'telecom')
    if 'renderings' in on:
        for i, r in enumerate((p.get('renders') or [])[:9]):
            add('A-9%02d' % (i + 1), 'Conceptual rendering', r.get('caption') or 'AI concept illustration', 'renderings', 'render', scale='N.T.S.', render=i)
    for x in p.get('extra_sheets') or []:
        add(x['number'], x['title'], x.get('sub', ''), x.get('section', 'general'), 'custom', scale=x.get('scale', 'N.T.S.'), custom=x)
    return out
