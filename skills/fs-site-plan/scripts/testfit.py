#!/usr/bin/env python3
"""Quick test fit of candidate uses for the highest-and-best-use analysis: a land budget (gross site down to net
developable land) and, for each use, the most it can hold on that land, then (with market inputs) the residual land
value that ranks them.

    python3 scripts/testfit.py --model site-model.json                       # uses the model's boundary, setbacks, detention
    python3 scripts/testfit.py --acres 20.6 --detention-rate 1.0 --row-ac 0.4
    python3 scripts/testfit.py --model site-model.json --uses retail,multifamily,sfr --market market.json --json hbu.json

The use archetypes below are typical planning metrics (ENGINEERING ASSUMPTIONS), not code. Override any of them with
--params params.json ({"retail": {"park_per_ksf": 5}}), and always override with the jurisdiction's verified numbers
(parking ratios, lot sizes, density, coverage) once you have them. --market gives rents, prices, costs and cap rates
per use (see references/highest-best-use.md); without it, uses are not ranked against each other (square feet of
different uses are not comparable), only screened."""
import argparse
import json
import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SQFT_ACRE = 43560.0

USES = {
    'retail': dict(label='Retail strip / neighbourhood center', kind='commercial', floors=1, park_per_ksf=4.0, landscape=0.15, service=0.10, eff=0.95, min_ac=1.0),
    'restaurant': dict(label='Restaurant / QSR pads (drive-thru)', kind='commercial', floors=1, park_per_ksf=10.0, landscape=0.18, service=0.45, eff=1.0, min_ac=0.6, max_sf=12000),  # market depth: 3-4 pads
    'office': dict(label='Office (3 story)', kind='commercial', floors=3, park_per_ksf=3.5, landscape=0.20, service=0.08, eff=0.88, min_ac=1.5),
    'medical': dict(label='Medical office (2 story)', kind='commercial', floors=2, park_per_ksf=5.0, landscape=0.18, service=0.08, eff=0.90, min_ac=1.0),
    'multifamily': dict(label='Garden multifamily (3 story walk-up)', kind='mf', floors=3, gsf_per_unit=1150, nsf_per_unit=950, park_per_unit=1.75, amenity=0.12, landscape=0.10, min_ac=5),
    'townhomes': dict(label='Townhomes for sale (24 x 100 lots)', kind='lots', lot_sf=2400, row_share=0.32, open=0.10, unit_sf=1800, min_ac=2),
    'sfr': dict(label='Single-family lots (60 x 115)', kind='lots', lot_sf=6900, row_share=0.28, open=0.08, unit_sf=2100, min_ac=5),
    'industrial': dict(label='Industrial / flex (rear-load)', kind='industrial', floors=1, truck_ratio=0.70, park_per_ksf=0.6, landscape=0.12, eff=1.0, min_ac=3),
    'storage': dict(label='Self storage (1-story drive-up)', kind='storage', floors=1, cov=0.42, landscape=0.12, eff=0.92, min_ac=2.5),
    'storage_ms': dict(label='Self storage (3-story climate controlled)', kind='storage', floors=3, cov=0.28, landscape=0.15, eff=0.82, min_ac=2),
    'fuel': dict(label='Fuel / convenience store', kind='single', bldg_sf=5000, min_ac=1.3, max_ac=4),
}
SF_PER_STALL = 350  # a stall with its share of aisle and drive


def land_budget(a):
    """gross -> net developable sf, with each deduction and its basis"""
    rows = []
    gross = (a.acres or 0) * SQFT_ACRE
    env_sf = None
    if a.model:
        from fsplans.sitemodel import Layout
        from fsplans import geom as G
        m = json.load(open(a.model))
        L = Layout(m)
        gross = L.area_sf
        s = m['site']
        env_sf = G.area(L.envelope())
        if s.get('flood_zone_poly') and a.flood_reserve:
            rows.append(('Flood reserve (mapped floodplain)', G.area(s['flood_zone_poly']), 'model flood_zone_poly'))
        ease = sum(G.area(e['pts']) for e in L.easements if e['closed'])
        if ease:
            rows.append(('Easements', ease, 'model easements'))
        per = G.length(L.boundary, closed=True)
        bufs = [L.buffer_of(k) for k in L.edge_kind]
        avg = sum(bufs) / len(bufs) if bufs else 0
        if avg:
            rows.append(('Perimeter landscape buffers', per * avg, 'model buffers (avg %.0f ft)' % avg))
        a.detention_rate = a.detention_rate or float(s.get('detention_rate_acft_per_ac', 1.0))
        if L.ponds and not a.pond_depth:
            a.pond_depth = float(L.ponds[0].get('depth_ft', 4))
    if a.row_ac:
        rows.append(('Right-of-way dedication', a.row_ac * SQFT_ACRE, '--row-ac'))
    if a.flood_ac:
        rows.append(('Flood / floodway reserve', a.flood_ac * SQFT_ACRE, '--flood-ac'))
    rate = a.detention_rate if a.detention_rate is not None else 1.0
    depth = a.pond_depth or 4.0
    vol = gross / SQFT_ACRE * rate * SQFT_ACRE  # cubic ft
    pond = vol / (depth * 0.72) * 1.25  # side slopes lose ~28 % of a prism; +25 % for freeboard, maintenance strip, outfall
    rows.append(('Detention (%.2f ac-ft/ac, %g ft deep)' % (rate, depth), pond, '%.2f ac-ft on the gross acres' % (gross / SQFT_ACRE * rate)))
    net = gross - sum(r[1] for r in rows)
    return gross, rows, max(0.0, net), env_sf


def fit(key, u, net, gross, lim):
    k = u['kind']
    out = dict(use=key, label=u['label'])
    if net / SQFT_ACRE < u.get('min_ac', 0):
        out.update(fits=False, why='needs about %.1f net ac; %.2f available' % (u['min_ac'], net / SQFT_ACRE))
        return out
    if k == 'commercial' or k == 'industrial':
        usable = net * (1 - u['landscape'])
        per_fp = 1 + u.get('service', 0) + u.get('truck_ratio', 0) + u['floors'] * u['park_per_ksf'] * SF_PER_STALL / 1000
        fp = usable / per_fp
        if lim.get('coverage'):
            fp = min(fp, lim['coverage'] * gross)
        gfa = fp * u['floors']
        if lim.get('far'):
            gfa = min(gfa, lim['far'] * gross)
        stalls = math.ceil(gfa / 1000 * u['park_per_ksf'])
        out.update(fits=True, footprint=fp, gfa=gfa, sellable=gfa * u['eff'], stalls=stalls,
                   yield_text='{:,.0f} sf GFA ({} fl), {} stalls'.format(gfa, u['floors'], stalls))
    elif k == 'mf':
        usable = net * (1 - u['amenity'] - u['landscape'])
        per_unit = u['gsf_per_unit'] / u['floors'] * 1.10 + u['park_per_unit'] * SF_PER_STALL
        units = int(usable / per_unit)
        if lim.get('density'):
            units = min(units, int(lim['density'] * gross / SQFT_ACRE))
        out.update(fits=True, units=units, gfa=units * u['gsf_per_unit'], sellable=units * u['nsf_per_unit'],
                   stalls=math.ceil(units * u['park_per_unit']), yield_text='%d units (%.1f/ac), %d stalls' % (units, units / (gross / SQFT_ACRE), math.ceil(units * u['park_per_unit'])))
    elif k == 'lots':
        lots = int(net * (1 - u['row_share'] - u['open']) / u['lot_sf'])
        if lim.get('density'):
            lots = min(lots, int(lim['density'] * gross / SQFT_ACRE))
        out.update(fits=True, units=lots, sellable=lots * u['unit_sf'], gfa=lots * u['unit_sf'],
                   yield_text='%d lots (%.1f/ac) at %s sf' % (lots, lots / (gross / SQFT_ACRE), '{:,}'.format(u['lot_sf'])))
    elif k == 'storage':
        fp = net * (1 - u['landscape']) * u['cov']
        gfa = fp * u['floors']
        if lim.get('far'):
            gfa = min(gfa, lim['far'] * gross)
        out.update(fits=True, footprint=fp, gfa=gfa, sellable=gfa * u['eff'], yield_text='{:,.0f} sf GFA ({:,.0f} rentable)'.format(gfa, gfa * u['eff']))
    elif k == 'single':
        if net / SQFT_ACRE > u['max_ac']:
            out.update(fits=True, gfa=u['bldg_sf'], sellable=u['bldg_sf'], partial=True,
                       yield_text='1 store, {:,} sf, on ~{:.1f} ac; {:.1f} ac left for another use'.format(u['bldg_sf'], u['max_ac'] * 0.6, net / SQFT_ACRE - u['max_ac'] * 0.6))
        else:
            out.update(fits=True, gfa=u['bldg_sf'], sellable=u['bldg_sf'], yield_text='1 store, {:,} sf'.format(u['bldg_sf']))
    return cap(out, u, net)


def cap(out, u, net):
    """hold a use to what its market can absorb (max_sf / max_units, from the market study or params); the land it
    doesn't need is left for another use (test it with --mix)"""
    if not out.get('fits'):
        return out
    frac = 1.0
    if u.get('max_sf') and out.get('gfa', 0) > u['max_sf']:
        frac = u['max_sf'] / out['gfa']
    if u.get('max_units') and out.get('units', 0) > u['max_units']:
        frac = min(frac, u['max_units'] / out['units'])
    if frac >= 1:
        return out
    for k in ('gfa', 'sellable', 'footprint'):
        if k in out:
            out[k] *= frac
    if 'stalls' in out:
        out['stalls'] = math.ceil(out['stalls'] * frac)
    if 'units' in out:
        out['units'] = int(out['units'] * frac)
    out['partial'] = True
    out['leftover_ac'] = net * (1 - frac) / SQFT_ACRE
    out['yield_text'] = ('{:,.0f} sf'.format(out['gfa']) if not out.get('units') else '%d units' % out['units']) + \
        ' (market cap), %.1f net ac left' % out['leftover_ac']
    return out


def mix(spec, uses, market, net, gross, lim, gross_ac):
    """'restaurant=1.6,retail=rest': net acres to each use in order, 'rest' takes what is left"""
    parts, left = [], net
    for item in spec.split(','):
        k, ac = item.split('=')
        sf = left if ac.strip() == 'rest' else min(left, float(ac) * SQFT_ACRE)
        left -= sf
        u = uses[k.strip()]
        f = fit(k.strip(), u, sf, gross * sf / net if net else 0, lim)
        v = value(f, u, market.get(k.strip()), gross_ac * sf / net if net else 0)
        if v:
            f.update(v)
        parts.append((k.strip(), sf, f))
    ok = all(f.get('fits') for _, _, f in parts)
    out = dict(use='mix:' + spec, label='Mix: ' + ' + '.join('%s %.1f ac' % (k, sf / SQFT_ACRE) for k, sf, _ in parts), fits=ok, parts=[f for _, _, f in parts])
    if not ok:
        out['why'] = '; '.join('%s: %s' % (k, f['why']) for k, _, f in parts if not f.get('fits'))
        return out
    out['gfa'] = sum(f.get('gfa', 0) for _, _, f in parts)
    out['sellable'] = sum(f.get('sellable', 0) for _, _, f in parts)
    out['yield_text'] = ' + '.join(('%d %s' % (f['units'], k) if f.get('units') else '{:,.0f} sf {}'.format(f['gfa'], k)) for k, _, f in parts)
    if all(f.get('rlv') is not None for _, _, f in parts):
        out['rlv'] = sum(f['rlv'] for _, _, f in parts)
    if left > SQFT_ACRE * 0.1:
        out['yield_text'] += ' (%.1f ac unused)' % (left / SQFT_ACRE)
    return out


def value(f, u, mk, gross_ac):
    """residual land value = value (or revenue) - cost - developer profit; mk: the use's market inputs"""
    if not f.get('fits') or not mk:
        return None
    soft, prof = mk.get('soft_pct', 0.20), mk.get('profit_pct', 0.12)
    site = mk.get('site_per_ac', 0) * gross_ac
    if mk.get('lot_price') or mk.get('sale_per_unit'):
        rev = f['units'] * (mk.get('lot_price') or mk['sale_per_unit'])
        hard = f['units'] * mk.get('hard_per_unit', 0)
        cost = (hard + site) * (1 + soft)
        return dict(value=rev, cost=cost, profit=rev * prof, rlv=rev - cost - rev * prof)
    if mk.get('rent_unit_mo'):
        egi = f['units'] * mk['rent_unit_mo'] * 12 * (1 - mk.get('vacancy', 0.07))
        hard = f['units'] * mk.get('hard_per_unit', 0) or f['gfa'] * mk.get('hard_psf', 0)
    else:
        egi = f['sellable'] * mk.get('rent_psf_yr', 0) * (1 - mk.get('vacancy', 0.07))
        hard = f['gfa'] * mk.get('hard_psf', 0)
    noi = egi * (1 - mk.get('opex_pct', 0.30)) if 'opex_psf' not in mk else egi - mk['opex_psf'] * f['sellable']
    val = noi / mk['cap_rate'] if mk.get('cap_rate') else 0
    cost = (hard + site) * (1 + soft)
    return dict(value=val, cost=cost, profit=val * prof, rlv=val - cost - val * prof, noi=noi)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model')
    ap.add_argument('--acres', type=float)
    ap.add_argument('--uses', help='comma list (default: all)')
    ap.add_argument('--params', help='JSON overrides per use')
    ap.add_argument('--market', help='JSON market inputs per use')
    ap.add_argument('--row-ac', type=float, default=0)
    ap.add_argument('--flood-ac', type=float, default=0)
    ap.add_argument('--flood-reserve', action='store_true', help='hold the model flood_zone_poly out of the net land')
    ap.add_argument('--detention-rate', type=float)
    ap.add_argument('--pond-depth', type=float)
    ap.add_argument('--coverage', type=float, help='max building coverage (0-1) from the code')
    ap.add_argument('--far', type=float)
    ap.add_argument('--density', type=float, help='max dwelling units per gross acre from the code')
    ap.add_argument('--mix', action='append', default=[], help='test a combination: restaurant=1.6,retail=rest (net acres)')
    ap.add_argument('--json', help='write the results here')
    a = ap.parse_args()
    if not a.model and not a.acres:
        raise SystemExit('Give --model or --acres.')
    gross, deductions, net, env_sf = land_budget(a)
    gross_ac = gross / SQFT_ACRE
    uses = {k: dict(v) for k, v in USES.items()}
    if a.params:
        for k, v in json.load(open(a.params)).items():
            uses.setdefault(k, {}).update(v)
    keys = a.uses.split(',') if a.uses else list(uses)
    market = json.load(open(a.market)) if a.market else {}
    for k, mk in market.items():  # a market study's absorption limits
        for cap_key in ('max_sf', 'max_units'):
            if k in uses and mk.get(cap_key):
                uses[k][cap_key] = mk[cap_key]
    lim = {k: getattr(a, k) for k in ('coverage', 'far', 'density') if getattr(a, k)}

    print('LAND BUDGET')
    print('  Gross site                         %10s sf  %7.2f ac' % ('{:,.0f}'.format(gross), gross_ac))
    for lab, sf, basis in deductions:
        print('  less %-30s %10s sf  %7.2f ac   (%s)' % (lab, '{:,.0f}'.format(sf), sf / SQFT_ACRE, basis))
    print('  Net developable                    %10s sf  %7.2f ac  (%.0f%% of gross)' % ('{:,.0f}'.format(net), net / SQFT_ACRE, 100 * net / gross))
    if env_sf:
        print('  (building setback envelope: %.2f ac)' % (env_sf / SQFT_ACRE))
    print()
    res = []
    for k in keys:
        if k not in uses:
            print('unknown use %s' % k)
            continue
        f = fit(k, uses[k], net, gross, lim)
        v = value(f, uses[k], market.get(k), gross_ac)
        if v:
            f.update(v)
        res.append(f)
    for spec in a.mix:
        res.append(mix(spec, uses, market, net, gross, lim, gross_ac))
    ranked = any(r.get('rlv') is not None for r in res)
    res.sort(key=lambda r: (not r.get('fits'), -(r.get('rlv') if r.get('rlv') is not None else -1e18) if ranked else -(r.get('sellable') or 0)))
    print('%-44s %-46s %14s %14s' % ('USE', 'MAX YIELD ON THIS SITE', 'RLV', 'RLV / ac'))
    for i, r in enumerate(res):
        if not r.get('fits'):
            print('%-44s %-46s' % (r['label'][:44], 'does not fit: ' + r['why']))
            continue
        rl = r.get('rlv')
        print('%-44s %-46s %14s %14s' % (r['label'][:44], r['yield_text'][:46], ('${:,.0f}'.format(rl) if rl is not None else 'no market data'),
                                         ('${:,.0f}'.format(rl / gross_ac) if rl is not None else '')))
        r['rank'] = i + 1 if ranked and rl is not None else None
    if not ranked:
        print('\nNot ranked: without --market (rents, prices, costs, cap rates) the uses cannot be compared on value.'
              ' Screen them on legal / physical / market grounds and get market inputs before naming a highest and best use.')
    print('\nYields are a land-budget test fit (typical planning metrics, ENGINEERING ASSUMPTION), not a layout. Lay out the'
          ' chosen use(s) in the model and let build_siteplan.py measure the real numbers.')
    if a.json:
        json.dump(dict(gross_sf=gross, net_sf=net, deductions=deductions, results=res), open(a.json, 'w'), indent=1)
        print('Wrote %s' % a.json)


if __name__ == '__main__':
    main()
