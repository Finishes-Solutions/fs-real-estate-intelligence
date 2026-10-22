#!/usr/bin/env python3
"""Takes the project model out of a site layout PDF, without reading it into the conversation.

    python3 scripts/read_model.py SP-1.pdf --out project.json

fs-site-plan embeds its hand-off model (an fs-set-plans project.json in feet) in the SP-1 PDF as the attachment
site-model.json, so the PDF is the only file that has to be passed on. This writes it out and prints a short summary
(acres, buildings, types, parking rows) instead of the JSON. Exit code 3 when the PDF carries no model: then take the
site off the drawing (references/intake.md).

Also accepts a .json model (copied as is, with the same summary), and a text file holding the PDF's text: some
platforms give an agent only the text of an attachment, and the sheet prints the model in it as invisible
<<FS:nnnn:...:FS>> lines. Save that text to a file (all of it, or just the FS lines) and run this on it."""
import argparse
import json
import math
import shutil
import sys


def area(P):
    return abs(sum(P[i][0] * P[(i + 1) % len(P)][1] - P[(i + 1) % len(P)][0] * P[i][1] for i in range(len(P)))) / 2


def summary(p):
    s = p.get('site') or {}
    b = s.get('boundary') or []
    pr = p.get('project') or {}
    lines = ['Project: %s%s' % (pr.get('name', '?'), (' · ' + pr['option']) if pr.get('option') else ''),
             'Boundary: %d corners, %.2f ac drawn; stated %s ac' % (len(b), area(b) / 43560 if len(b) > 2 else 0,
                                                                 (s.get('stated') or {}).get('acres', '?'))]
    types = p.get('types') or []
    lines.append('Types: ' + (', '.join('%s %s %sx%s ft, %s floor(s)%s' % (t.get('id'), t.get('use'), t.get('W'), t.get('D'), t.get('floors', 1),
                                                                         '' if t.get('design') else ', no design') for t in types) or 'none'))
    lines.append('Buildings: %d · paving areas: %d · drives: %d · parking rows: %d · ponds: %d · streets: %s' % (
        len(s.get('buildings') or []), len(s.get('paving') or []), len(s.get('drives') or []), len(s.get('parking_rows') or []),
        len(s.get('ponds') or []), ', '.join(st.get('name', '?') for st in s.get('streets') or []) or 'none'))
    pk = s.get('parking') or {}
    if pk:
        lines.append('Parking: provided %s, required %s' % (pk.get('provided', '?'), pk.get('required', '?')))
    lines.append('north_deg %s · display_rotate_deg %s · facts: %d' % (s.get('north_deg'), s.get('display_rotate_deg'), len(p.get('facts') or [])))
    return '\n'.join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src', help='the SP-1 site layout PDF (or a model .json)')
    ap.add_argument('--out', default='project.json')
    a = ap.parse_args()
    import os
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import modeltext
    if a.src.lower().endswith('.json'):
        shutil.copy(a.src, a.out)
    elif not a.src.lower().endswith('.pdf'):  # the PDF's text, saved to a file (the platform gave no file)
        m = modeltext.parse(open(a.src, errors='replace').read())
        if m is None:
            print('No FS-MODEL lines in %s: this text carries no model (an older sheet, or the extractor dropped it).' % a.src)
            sys.exit(3)
        json.dump(m, open(a.out, 'w'))
    else:
        from pypdf import PdfReader
        att = PdfReader(a.src).attachments
        data = None
        for name in ('site-model.json', 'project.json'):
            if att.get(name):
                data = att[name][0]
                break
        if data is None:  # no attachment: the same model printed on the sheet as invisible text
            r = PdfReader(a.src)
            m = None
            for pg in r.pages[:2]:
                m = modeltext.parse(pg.extract_text() or '')
                if m:
                    break
            if m is None:
                print('No embedded model in %s (attachments: %s). Take the site off the drawing instead (references/intake.md).'
                      % (a.src, ', '.join(att) or 'none'))
                sys.exit(3)
            data = json.dumps(m).encode()
        open(a.out, 'wb').write(data)
    p = json.load(open(a.out))
    print('Wrote %s (%.0f KB).' % (a.out, len(json.dumps(p)) / 1024))
    print(summary(p))


if __name__ == '__main__':
    main()
