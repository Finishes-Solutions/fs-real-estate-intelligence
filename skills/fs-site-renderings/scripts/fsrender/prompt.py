"""The instruction to the image model for one view: what the picture is, what must not change, the materials from
the plans, the references, and midday light. Built from the model only, so it never describes what isn't designed."""

MIDDAY = ('Midday light: the sun high in the sky from the south, about 1 pm on a clear day in southeast Texas, giving short, crisp '
          'shadows close under the buildings, canopies, cars and trees, the same direction as the shadows in the massing model; '
          'a clear blue sky with a few fair-weather cumulus clouds; neutral, natural colour, no haze, no lens flare.')
USE_WORDS = {'retail': 'retail', 'restaurant': 'restaurant', 'office': 'office', 'medical': 'medical office', 'industrial': 'industrial / warehouse',
             'storage': 'self storage', 'multifamily': 'apartment', 'townhomes': 'townhome', 'duplex': 'duplex', 'sfr': 'single-family home',
             'fuel': 'convenience store', 'church': 'worship', 'amenity': 'clubhouse', 'hotel': 'hotel'}


def plural(n, s):
    return '%d %s%s' % (n, s, '' if n == 1 else 's')


def describe(p, scene):
    s = p['site']
    proj = p.get('project') or {}
    types = {t['id']: t for t in p.get('types', [])}
    groups = {}
    bl = []
    for b in scene.buildings:
        if b['use'] == 'fuel canopy':  # open structure: say so, or the model walls it in
            bl.append('an open fuel canopy (%s, about {:,} sf): a flat roof with a plain white fascia on slim columns, no walls, '
                      'over pump islands with fuel dispensers ({})'.format(b['footprint'], b['facades']) % b['name'])
            continue
        groups.setdefault(b['type'], []).append(b)
    mat = []
    for tid, bs in groups.items():
        t = types.get(tid) or {}
        use = USE_WORDS.get(t.get('use'), t.get('use', 'commercial'))
        fl = bs[0]['floors']
        dims = (" (%g x %g ft)" % (t['W'], t['D'])) if t.get('W') else ''
        num = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'][len(bs)] if len(bs) <= 10 else str(len(bs))
        storey = 'single-storey' if fl == 1 else '%s-storey' % (['', '', 'two', 'three', 'four', 'five', 'six'][fl] if fl <= 6 else fl)
        bl.append('%s %s %s building%s%s: %s' % (num, storey, use, '' if len(bs) == 1 else 's', dims,
                                                       ', '.join(b['name'] for b in bs[:6]) + (' and others' if len(bs) > 6 else '')))
        ext = ((t.get('design') or {}).get('exterior') or {})
        parts = ['%s: %s' % (k, ext[k]) for k in ('walls', 'accent', 'roofing', 'windows', 'doors') if ext.get(k)]
        if parts:
            mat.append('%s (type %s): %s.' % (t.get('label') or use.capitalize(), tid, '; '.join(parts)))
    prov = (s.get('parking') or {}).get('provided')
    extras = []
    if s.get('ponds'):
        extras.append('a detention pond with mown grass banks')
    if s.get('dumpsters'):
        extras.append('masonry dumpster enclosures')
    if s.get('signs'):
        extras.append('a monument sign at the entrance')
    streets = [st.get('name') for st in s.get('streets', []) if st.get('name')]
    acres = (s.get('stated') or {}).get('acres')
    where = proj.get('address') or proj.get('county') or 'the Houston, Texas region'
    site = ('The site: %s at %s, %s, with %s%s%s.' % (
        ('%.2f acres' % acres) if acres else 'a parcel', where, 'fronting ' + ' and '.join(streets) if streets else 'on a public road',
        '; '.join(bl) if bl else 'the buildings shown', (', about %d parking spaces in striped rows' % prov) if prov else ', striped parking rows',
        (', plus ' + ', '.join(extras)) if extras else ''))
    return site, mat


def build(p, scene, V, refs=()):
    site, mat = describe(p, scene)
    lines = [
        'Image 1 is a 3D massing model of a proposed development, drawn exactly from its site plan and building plans. Turn it into a '
        'photorealistic professional architectural photograph: %s. Keep this camera exactly: the same position, angle, lens and framing, '
        'with a level horizon and no crop.' % V['words'],
        'The geometry is the design and must not change. Keep every building exactly where it stands, with the same footprint, shape, '
        'number of floors, height and roof form. Keep every storefront, window and door opening in the same place and at the same size. '
        'Keep every drive, parking row and stripe, accessible stall, walk, lawn, pond and tree where it is. Do not add or remove buildings, '
        'floors, wings, drives or parking. The only things you may add are entourage: parked cars in about two thirds of the striped stalls '
        '(more near the storefronts), a few people on the walks, light poles in the parking, and shrubs and groundcover in the lawns and beds.',
        site,
    ]
    if mat:
        lines.append('Materials, from the drawing set: ' + ' '.join(mat) + ' Apply them faithfully; the colours in the massing model are only placeholders for these materials. Where a note '
                     'mentions a feature the massing does not show (a tower, an extra canopy), the massing wins: do not add it.')
    else:
        lines.append('Materials: typical of new commercial construction in southeast Texas for each building\'s use (the massing colours are placeholders).')
    if refs:
        lines.append('Images 2 to %d are references from the project\'s drawing set: %s. Match their facade design (materials, colours, '
                     'window and door pattern, parapet and canopy lines) on the matching buildings, rendered as real built materials, not as drawings. '
                     'Their geometry does not override image 1.' % (len(refs) + 1, '; '.join('image %d: %s' % (i + 2, r['caption']) for i, r in enumerate(refs))))
    lines += [
        MIDDAY,
        'Make it indistinguishable from a real photograph: true material textures with slight weathering, glass with reflections and '
        'visible interiors behind storefronts, metal coping on parapets, rooftop units, downspouts, crisp striped asphalt with concrete curbs, '
        'concrete walks, young live oaks and crepe myrtles where the model shows trees, and irrigated lawn.',
        'Beyond the property line, replace the flat surroundings with believable suburban southeast-Texas context seen from this viewpoint: '
        'the road along the front with a little traffic, neighbouring lots and tree lines, a flat horizon. Nothing in the surroundings may block the site.',
        'Tenant signs as generic illuminated channel letters with no readable words or real brand names. No text, labels, watermarks, '
        'drawing lines or legends. No distortion of straight edges, no fisheye, no tilt.',
    ]
    return '\n'.join(lines)
