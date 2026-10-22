#!/usr/bin/env python3
"""Five photoreal renderings of a project, true to its site layout and plans.

    python3 scripts/render_views.py project.json --out renders/ --massing-only          # 1. the massing views, no API call
    python3 scripts/render_views.py project.json --out renders/ --refs refs/refs.json    # 2. what it would cost (no call)
    python3 scripts/render_views.py project.json --out renders/ --refs refs/refs.json --yes   # 3. paint them
    python3 scripts/render_views.py project.json --out renders/ --views street --yes     # re-paint one view
    python3 scripts/render_views.py project.json --out renders/ --refs refs/refs.json --package   # no network here: a package for paint.py
    python3 scripts/render_views.py project.json --out renders/ --import painted.zip     # bring the painted package back

project.json: the fs-set-plans project (the fs-site-plan hand-off, with the building designs the set agent added).
Builds the 3D massing from it, renders each view (scripts/fsrender/views.py), and sends the massing (plus the drawing-set
references from plan_refs.py) to the OpenAI Images edit endpoint: gpt-image-2.5-sunburst by default, quality high,
input_fidelity high, so the model keeps the geometry and camera and paints it photographically at midday. Then overlays
the massing outlines on each result and scores how closely it kept them (fidelity.py).

Writes per view: <view>-massing.png, <view>.jpg (the rendering), <view>-prompt.txt, <view>-compare.png (massing |
rendering | overlay), plus scene.txt and renders.json (model, size, cost estimate, scores). Needs numpy and Pillow.
The key comes from OPENAI_API_KEY, --key-file, or openai.key / .env in the skill folder; it is never printed or saved."""
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
    ap.add_argument('--budget', type=float, help='pre-approved spend in US dollars: stop before a call that could go over it')
    ap.add_argument('--package', action='store_true', help='no API call here: write paint-package.zip to run paint.py where OpenAI is reachable')
    ap.add_argument('--import', dest='imp', help='a painted package folder (or zip) from paint.py: check each picture and record it')
    a = ap.parse_args()

    p = json.load(open(a.project))
    os.makedirs(a.out, exist_ok=True)
    # what the paid step needs, checked on every run so the owner always hears what is missing
    key_ok, key_txt = OA.key_status(a.key_file)
    net_ok, net_txt = OA.reachable() if not a.imp else (True, 'not needed (importing)')
    print('SETUP  OpenAI key: %s\n       api.openai.com: %s' % (key_txt, net_txt))
    state = dict(project=(p.get('project') or {}).get('name') or 'the project', key=(key_ok, key_txt), net=(net_ok, net_txt), yes=a.yes,
                 budget=a.budget, out=a.out, made=[], package=None, painted=0, failed=[])
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
    state['made'] = [V['id'] + '-massing.png' for V, *_ in jobs]
    if a.massing_only:
        print('\nMassing only: look at every *-massing.png before painting (SKILL.md, step 4).')
        return write_status(state)
    if a.package:
        write_package(a, p, jobs, refs, massing)
        state['package'] = os.path.join(a.out, 'paint-package.zip')
        return write_status(state)
    if a.imp:
        import_package(a, p, scene, views, massing)
        state['painted'] = sum(1 for V in views if os.path.exists(os.path.join(a.out, V['id'] + '.jpg')))
        return write_status(state)
    model = a.model
    if not a.yes:
        print('\nReady to paint %d view(s) with %s at high quality (%s), %d reference image(s) each. That is %d paid API call(s), '
              'roughly $0.20-0.50 each (an estimate). Confirm with the user, then re-run with --yes.' % (
                  len(jobs), model or OA.PREFERRED, a.size, len(refs), len(jobs)))
        return write_status(state)
    if not (key_ok and net_ok):
        write_status(state)
        raise SystemExit('Cannot paint here: %s. Make the paint package instead (--package); STATUS.md says what to do.' % (
            '; '.join(x for x in ((None if key_ok else 'no OpenAI key'), (None if net_ok else 'api.openai.com is not reachable')) if x)))
    key, src = OA.get_key(a.key_file)
    print('OpenAI key: from %s.' % src)
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
        if a.budget is not None and total + 0.5 > a.budget:
            print('Stopping before %s: the next call could take the total (about $%.2f) over the $%.2f budget.' % (V['id'], total, a.budget))
            break
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
    state['painted'] = sum(1 for v in manifest['views'] if v.get('file'))
    state['failed'] = [v['id'] for v in manifest['views'] if v.get('error')]
    write_status(state)
    if any(v.get('error') for v in manifest['views']):
        print('Some views failed (see above); re-run them with --views <ids> --yes.')
    print('\nWrote %s. Total about $%.2f (estimate). Now look at every *-compare.png.' % (old, total))


def write_status(st):
    """STATUS.md in the output folder: whether renderings were made, what is missing and the owner's next step, in plain
    words, so a run that stops early never leaves the owner guessing"""
    key_ok, key_txt = st['key']
    net_ok, net_txt = st['net']
    n = st['painted']
    lines = ['# Renderings status: %s' % st['project'], '',
             '**Renderings made: %s**' % ('YES, %d of 5' % n if n else 'NO'), '',
             '- OpenAI key: ' + ('found' if key_ok else 'MISSING. ' + key_txt),
             '- Connection to api.openai.com: ' + ('yes' if net_ok else 'NO. ' + net_txt),
             '- Go-ahead to spend: ' + (('yes' + (', budget $%.2f' % st['budget'] if st['budget'] is not None else '')) if st['yes'] else 'not given for this run'), '']
    if st['made']:
        lines += ['Made here: the 3D massing views (%s), their prompts and scene.txt.' % ', '.join(st['made']), '']
    if st['package']:
        lines += ['Paint package: `%s` (no key inside).' % os.path.basename(st['package']), '']
    if st['failed']:
        lines += ['Views that failed: %s (re-run them with --views).' % ', '.join(st['failed']), '']
    nxt = []
    if not n:
        if not key_ok:
            nxt.append('Put an OpenAI key in `openai.key` in the skill folder (one line, starts with sk-) and re-upload the skill, '
                       'or put it next to paint.py when you run the package yourself. Use a separate, budget-capped key.')
        if not net_ok:
            nxt.append('This sandbox cannot reach api.openai.com. Either allow that host in the platform\'s network settings, or run the '
                       'paint package yourself: open `paint.html` from it in a browser (or run `python3 paint.py --yes`), then send the '
                       'painted folder back to the agent.')
        if key_ok and net_ok and not st['yes']:
            nxt.append('Give the go-ahead to spend (about $0.20-0.50 a view), e.g. "Renderings approved, budget $3" in the task.')
    lines += ['## Next step', ''] + (['- ' + x for x in nxt] if nxt else ['- Look at every *-compare.png, then make the R-1 sheet.'])
    f = os.path.join(st['out'], 'STATUS.md')
    open(f, 'w').write('\n'.join(lines) + '\n')
    print('\nWrote %s: renderings made: %s.' % (f, ('%d of 5' % n) if n else 'NO'))


def write_package(a, p, jobs, refs, massing):
    """the paid step as a portable folder + zip: massing at every size the model may take, prompts, references,
    paint.py and the API client; no key goes in it"""
    import shutil
    import zipfile
    pk = os.path.join(a.out, 'paint-package')
    shutil.rmtree(pk, ignore_errors=True)
    os.makedirs(pk)
    meta = dict(project=(p.get('project') or {}).get('name'), model=a.model, size=a.size, views=[], refs=[])
    for r in refs:
        f = 'ref-' + os.path.basename(r['path'])
        shutil.copy(r['path'], os.path.join(pk, f))
        meta['refs'].append(f)
    for V, mp, ids, cam in jobs:
        shutil.copy(os.path.join(a.out, V['id'] + '-prompt.txt'), os.path.join(pk, V['id'] + '-prompt.txt'))
        m = {}
        for size in OA.SIZES[OA.SIZES.index(a.size):]:
            f, _, _ = massing(V, size)
            m[size] = '%s-%s-massing.png' % (V['id'], size)
            shutil.copy(f, os.path.join(pk, m[size]))
        massing(V, a.size)  # leave the default-size massing in place
        meta['views'].append(dict(id=V['id'], label=V['label'], prompt=V['id'] + '-prompt.txt', massing=m))
    json.dump(meta, open(os.path.join(pk, 'jobs.json'), 'w'), indent=1)
    from fsrender import paint_html
    paint_html.write(os.path.join(pk, 'paint.html'), meta, pk)  # the same step in a browser, for owners without Python
    shutil.copy(os.path.join(HERE, 'paint.py'), pk)
    shutil.copy(os.path.join(HERE, 'fsrender', 'openai_images.py'), pk)
    open(os.path.join(pk, 'README.txt'), 'w').write(
        'Paint package for %s: %d view(s), roughly $0.20-0.50 each.\n\n'
        'Easiest: open paint.html in Chrome, Edge or Safari, paste your OpenAI key, click Paint all views, then Download painted.zip\n'
        'and send painted.zip back to the agent. The key stays in that browser tab.\n\n'
        'Or with Python 3: put the key in OPENAI_API_KEY (or a file named openai.key here), run python3 paint.py --yes, and send this\n'
        'folder back zipped.\n' % (meta['project'] or 'the project', len(jobs)))
    zp = os.path.join(a.out, 'paint-package.zip')
    with zipfile.ZipFile(zp, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(os.listdir(pk)):
            z.write(os.path.join(pk, f), os.path.join('paint-package', f))
    print('\nWrote %s (%d views, no key inside). Run paint.py from it where api.openai.com is reachable, then bring the folder back '
          'with --import.' % (zp, len(jobs)))


def import_package(a, p, scene, views, massing):
    """the pictures painted elsewhere: check each against its massing at the size it was painted, write the compare
    images and renders.json as a direct run would"""
    import shutil
    import zipfile
    src = a.imp
    if src.lower().endswith('.zip'):
        dst = os.path.join(a.out, 'painted')
        with zipfile.ZipFile(src) as z:
            z.extractall(dst)
        hits = [r for r, _, fs in os.walk(dst) if 'painted.json' in fs]
        if not hits:
            raise SystemExit('No painted.json in %s: run paint.py --yes in the package first.' % src)
        src = hits[0]
    done = json.load(open(os.path.join(src, 'painted.json')))
    by_id = {V['id']: V for V in views}
    out_json = os.path.join(a.out, 'renders.json')
    prev = json.load(open(out_json)) if os.path.exists(out_json) else {}
    man = dict(prev, project=(p.get('project') or {}).get('name'))
    man['views'] = [v for v in prev.get('views', []) if v['id'] not in {d['id'] for d in done['views']}]
    total = 0.0
    for d in done['views']:
        V = by_id.get(d['id'])
        if not V:
            continue
        mp, ids, cam = massing(V, d['size'])
        jp = os.path.join(a.out, V['id'] + '.jpg')
        shutil.copy(os.path.join(src, d['file']), jp)
        score, per = check(mp, ids, jp, os.path.join(a.out, V['id'] + '-compare.png'))
        weak = {scene.objects.get(k, str(k)): round(v, 2) for k, v in per.items() if v < FLAG_BUILDING}
        flag = (score is not None and score < FLAG_SCORE) or bool(weak)
        total += d.get('cost_usd') or 0
        man['views'].append(dict(id=V['id'], label=V['label'], file=os.path.basename(jp), massing=os.path.basename(mp), model=d['model'],
                                 size=d['size'], input_fidelity=d.get('input_fidelity'), cost_usd=d.get('cost_usd'),
                                 fidelity=round(score, 3) if score is not None else None, weak_buildings=weak, flagged=flag,
                                 camera=cam.as_dict(), made=d.get('made'), painted_elsewhere=True))
        print('%-13s %s  fidelity %s%s' % (V['id'], jp, ('%.0f%%' % (100 * score)) if score is not None else 'n/a', '  << LOOK CLOSELY' if flag else ''))
    order = [v['id'] for v in VIEWS]
    man['views'].sort(key=lambda v: order.index(v['id']) if v['id'] in order else 99)
    man['total_cost_usd_estimate'] = round(sum(v.get('cost_usd') or 0 for v in man['views']), 2)
    json.dump(man, open(out_json, 'w'), indent=1)
    print('\nWrote %s. Now look at every *-compare.png.' % out_json)


if __name__ == '__main__':
    main()
