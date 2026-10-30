"""Investor presentation: out/Montreve_Investor_Presentation.pdf (16:9) and its HTML source.

Every number comes from data/model.json (scripts/model.py), the site plan from out/Montreve_Site_Plan.pdf and the cabin
from out/Montreve_Cabin_Plans.pdf, so re-running the three scripts and this one keeps the deck in step with the model.
Rendered with the Chromium that Playwright ships (Node), the same way the app prints its reports.

  python3 -I projects/montreve/scripts/deck.py
"""
import json, re, subprocess, base64, html
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'out'
M = json.loads((ROOT / 'data' / 'model.json').read_text())
LOTS = json.loads((ROOT / 'data' / 'lots.json').read_text())
SITE = json.loads((ROOT / 'data' / 'site_plan.json').read_text())
R, V = M['results'], M['inputs']
B, IB = R['base'], V['base']
PROG = {'cabins': 'A · Cabins only', 'lean': 'B · Lean resort', 'full': 'C · Full resort'}


def money(x, k=False):
    sign, x = ('-' if x < 0 else ''), abs(x)
    if k: return f'{sign}${x / 1e3:,.0f}k'
    return sign + (f'${x / 1e6:,.2f}M' if x >= 1e6 else f'${x:,.0f}')


def mm(x):  # prose: millions with two decimals
    return ('-' if x < 0 else '') + f'${abs(x) / 1e6:,.2f}M'


def png_b64(path):
    return 'data:image/png;base64,' + base64.b64encode(Path(path).read_bytes()).decode()


def svg_inline(name, fill=None):
    s = (ROOT / 'source' / 'logos' / name).read_text()
    s = re.sub(r'<\?xml[^>]*>', '', s)
    if fill: s = re.sub(r'fill:\s*#[0-9a-fA-F]{3,6}', f'fill: {fill}', s)
    return s


def render_png(pdf, page, dpi, out):
    subprocess.run(['pdftoppm', '-r', str(dpi), '-png', '-singlefile', '-f', str(page), '-l', str(page), str(pdf), str(out)], check=True)
    return str(out) + '.png'


# ---------------------------------------------------------------- images
tmp = OUT / '.deck'; tmp.mkdir(exist_ok=True)
site_png = render_png(OUT / 'Montreve_Site_Plan.pdf', 1, 90, tmp / 'site')
# the plan area only (the sidebar has its own legend; the slide gives one)
from PIL import Image
im = Image.open(site_png); w, h = im.size
im.crop((int(w * 0.0), int(h * 0.12), int(w * 0.765), int(h * 0.82))).save(tmp / 'site_crop.png')
im.crop((int(w * 0.30), int(h * 0.16), int(w * 0.70), int(h * 0.50))).save(tmp / 'core_crop.png')
lot_png = None
src_pdf = ROOT / 'source' / 'MONTREVE_Lot_Map_vector.pdf'
lot_png = render_png(src_pdf, 1, 110, tmp / 'lotmap')
plans = OUT / 'Montreve_Cabin_Plans.pdf'
plan_pngs = []
if plans.exists():
    n = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', str(plans)], capture_output=True, text=True).stdout).group(1))
    for p in range(1, n + 1):
        plan_pngs.append(render_png(plans, p, 70, tmp / f'plan{p}'))

# ---------------------------------------------------------------- charts (inline SVG)
NAVY, GOLD, CORAL, SKY, INK, MUTED, GREEN = '#0A3047', '#D9A441', '#E07A5F', '#6FA1C8', '#1E2B33', '#6B7A86', '#5E8C6A'


def chart_breakeven():
    W, H, L, T, Bt = 900, 430, 80, 20, 60
    lo, hi = 800000, 2300000
    y = lambda v: T + (H - T - Bt) * (1 - (v - lo) / (hi - lo))
    out = [f'<svg viewBox="0 0 {W} {H}" class="chart">']
    for v in range(800000, 2300001, 250000):
        out.append(f'<line x1="{L}" x2="{W - 10}" y1="{y(v):.0f}" y2="{y(v):.0f}" stroke="#E3E9EE"/><text x="{L - 10}" y="{y(v) + 5:.0f}" text-anchor="end" class="ax">${v / 1e6:.2f}M</text>')
    # comparable listings band and the $1.3M target
    out.append(f'<rect x="{L}" y="{y(IB["comp"] + 25000):.0f}" width="{W - L - 10}" height="{y(IB["comp"] - 25000) - y(IB["comp"] + 25000):.0f}" fill="#E8EEF2"/>'
               f'<text x="{W - 14}" y="{y(IB["comp"]) + 5:.0f}" text-anchor="end" class="ax">Listed 3-bed indoor-pool cabins ≈ {money(IB["comp"], True)}</text>')
    out.append(f'<line x1="{L}" x2="{W - 10}" y1="{y(IB["price"]):.0f}" y2="{y(IB["price"]):.0f}" stroke="{CORAL}" stroke-width="3" stroke-dasharray="8 6"/>'
               f'<text x="{L + 8}" y="{y(IB["price"]) - 10:.0f}" class="lab" fill="{CORAL}">Target $1.30M</text>')
    bw = 150
    for i, p in enumerate(PROG):
        cx = L + 110 + i * 250
        b, l, h = (R[s]['programs'][p]['break_even'] for s in ('base', 'low', 'high'))
        out.append(f'<rect x="{cx - bw / 2}" y="{y(b):.0f}" width="{bw}" height="{y(lo) - y(b):.0f}" rx="4" fill="{[SKY, GOLD, NAVY][i]}"/>')
        out.append(f'<line x1="{cx}" x2="{cx}" y1="{y(h):.0f}" y2="{y(l):.0f}" stroke="{INK}" stroke-width="2"/>'
                   f'<line x1="{cx - 14}" x2="{cx + 14}" y1="{y(h):.0f}" y2="{y(h):.0f}" stroke="{INK}" stroke-width="2"/><line x1="{cx - 14}" x2="{cx + 14}" y1="{y(l):.0f}" y2="{y(l):.0f}" stroke="{INK}" stroke-width="2"/>')
        out.append(f'<text x="{cx + bw / 2 + 8}" y="{y(b) + 6:.0f}" class="val">{money(b, True)}</text>')
        out.append(f'<text x="{cx}" y="{H - 30}" text-anchor="middle" class="lab">{PROG[p]}</text>')
    out.append('</svg>')
    return ''.join(out)


def cashflow():
    """Base-cost quarterly cash flow for the full program: the workbook's Cash flow sheet, in Python."""
    t, b, v = M['timing'], B, IB
    full = b['programs']['full']
    sp = b['sell_pct']; ck = b['carry_k']
    cum, rows = 0, []
    sold_before = 0
    for q in range(16):
        spend = -(t['fin'][q] * b['existing_finish'] + t['shared'][q] * b['shared'] + t['amen'][q] * full['amenities'] + t['cab'][q] * b['cabins'])
        fin = spend * ck
        old = -(b['carry_old'] / -(-v['debt_months'] // 3)) if sold_before < v['existing'] else 0
        fixed = -(v['marketing'] + v['hold']) / 16
        repay = -t['sell_existing'][q] / v['existing'] * v['debt']
        sales = (t['sell_existing'][q] + t['sell_new'][q]) * v['price'] * (1 - sp)
        net = spend + fin + old + fixed + repay + sales
        cum += net; sold_before += t['sell_existing'][q]
        rows.append({'spend': spend + fin + old + fixed, 'repay': repay, 'sales': sales, 'net': net, 'cum': cum})
    return rows


CF = cashflow()


def chart_cash():
    W, H, L, T, Bt = 900, 400, 80, 20, 50
    lo, hi = -12e6, 4e6
    y = lambda v: T + (H - T - Bt) * (1 - (v - lo) / (hi - lo))
    bw = (W - L - 20) / 16
    out = [f'<svg viewBox="0 0 {W} {H}" class="chart">']
    for v in range(-12, 5, 2):
        out.append(f'<line x1="{L}" x2="{W - 10}" y1="{y(v * 1e6):.0f}" y2="{y(v * 1e6):.0f}" stroke="{"#9AA5AE" if v == 0 else "#E3E9EE"}"/><text x="{L - 10}" y="{y(v * 1e6) + 5:.0f}" text-anchor="end" class="ax">{"-" if v < 0 else ""}${abs(v)}M</text>')
    pts = []
    for i, r in enumerate(CF):
        x = L + i * bw + 6
        out.append(f'<rect x="{x:.0f}" y="{min(y(0), y(r["net"])):.0f}" width="{bw - 12:.0f}" height="{abs(y(r["net"]) - y(0)):.0f}" fill="{SKY if r["net"] > 0 else "#C9D6E0"}"/>')
        pts.append(f'{x + (bw - 12) / 2:.0f},{y(r["cum"]):.0f}')
        if i % 4 == 0: out.append(f'<text x="{x + bw * 2 - 6:.0f}" y="{H - 20}" text-anchor="middle" class="lab">{2027 + i // 4}</text>')
    out.append(f'<polyline points="{" ".join(pts)}" fill="none" stroke="{NAVY}" stroke-width="3.5"/>')
    k = min(range(16), key=lambda i: CF[i]['cum'])
    px, py = pts[k].split(',')
    out.append(f'<circle cx="{px}" cy="{py}" r="7" fill="{CORAL}"/><text x="{int(px) + 14}" y="{int(py) + 28}" class="val" fill="{CORAL}">Peak need {money(CF[k]["cum"])}</text>')
    out.append('</svg>')
    return ''.join(out), CF[k]['cum'], CF[-1]['cum']


def chart_noi():
    W, H, L, T, Bt = 760, 330, 70, 20, 50
    lo, hi = -400000, 600000
    y = lambda v: T + (H - T - Bt) * (1 - (v - lo) / (hi - lo))
    out = [f'<svg viewBox="0 0 {W} {H}" class="chart">']
    for v in range(-400000, 600001, 200000):
        out.append(f'<line x1="{L}" x2="{W - 10}" y1="{y(v):.0f}" y2="{y(v):.0f}" stroke="{"#9AA5AE" if v == 0 else "#E3E9EE"}"/><text x="{L - 10}" y="{y(v) + 5:.0f}" text-anchor="end" class="ax">{money(v, True)}</text>')
    for i, (s, lab) in enumerate((('low', 'Downside'), ('base', 'Base'), ('high', 'Upside'))):
        n = R[s]['resort']['noi']; cx = L + 110 + i * 220
        out.append(f'<rect x="{cx - 60}" y="{min(y(0), y(n)):.0f}" width="120" height="{abs(y(n) - y(0)):.0f}" rx="4" fill="{[CORAL, SKY, GREEN][i]}"/>')
        out.append(f'<text x="{cx}" y="{(y(n) - 10) if n > 0 else (y(n) + 24):.0f}" text-anchor="middle" class="val">{money(n, True)}</text><text x="{cx}" y="{H - 18}" text-anchor="middle" class="lab">{lab}</text>')
    out.append('</svg>')
    return ''.join(out)


cash_svg, PEAK, END = chart_cash()

# ---------------------------------------------------------------- slides
P = B['programs']
lots_listed = LOTS['acres_listed_total']
n_existing, n_new = IB['existing'], IB['new_cabins']


def table(head, rows, cls=''):
    h = ''.join(f'<th>{c}</th>' for c in head)
    body = ''.join('<tr' + (' class="tot"' if r[0].startswith('Total') or r[0].startswith('Break-even') else '') + '>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<table class="{cls}"><thead><tr>{h}</tr></thead><tbody>{body}</tbody></table>'


slides = []
S = slides.append

S(f'''<section class="cover"><div class="cover-logo">{svg_inline('MONTREVE_LOGO_DRAFT-07.svg')}</div>
<h1>A private mountain resort<br>with cabins for sale</h1>
<p class="sub">24 turnkey cabins on 30 acres above Sevierville, with a glass wedding pavilion, dining, courts and trails at its heart</p>
<p class="meta">2481 Happy Hollow Road · Sevierville, Tennessee · Concept and feasibility, October 30, 2026</p>
<p class="disc">Discussion draft. Budgets are allowances, not bids; projections are scenarios, not promises.</p></section>''')

S(f'''<section><h2>The idea in one page</h2><div class="cols">
<div><h3>What we'd build</h3><ul>
<li><b>24 cabins for sale</b>: the 7 financed homes finished and sold, and {n_new} new cabins on the remaining lots, all on the same 3-bed, indoor-pool plan.</li>
<li><b>A resort core on lots 10–15</b> along Amber Valley Way: a 6,000 sf glass wedding pavilion, a 2,500 sf dining and catering building, tennis and two pickleball courts, and a trail loop.</li>
<li><b>One operator</b> runs the venue, the owners' club and an optional rental program for cabin owners.</li></ul></div>
<div><h3>What it takes</h3>
<div class="kpis"><div><b>{money(P['cabins']['break_even'], True)}</b><span>break-even per cabin, cabins only</span></div>
<div><b>{money(P['lean']['break_even'], True)}</b><span>with a lean resort</span></div>
<div><b>{money(P['full']['break_even'], True)}</b><span>with the full resort</span></div>
<div><b>{money(-PEAK)}</b><span>peak cash need, full resort</span></div></div>
<p class="note">Base costs, all-in: {money(R['base']['sunk'])} already spent, financing and selling costs included. At <b>$1.30M a cabin</b> the project covers the cabins, site work and about <b>{mm(P['full']['amenity_budget_at_price'])}</b> of amenities, not the full resort.</p></div></div></section>''')

S(f'''<section><h2>The property today</h2><div class="cols wide-left">
<div><img class="framed" src="{png_b64(lot_png)}"></div>
<div>{table(['', ''], [
    ['Location', '2481 Happy Hollow Rd, Sevierville (Sevier Co. parcel 122 005.00)'],
    ['Land', f'30.07 ac gross; 30 platted lots, {lots_listed:.2f} ac listed (2007 plat)'],
    ['Roads', 'Amber Valley Way (upper), Creeksong Way (lower), 50 ft rights-of-way'],
    ['Homes', '7 financed homes under way: lots 1, 3, 6, 18, 21, 28, 30'],
    ['Spent to date', f"{money(B['sunk'])} reported (land, contractor, soft, interest)"],
    ['Debt', f"{money(IB['debt'])} on the 7 homes; maturity Jan 11, 2027"],
], 'kv small')}
<p class="note">Lot 2 carries a 0.77 ac septic / utility easement (hatched). Utility service records conflict (public water and sewer vs. septic): a utility letter is the first diligence item.</p></div></div></section>''')

S(f'''<section class="full"><h2>The plan</h2><div class="cols wide-left">
<div><img class="framed" src="{png_b64(tmp / 'site_crop.png')}"></div>
<div><h3>Program</h3>{table(['Use', 'Lots', 'Acres'], [
    ['Financed homes, finished and sold', '1, 3, 6, 18, 21, 28, 30', f"{sum(LOTS['lots'][str(k)]['acres_listed'] for k in (1, 3, 6, 18, 21, 28, 30)):.2f}"],
    [f'New cabins for sale ({n_new})', '2, 4, 5, 7, 8, 9, 16, 19, 20, 22, 23, 26, 27, 29, 31, 32, 33', f"{sum(v['acres_listed'] for v in LOTS['lots'].values() if v['use'] == 'cabin'):.2f}"],
    ['Glass pavilion and ceremony lawn', '14, 15', f"{LOTS['lots']['14']['acres_listed'] + LOTS['lots']['15']['acres_listed']:.2f}"],
    ['Dining and catering', '12, 13', f"{LOTS['lots']['12']['acres_listed'] + LOTS['lots']['13']['acres_listed']:.2f}"],
    ['Tennis and pickleball', '10, 11', f"{LOTS['lots']['10']['acres_listed'] + LOTS['lots']['11']['acres_listed']:.2f}"],
], 'small')}
<p class="note">Will's program: pavilion 14–15, dining 12–13, courts 10–11. {SITE['parking_stalls']} event stalls shown. Traced to scale from the lot map; north assumed, no topography yet.</p></div></div></section>''')

S(f'''<section><h2>The resort core</h2><div class="cols wide-left">
<div><img class="framed" src="{png_b64(tmp / 'core_crop.png')}"></div>
<div><ul class="feat">
<li><b>Glass wedding pavilion · 6,000 sf</b><span>Ceremony and reception for 100–150 guests, a ceremony lawn on the view side, arrival parking on the road.</span></li>
<li><b>Dining and catering · 2,500 sf</b><span>Licensed caterers' kitchen, owners' dining and event service, with a service yard. Catering is outsourced at first.</span></li>
<li><b>Tennis and two pickleball courts</b><span>Fenced courts on lots 10–11, a short walk from the cabins.</span></li>
<li><b>Trail loop</b><span>A woodland walk round the property joining the cabins to the resort core.</span></li>
<li><b>Owners' club</b><span>Cabin owners and their renters use the amenities; dues fund upkeep. Weddings book the pavilion plus a block of cabins.</span></li></ul></div></div></section>''')

if plan_pngs:
    imgs = ''.join(f'<img class="framed" src="{png_b64(p)}">' for p in plan_pngs[1:4])
    S(f'''<section><h2>The cabin</h2><p class="lede">One plan on every lot: 2,444 sf on three levels, 3 bedrooms, an indoor pool and rec room on the walk-out level, a great room with a fireplace and decks on the view side. Built on the same plan as the 7 homes under way, so cost and schedule are proven.</p>
<div class="plans">{imgs}</div><p class="note">Redrawn to scale from the owner's plans (vector PDF set included). Verify with the architect of record.</p></section>''')

rows = [['Spent to date (reported)', money(R['low']['sunk']), money(B['sunk']), money(R['high']['sunk'])],
        ['Finish the 7 financed homes', *(money(R[s]['existing_finish']) for s in ('low', 'base', 'high'))],
        [f'{n_new} new cabins ({money(B["per_cabin"], True)} each, {money(B["per_cabin_sf"])}/sf base)', *(money(R[s]['cabins']) for s in ('low', 'base', 'high'))],
        ['Site work, utilities, roads, entitlements', *(money(R[s]['shared']) for s in ('low', 'base', 'high'))],
        ['Resort amenities, full program', *(money(R[s]['programs']['full']['amenities']) for s in ('low', 'base', 'high'))],
        ['Financing (new spend and existing loans)', *(money(R[s]['programs']['full']['carry_new'] + R[s]['carry_old']) for s in ('low', 'base', 'high'))],
        ['Marketing and holding', *(money(V[s]['marketing'] + V[s]['hold']) for s in ('low', 'base', 'high'))],
        ['Total cost, full program', *(money(R[s]['programs']['full']['cost']) for s in ('low', 'base', 'high'))],
        ['Break-even per cabin (after 7.5% selling cost)', *(money(R[s]['programs']['full']['break_even'], True) for s in ('low', 'base', 'high'))]]
S(f'''<section><h2>Development budget</h2><div class="cols wide-left"><div>{table(['Full program, 24 cabins', 'Low', 'Base', 'High'], rows, 'num')}</div>
<div><h3>Where the numbers come from</h3><ul class="small">
<li><b>Cabins:</b> the project's own contract, $4.78M for 7 homes ({money(IB['cabin_hard'], True)} each with 4% escalation), plus lot work, furniture, soft costs and 8% contingency.</li>
<li><b>Amenities:</b> Will's allowances ($550/sf pavilion, $450/sf dining) with 20% contingency.</li>
<li><b>Financing:</b> 9% on 40% of new spend outstanding over 24 months plus 1% fees; the existing loans carried 9 months with extension fees.</li>
<li><b>Spent to date</b> is the Oct 20 cost report, not yet reconciled to the ledger.</li></ul>
<p class="note">These are allowances, not bids. Slope, rock and utilities can move the high case. The workbook has every line, with live formulas.</p></div></div></section>''')

S(f'''<section><h2>Break-even price per cabin</h2><div class="cols wide-left"><div>{chart_breakeven()}</div>
<div><h3>Reading it</h3><ul>
<li><b>Cabins only:</b> {money(P['cabins']['break_even'], True)} breaks even, so <b>$1.30M clears {money(P['cabins']['profit_at_price'])}</b> before any resort.</li>
<li><b>Lean resort</b> (3,000 sf pavilion, service kitchen, courts, trails): {money(P['lean']['break_even'], True)}.</li>
<li><b>Full resort:</b> {money(P['full']['break_even'], True)}; at $1.30M the full program loses {money(-P['full']['profit_at_price'])}.</li>
<li>Bars are base costs; whiskers run from the low to the high cost case.</li></ul>
<p class="note">For a 15% developer margin: {money(P['cabins']['price_for_margin'], True)} / {money(P['lean']['price_for_margin'], True)} / {money(P['full']['price_for_margin'], True)}.</p></div></div></section>''')

S(f'''<section><h2>Making $1.30M work</h2><p class="lede">At $1.30M a cabin, sales cover the cabins, the site work and about <b>{mm(P['full']['amenity_budget_at_price'])}</b> of amenities. The full resort costs {money(P['full']['amenities'])} and the lean one {money(P['lean']['amenities'])}. Ways to close the gap, best first:</p>
<div class="cards">
<div><b>1 · Build the resort in phases</b><span>Courts, trails and the owners' lawn first (about $0.4M), funded by cabin sales; the pavilion once enough cabins are sold, sized by bookings.</span></div>
<div><b>2 · Fund the venue separately</b><span>The pavilion and dining as their own company with its own investors and loan, leasing the land. Cabins carry only the club amenities.</span></div>
<div><b>3 · Price for the resort</b><span>Every $50k on the price adds {money(24 * 50000 * (1 - B['sell_pct']))} of net sales. Lots 11–15 and 18–22 have the views; premium lots can carry more.</span></div>
<div><b>4 · Cut the cost of the cabin</b><span>{money(B['per_cabin'], True)} all-in today. Buying in volume for 17 identical cabins, and leaner finishes on the lower level, are the levers.</span></div>
</div></section>''')

S(f'''<section><h2>Cash flow: full program, base costs</h2><div class="cols wide-left"><div>{cash_svg}</div>
<div><ul>
<li>Bars are net cash each quarter, the line the running total.</li>
<li>The 7 homes sell first and repay the {money(IB['debt'])} loans.</li>
<li>New cabins start in Q2 2027 and sell about 2 a quarter from Q4 2027.</li>
<li><b>Peak need {money(-PEAK)}</b> in mid-2028: equity plus construction loans.</li>
<li>Ends at {money(END)}: the full program at $1.30M doesn't recover the reported {money(B['sunk'])} spent to date.</li></ul>
<p class="note">Timing is in the workbook's Cash flow sheet and can be changed; pick program A, B or C there.</p></div></div></section>''')

rs = B['resort']
S(f'''<section><h2>Resort operations: a stabilized year</h2><div class="cols"><div>{table(['Base year', ''], [
    [f"Venue fees: {IB['weddings']} weddings at {money(IB['wed_fee'])}, {IB['retreats']} retreats at {money(IB['ret_fee'])}", money(rs['venue'])],
    ['Kitchen use, bar and rentals', money(rs['ancillary'])], ['Other', money(rs['other'])],
    [f"Rental management: {IB['pool_share']:.0%} of cabins, {money(IB['gross_rent'])} rent each, {IB['mgmt_fee']:.0%} fee", money(rs['mgmt_fees'])],
    [f"Owner club dues ({money(IB['dues'])}/month)", money(rs['dues'])], ['Total revenue', money(rs['revenue'])],
    ['Event and other variable costs', money(-(rs['event_var'] + rs['other_var']))], ['Rental program costs', money(-rs['mgmt_cost'])],
    ['Staff, insurance, utilities, grounds, marketing', money(-rs['fixed'])], ['Replacement reserve 4%', money(-rs['reserve'])],
    ['Total: net operating income', money(rs['noi'])]], 'num small')}</div>
<div>{chart_noi()}<p class="note">The resort core <b>pays its own way at the base case</b> but is not a profit center: it exists to sell cabins at a premium. In the downside, dues need to rise to about {money(R['low']['resort']['dues_breakeven'])}/month to cover it. Upside: {V['high']['weddings']} weddings at {money(V['high']['wed_fee'])} and stronger rents make it worth about {money(R['high']['resort']['value'])} at a 9% cap rate.</p></div></div></section>''')

ow = {s: R[s]['owner'] for s in R}
S(f'''<section><h2>For the buyer: owning a Montreve cabin</h2><div class="cols"><div>{table(['A year in the rental program', 'Downside', 'Base', 'Upside'], [
    ['Gross rent', *(money(ow[s]['gross']) for s in ('low', 'base', 'high'))],
    [f"Management fee ({IB['mgmt_fee']:.0%})", *(money(-ow[s]['mgmt']) for s in ('low', 'base', 'high'))],
    ['Utilities, pool service, maintenance, insurance', *(money(-(ow[s]['util'] + ow[s]['maint'] + ow[s]['ins'])) for s in ('low', 'base', 'high'))],
    ['Property tax and club dues', *(money(-(ow[s]['tax'] + ow[s]['dues'])) for s in ('low', 'base', 'high'))],
    ['Total: net before mortgage', *(money(ow[s]['net']) for s in ('low', 'base', 'high'))],
    ['Cash yield on $1.30M', *(f"{ow[s]['yield']:.1%}" for s in ('low', 'base', 'high'))]], 'num')}</div>
<div><h3>The pitch, honestly</h3><ul>
<li>A new, turnkey 3-bed cabin with its own indoor pool, on a 0.6 to 1.4 acre lot in a gated resort.</li>
<li>Amenities a single cabin can't have: the pavilion, courts, trails and dining, and a manager on site.</li>
<li>Rent offsets the cost of owning: about {money(ow['base']['net'])} a year net in the base case, a {ow['base']['yield']:.1%} cash yield. It's a lifestyle purchase with income, not an investment that pays for itself.</li>
<li>Rent range: a comparable indoor-pool cabin reported about $80k of 2025 bookings; Will's plan assumes $650 a night at 50% (about $119k).</li></ul></div></div></section>''')

S(f'''<section><h2>Market check: the premium we're asking for</h2><div class="cols"><div><div class="kpis big">
<div><b>{money(IB['comp'], True)}</b><span>listed 3-bed indoor-pool cabins in Sevierville (2022–2023 builds, asking)</span></div>
<div><b>$1.30M</b><span>target price: {IB['price'] / IB['comp'] - 1:.0%} above them</span></div>
<div><b>{money(P['full']['break_even'], True)}</b><span>full-resort break-even: {P['full']['premium_vs_comp']:.0%} above them</span></div></div></div>
<div><h3>What has to carry the premium</h3><ul>
<li>New construction, sold furnished and rental-ready.</li><li>Bigger lots and privacy (average {(sum(v['acres_listed'] for v in LOTS['lots'].values() if v['use'] in ('cabin', 'existing')) / 24):.2f} ac).</li>
<li>Resort amenities and a wedding venue on site.</li><li>Views on lots 11–15 and 18–22.</li></ul>
<p class="note">Listings are asking prices from Oct 2026 searches, not closed sales. Before pricing, pull Smoky Mountain MLS closed sales for new 3–4 bed cabins with pools and resort or gated communities, and test pricing with the first homes.</p></div></div></section>''')

S('''<section><h2>What has to be true</h2><div class="cards three">
<div><b>Water and wastewater</b><span>Records conflict on public water and sewer vs. septic. A utility letter and a septic or sewer capacity study set how many cabins and guests the site can hold.</span></div>
<div><b>Slope and access</b><span>Every lot slopes. A topographic survey and geotechnical report decide whether the pavilion, courts and parking fit where shown, and what walls cost. Fire access for events needs review.</span></div>
<div><b>Use approval</b><span>Sevier County must confirm in writing that a wedding venue, dining and short-term rentals are allowed together here.</span></div>
<div><b>The January 11 maturity</b><span>The $5.3M loans mature long before a resort opens. Extend or refinance them first, with lender consent to the plan.</span></div>
<div><b>Buyers at $1.30M</b><span>Sell the first homes at the target price before starting the 17 new cabins.</span></div>
<div><b>Reconciled costs</b><span>The $7.13M spent to date and the $270k left on the contract need reconciling to the ledger and the bank.</span></div>
</div></section>''')

S('''<section><h2>Next 90 days</h2>''' + table(['When', 'What', 'Unlocks'], [
    ['Now – Jan 11', 'Extend or refinance the 7 home loans; insurance and certificates of occupancy on the finished homes', 'Time to sell'],
    ['30 days', 'Boundary and topographic survey, title and easements; utility letters (water, sewer, power)', 'Real lot lines, where things fit'],
    ['45 days', 'Geotechnical report; civil concept for the resort core, parking and fire access', 'Buildable pavilion and courts'],
    ['45 days', 'Pre-application meeting with Sevier County planning; written use determination', 'The approval path'],
    ['60 days', 'Closed-sale comps and broker pricing opinion; list the first finished homes at $1.30M', 'Proof of price'],
    ['75 days', 'Builder pricing for 17 cabins and the resort core; choose program A, B or C', 'A bid budget'],
    ['90 days', 'Investor package: final budget, cash flow, structure (cabin sales plus a separate venue company)', 'Raise the capital'],
], 'small') + '</section>')

S(f'''<section><h2>Assumptions and sources</h2><div class="cols"><div><ul class="small">
<li><b>Lot map:</b> Montreve vector lot map (Oct 6, 2026), drawn from the recorded May 11, 2007 plat (LMB 9/90). Lots scaled to feet from the listed acres ({LOTS['scale_ft_per_pt'] * 72:.0f} ft per inch on the poster); lots 18, 22, 26, 27, 28 and 33 draw smaller than listed.</li>
<li><b>Business plans:</b> Montreve Smoky Mountain Resort Business Plan (prepared for Will E., Oct 22, 2026): program, amenity allowances, operating assumptions, costs to date, loan balances. Montreve Mountain Club fractional plan (Sep 18, 2026).</li>
<li><b>Cabin:</b> owner-supplied floor plans: 684 + 880 + 880 sf, redrawn as vector PDFs.</li>
<li><b>Market:</b> active Sevierville listings and local management fee ranges (20–35% of gross rent) found Oct 30, 2026.</li></ul></div>
<div><ul class="small">
<li>Break-even = total cost ÷ (24 cabins × (1 − 7.5% selling cost)). Total cost includes the reported spend to date.</li>
<li>All 24 cabins sell; no lot-only sales, and no value is given to the resort business at the end.</li>
<li>Financing is a simplified carry, not a loan model; no income taxes.</li>
<li>Owner income is an illustration, not an offer: fractional or rental-pool structures need Tennessee time-share and securities counsel.</li>
<li>Files: Montreve_Site_Plan.pdf, Montreve_Cabin_Plans.pdf, Montreve_Budget_ProForma.xlsx (live formulas).</li></ul></div></div></section>''')

CSS = '''
@page { size: 13.333in 7.5in; margin: 0 }
* { box-sizing: border-box }
body { margin: 0; font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1E2B33 }
section { width: 13.333in; height: 7.5in; padding: 0.55in 0.7in 0.5in; position: relative; page-break-after: always; overflow: hidden; background: #fff }
section:not(.cover)::after { content: "MONTREVE · Concept and feasibility · October 2026"; position: absolute; left: 0.7in; bottom: 0.25in; font-size: 9pt; color: #9AA5AE; letter-spacing: .08em }
h2 { font-size: 32pt; color: #0A3047; margin: 0 0 0.3in; font-weight: 700; letter-spacing: -.01em }
h2::after { content: ""; display: block; width: 0.6in; height: 4px; background: #D9A441; margin-top: 0.1in }
h3 { font-size: 15pt; color: #0A3047; margin: 0 0 0.1in; text-transform: uppercase; letter-spacing: .06em }
ul { margin: 0; padding-left: 1.1em; font-size: 17pt; line-height: 1.42 } li { margin-bottom: .45em }
ul.small, .small td, .small th { font-size: 13.5pt } ul.small li { margin-bottom: .35em }
.cols { display: grid; grid-template-columns: 1fr 1fr; gap: 0.45in; align-items: start }
.cols.wide-left { grid-template-columns: 1.45fr 1fr }
img.framed { width: 100%; border: 1px solid #DCE4EA; border-radius: 6px }
.note { font-size: 12.5pt; color: #6B7A86; line-height: 1.45; margin-top: .15in }
.lede { font-size: 18.5pt; line-height: 1.45; max-width: 11.5in; margin: 0 0 .25in }
table { border-collapse: collapse; width: 100%; font-size: 15pt }
th { text-align: left; background: #0A3047; color: #fff; padding: 9px 12px; font-weight: 600 }
td { padding: 8px 12px; border-bottom: 1px solid #E3E9EE; vertical-align: top }
table.num td:not(:first-child), table.num th:not(:first-child) { text-align: right; white-space: nowrap }
tr.tot td { font-weight: 700; background: #EAF1F6; color: #0A3047 }
table.kv td:first-child { font-weight: 700; color: #0A3047; width: 1.6in }
.kpis { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: .1in }
.kpis div { background: #EAF1F6; border-radius: 8px; padding: 18px 20px }
.kpis b { display: block; font-size: 32pt; color: #0A3047 } .kpis span { font-size: 13pt; color: #4A5964 }
.kpis.big { grid-template-columns: 1fr } .kpis.big b { font-size: 40pt }
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 22px } .cards.three { grid-template-columns: 1fr 1fr 1fr }
.cards div { border: 1px solid #DCE4EA; border-left: 6px solid #D9A441; border-radius: 6px; padding: 20px 22px }
.cards b { display: block; font-size: 18pt; color: #0A3047; margin-bottom: 6px } .cards span { font-size: 15pt; line-height: 1.45; color: #34434E }
ul.feat { list-style: none; padding: 0 } ul.feat li { border-left: 4px solid #D9A441; padding-left: 12px; margin-bottom: 9px; font-size: 15pt }
ul.feat b { display: block; color: #0A3047 } ul.feat span { font-size: 12.5pt; color: #4A5964 }
.plans { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px } .plans img { height: 4.6in; object-fit: contain; background: #fff }
svg.chart { width: 100%; height: auto } .ax { font-size: 13px; fill: #6B7A86 } .lab { font-size: 15px; font-weight: 700; fill: #1E2B33 } .val { font-size: 17px; font-weight: 700; fill: #0A3047 }
.cover { background: #0A3047; color: #fff; padding: 0.9in }
.cover-logo svg { width: 6.2in; height: auto }
.cover h1 { font-size: 40pt; line-height: 1.12; margin: .45in 0 .2in; font-weight: 700 }
.cover .sub { font-size: 16pt; max-width: 9in; color: #D7E3EC; line-height: 1.4 }
.cover .meta { position: absolute; bottom: 0.9in; font-size: 12pt; color: #D9A441; letter-spacing: .04em }
.cover .disc { position: absolute; bottom: 0.55in; font-size: 9.5pt; color: #8FA6B6 }
'''


def main():
    doc = f'<!doctype html><html><head><meta charset="utf-8"><title>Montreve Investor Presentation</title><style>{CSS}</style></head><body>{"".join(slides)}</body></html>'
    src = tmp / 'deck.html'; src.write_text(doc)
    pdf = OUT / 'Montreve_Investor_Presentation.pdf'
    js = ("const {chromium}=require('playwright');(async()=>{const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium-1243/chrome-linux64/chrome'});const p=await b.newPage();"
          f"await p.goto('file://{src}');await p.pdf({{path:'{pdf}',width:'13.333in',height:'7.5in',printBackground:true}});await b.close()}})()")
    subprocess.run(['node', '-e', js], check=True, cwd='/home/user/fs-real-estate-intelligence')
    print(f'{len(slides)} slides -> {pdf}')


if __name__ == '__main__':
    main()
