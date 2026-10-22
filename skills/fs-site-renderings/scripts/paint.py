#!/usr/bin/env python3
"""Paints a prepared paint package: the paid step only, on any computer with Python 3 and internet access.

The agent's sandbox may not reach api.openai.com. Then render_views.py --package writes paint-package.zip: the massing
pictures, prompts, references and this script. Run it where OpenAI is reachable (your own computer, a server):

    python3 paint.py              # shows what it would do and the estimate
    python3 paint.py --yes        # makes the calls (they cost money)

Needs only the Python standard library. The key comes from OPENAI_API_KEY, --key-file, or openai.key / .env next to
this script; it is sent only to api.openai.com and never printed or saved. Writes <view>.jpg and painted.json next to
the jobs; hand that folder (or a zip of it) back to the agent, which checks each picture against its massing
(render_views.py --import) and makes the sheet."""
import argparse
import base64
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
try:
    from fsrender import openai_images as OA  # inside the skill
except ImportError:
    import openai_images as OA  # inside a paint package


def find_key(key_file):
    if os.environ.get('OPENAI_API_KEY', '').strip() or key_file:
        return OA.get_key(key_file)
    for name in ('openai.key', '.env'):
        f = os.path.join(HERE, name)
        if os.path.exists(f):
            k = OA._from_file(f)
            if k.startswith('sk-'):
                return k, name + ' next to paint.py'
    return OA.get_key(None)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dir', default=HERE, help='the package folder (default: this script\'s folder)')
    ap.add_argument('--yes', action='store_true', help='make the API calls (they cost money)')
    ap.add_argument('--views', help='comma list of view ids (default: all)')
    ap.add_argument('--budget', type=float, help='stop before a call that could take the total over this many US dollars')
    ap.add_argument('--model')
    ap.add_argument('--key-file')
    a = ap.parse_args()
    pk = json.load(open(os.path.join(a.dir, 'jobs.json')))
    jobs = [j for j in pk['views'] if not a.views or j['id'] in a.views.split(',')]
    refs = [(os.path.basename(f), open(os.path.join(a.dir, f), 'rb').read(), 'image/png' if f.lower().endswith('.png') else 'image/jpeg')
            for f in pk.get('refs', [])]
    if not a.yes:
        print('Ready to paint %d view(s) for %s, %d reference image(s) each: %d paid call(s), roughly $0.20-0.50 each (an estimate). '
              'Re-run with --yes.' % (len(jobs), pk.get('project') or 'the project', len(refs), len(jobs)))
        return
    key, src = find_key(a.key_file)
    print('OpenAI key: from %s.' % src)
    model = a.model or pk.get('model')
    if not model:
        try:
            model = OA.pick_image_model(OA.list_models(key))
        except OA.OpenAIError as e:
            print('Could not list models (%s); trying %s.' % (e, OA.PREFERRED))
            model = OA.PREFERRED
    out_json = os.path.join(a.dir, 'painted.json')
    done = json.load(open(out_json)) if os.path.exists(out_json) else dict(views=[])
    total = 0.0
    size_ok = pk.get('size') or OA.SIZES[0]
    for j in jobs:
        if a.budget is not None and total + 0.5 > a.budget:
            print('Stopping before %s: the next call could take the total (about $%.2f) over the $%.2f budget.' % (j['id'], total, a.budget))
            break
        text = open(os.path.join(a.dir, j['prompt'])).read()
        res = None
        sizes = OA.SIZES[OA.SIZES.index(size_ok):]
        t0 = time.time()
        for k, size in enumerate(sizes):
            mp = os.path.join(a.dir, j['massing'][size])  # the massing at the picture's own size and proportions
            try:
                res = OA.edit(key, model, text, [('massing.png', open(mp, 'rb').read(), 'image/png')] + refs, size=size)
                size_ok = size
                break
            except OA.OpenAIError as e:
                if e.status == 'size' and k + 1 < len(sizes):
                    print('%-13s %s refused %s; trying %s' % (j['id'], model, size, sizes[k + 1]))
                    continue
                print('%-13s FAILED: %s' % (j['id'], e))
                break
        if not res:
            continue
        jp = os.path.join(a.dir, j['id'] + '.jpg')
        open(jp, 'wb').write(base64.b64decode(res['b64']))
        cost = OA.cost_of(res['model'], res['usage']) or 0
        total += cost
        done['views'] = [v for v in done['views'] if v['id'] != j['id']] + [dict(
            id=j['id'], file=os.path.basename(jp), size=res['size'], model=res['model'], input_fidelity=res['fidelity'],
            cost_usd=round(cost, 3), made=time.strftime('%Y-%m-%d %H:%M'))]
        json.dump(done, open(out_json, 'w'), indent=1)
        print('%-13s %s  %s %s, %.0f s, ~$%.2f' % (j['id'], jp, res['model'], res['size'], time.time() - t0, cost))
    print('\nDone: about $%.2f (estimate). Send this folder (or a zip of it) back for the fidelity check and the sheet.' % total)


if __name__ == '__main__':
    main()
