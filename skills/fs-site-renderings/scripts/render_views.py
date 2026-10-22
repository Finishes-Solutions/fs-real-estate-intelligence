#!/usr/bin/env python3
"""Five photoreal renderings of a project, true to its site layout and plans.

    python3 scripts/render_views.py project.json --out renders/ --massing-only          # 1. the massing views, no API call
    python3 scripts/render_views.py project.json --out renders/ --refs refs/refs.json    # 2. what it would cost (no call)
    python3 scripts/render_views.py project.json --out renders/ --refs refs/refs.json --yes   # 3. paint them
    python3 scripts/render_views.py project.json --out renders/ --views street --yes     # re-paint one view

project.json: the fs-set-plans project (the fs-site-plan hand-off, with the building designs the set agent added).
Builds the 3D massing from it, renders each view (scripts/fsrender/views.py), and sends the massing (plus the drawing-set
references from plan_refs.py) to the OpenAI Images edit endpoint: gpt-image-2.5-sunburst by default, quality high,
input_fidelity high, so the model keeps the geometry and camera and paints it photographically at midday. Then overlays
the massing outlines on each result and scores how closely it kept them (fidelity.py).

Writes per view: <view>-massing.png, <view>.jpg (the rendering), <view>-prompt.txt, <view>-compare.png (massing |
rendering | overlay), plus scene.txt and renders.json (model, size, cost estimate, scores). Needs numpy and Pillow.
The key comes from OPENAI_API_KEY (or --key-file); it is never printed or saved."""
import argparse
import base64
import io
import json
import os
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import numpy as np  # noqa: E402
from fsrender.scene import Scene  # noqa: E402
from fsrender.views import VIEWS, camera_for  # noqa: E402
from fsrender.raster import render  # noqa: E402
from fsrender import prompt as PR  # noqa: E402
from fsrender import openai_images as OA  # noqa: E402
from fsrender.fidelity import check  # noqa: E402

FLAG_SCORE = 0.75  # the whole picture
FLAG_BUILDING = 0.70  # any one building


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('project')
    ap.add_argument('--out', default='renders')
    ap.add_argument('--views', help='comma list of view ids (default: all five)')
    ap.add_argument('--views-file', help='JSON list of view definitions to replace or adjust the five (by id)')
    ap.add_argument('--refs', help='refs.json from plan_refs.py: drawing-set images sent with every view')
    ap.add_argument('--massing-only', action='store_true')
    ap.add_argument('--yes', action='store_true', help='make the API calls (they cost money)')
    ap.add_argument('--model', help='image model (default gpt-image-2.5-sunburst, else the newest the key lists)')
    ap.add_argument('--size', default=OA.SIZES[0], choices=OA.SIZES)
    ap.add_argument('--key-file')
    ap.add_argument('--sun-az', type=float, default=190, help='sun azimuth, degrees from true north (190: just past solar noon)')
    ap.add_argument('--sun-el', type=float, default=62, help='sun elevation, degrees (62: a Texas midday from spring to fall)')
    ap.add_argument('--no-trees', action='store_true')
    a = ap.parse_args()

    p = json.load(open(a.project))
    os.makedirs(a.out, exist_ok=True)
    scene = Scene(p, a.sun_az, a.sun_el, trees=not a.no_trees)
    rep = scene.report()
    print(rep)
    open(os.path.join(a.out, 'scene.txt'), 'w').write(rep + '\n')
    views = [dict(v) for v in VIEWS]
    if a.views_file:
        for v in json.load(open(a.views_file)):
            hit = [x for x in views if x['id'] == v.get('id')]
            hit[0].update(v) if hit else views.append(v)
    if a.views:
        want = a.views.split(',')
        views = [v for v in views if v['id'] in want]
    refs = []
    if a.refs:
        base = os.path.dirname(os.path.abspath(a.refs))
        for r in json.load(open(a.refs))[:6]:
            f = r['file'] if os.path.isabs(r['file']) else os.path.join(base, r['file'])
            refs.append(dict(r, path=f))

    def massing(V, size):
        W, H = map(int, size.split('x'))
        cam = camera_for(scene, V, W, H)
        img, ids = render(scene, cam, ss=2)
        mp = os.path.join(a.out, V['id'] + '-massing.png')
        img.save(mp)
        np.savez_compressed(os.path.join(a.out, V['id'] + '-ids.npz'), ids=ids)
        return mp, ids, cam

    manifest = dict(project=(p.get('project') or {}).get('name'), views=[], refs=[r['caption'] for r in refs])
    jobs = []
    for V in views:
        t0 = time.time()
        mp, ids, cam = massing(V, a.size)
        text = PR.build(p, scene, V, refs)
        open(os.path.join(a.out, V['id'] + '-prompt.txt'), 'w').write(text + '\n')
        print('%-13s massing %s (%.1f s)' % (V['id'], mp, time.time() - t0))
        jobs.append((V, mp, ids, cam))
    if a.massing_only:
        print('\nMassing only: look at every *-massing.png before painting (SKILL.md, step 4).')
        return
    model = a.model
    if not a.yes:
        print('\nReady to paint %d view(s) with %s at high quality (%s), %d reference image(s) each. That is %d paid API call(s), '
              'roughly $0.20-0.50 each (an estimate). Confirm with the user, then re-run with --yes.' % (
                  len(jobs), model or OA.PREFERRED, a.size, len(refs), len(jobs)))
        return
    key = OA.get_key(a.key_file)
    if not model:
        try:
            model = OA.pick_image_model(OA.list_models(key))
        except OA.OpenAIError as e:
            print('Could not list models (%s); trying %s.' % (e, OA.PREFERRED))
            model = OA.PREFERRED
    if model != OA.PREFERRED:
        print('NOTE: %s is not available to this key; using %s.' % (OA.PREFERRED, model))
    out_json = os.path.join(a.out, 'renders.json')
    prev = json.load(open(out_json)) if os.path.exists(out_json) else {}

    def save(man, total):
        """renders.json, written after every view; re-painting some views keeps the others"""
        done = [x['id'] for x in man['views']]
        keep = [v for v in prev.get('views', []) if v['id'] not in done]
        order = [v['id'] for v in VIEWS]
        out = dict(man, views=sorted(keep + man['views'], key=lambda v: order.index(v['id']) if v['id'] in order else 99),
                   total_cost_usd_estimate=round(total, 2))
        json.dump(out, open(out_json, 'w'), indent=1)
        return out_json

    ref_files = [(os.path.basename(r['path']), open(r['path'], 'rb').read(), 'image/png' if r['path'].lower().endswith('.png') else 'image/jpeg') for r in refs]
    total = 0.0
    for V, mp, ids, cam in jobs:
        sizes = OA.SIZES[OA.SIZES.index(a.size):]
        text = open(os.path.join(a.out, V['id'] + '-prompt.txt')).read()
        res = None
        msize = '%dx%d' % (cam.W, cam.H)
        for k, size in enumerate(sizes):
            if size != msize:  # the massing must have the picture's size and proportions
                mp, ids, cam = massing(V, size)
                msize = size
            t0 = time.time()
            try:
                res = OA.edit(key, model, text, [('massing.png', open(mp, 'rb').read(), 'image/png')] + ref_files, size=size)
                a.size = size  # the next views start at the size the model took
                break
            except OA.OpenAIError as e:
                if e.status == 'size' and k + 1 < len(sizes):
                    print('%-13s %s refused %s; trying %s' % (V['id'], model, size, sizes[k + 1]))
                    continue
                print('%-13s FAILED: %s' % (V['id'], e))
                manifest['views'].append(dict(id=V['id'], label=V['label'], error=str(e)))
                break
        if not res:
            save(manifest, total)
            continue
        jp = os.path.join(a.out, V['id'] + '.jpg')
        open(jp, 'wb').write(base64.b64decode(res['b64']))
        cost = OA.cost_of(res['model'], res['usage'])
        total += cost or 0
        score, per = check(mp, ids, jp, os.path.join(a.out, V['id'] + '-compare.png'))
        weak = {scene.objects.get(k, str(k)): round(v, 2) for k, v in per.items() if v < FLAG_BUILDING}
        flag = (score is not None and score < FLAG_SCORE) or bool(weak)
        print('%-13s %s  %s %s, %.0f s%s, fidelity %s%s' % (V['id'], jp, res['model'], res['size'], time.time() - t0,
              (', ~$%.2f' % cost) if cost else '', ('%.0f%%' % (100 * score)) if score is not None else 'n/a', ('  << LOOK CLOSELY' + ((': ' + ', '.join('%s %.0f%%' % (n, 100 * v) for n, v in weak.items())) if weak else '')) if flag else ''))
        manifest['views'].append(dict(id=V['id'], label=V['label'], file=os.path.basename(jp), massing=os.path.basename(mp), model=res['model'],
                                      size=res['size'], input_fidelity=res['fidelity'], cost_usd=round(cost, 3) if cost else None,
                                      fidelity=round(score, 3) if score is not None else None, weak_buildings=weak, flagged=flag, camera=cam.as_dict(),
                                      made=time.strftime('%Y-%m-%d %H:%M')))
        save(manifest, total)
    old = save(manifest, total)
    if any(v.get('error') for v in manifest['views']):
        print('Some views failed (see above); re-run them with --views <ids> --yes.')
    print('\nWrote %s. Total about $%.2f (estimate). Now look at every *-compare.png.' % (old, total))


if __name__ == '__main__':
    main()
