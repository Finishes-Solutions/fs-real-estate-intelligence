#!/usr/bin/env python3
"""Writes a rule-based seed floor plan into each building type that has none, and prints its design brief.

    python3 scripts/seed_designs.py project.json                 # seed the types without a design
    python3 scripts/seed_designs.py project.json --types A --force   # re-seed type A

This is how the app designs: the seed already passes every design check (one tenant bay per ~30 ft of frontage with a
restroom and back of house, a restaurant's dining / kitchen / restrooms, a home's garage, living and bedrooms, an L laid
out wing by wing). Your job is then to improve it into a plan an architect would draw, run --validate-only, and keep
the seed for anything you can't improve without breaking a check. Prints a short summary, never the JSON."""
import argparse
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from fsplans.design import normalize_type, validate  # noqa: E402
from fsplans.seed import fallback_design, design_brief, SUPPORTED  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('--types', help='comma list of type ids (default: every type without a design)')
    ap.add_argument('--force', action='store_true', help='replace an existing design')
    a = ap.parse_args()
    p = json.load(open(a.project))
    want = a.types.split(',') if a.types else None
    where = (p.get('project') or {}).get('address') or (p.get('project') or {}).get('county')
    n = 0
    for raw in p.get('types') or []:
        if want and raw['id'] not in want:
            continue
        if raw.get('design') and not a.force:
            print('Type %s already has a design (use --force to replace it).' % raw['id'])
            continue
        t = normalize_type(raw)
        if t['use'] not in SUPPORTED:
            print('Type %s (%s): no rule-based design for this use; site sheets only.' % (raw['id'], t['use']))
            continue
        d = fallback_design(t)
        P = validate(t, d)
        d['source'] = 'rule-based seed'
        raw['design'] = d
        n += 1
        print('\n' + design_brief(t, dict(where=where)))
        print('Seed: %s %d rooms, %d doors, %d window groups. Checks: %s' % (d['summary'], len(d['rooms']), len(d['doors']), len(d['windows']),
                                                                           'ALL PASS' if not P else '; '.join(P[:3])))
        print('Rooms: ' + ', '.join('%s %s (%g x %g at %g,%g)' % (r['id'], r['name'], r['w'], r['d'], r['x'], r['y']) for r in d['rooms'][:24]) +
              (' …' if len(d['rooms']) > 24 else ''))
    json.dump(p, open(a.project, 'w'), indent=1)
    print('\nSeeded %d type(s) in %s. Improve each design, then run build_set.py --validate-only.' % (n, a.project))


if __name__ == '__main__':
    main()
