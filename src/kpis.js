// Headline metrics under the title: 3 to 6 tiles the user picks from METRICS (saved in this browser).
import { METRICS, BY_KEY, DEFAULT_KPIS } from './metrics.js';

const MIN = 3, MAX = 6;
export function initKpis(ctx) {
  const box = document.getElementById('kpis'), btn = document.getElementById('kpiEdit'), pop = document.getElementById('kpiPop');
  let keys = DEFAULT_KPIS.slice();
  try { const s = JSON.parse(localStorage.getItem('fs-kpis') || 'null'); if (Array.isArray(s)) { const v = s.filter(k => BY_KEY.has(k)).slice(0, MAX); if (v.length >= MIN) keys = v; } } catch (e) {}
  const save = () => { try { localStorage.setItem('fs-kpis', JSON.stringify(keys)); } catch (e) {} };

  function render() {
    const list = ctx.visible;
    box.style.setProperty('--cols', keys.length === 4 ? 2 : Math.min(3, keys.length));
    box.innerHTML = keys.map(k => { const m = BY_KEY.get(k), v = m.fmt(m.fn(list));
      return '<div class="kpi' + (m.text ? ' txt' : '') + '"><b title="' + ctx.esc(v) + '">' + ctx.esc(v) + '</b><span title="' + ctx.esc(m.label) + '">' + ctx.esc(m.short || m.label) + '</span></div>'; }).join('');
  }
  function renderPop() {
    pop.innerHTML = '<div class="kp-h"><b>Headline metrics</b><span>' + keys.length + ' of ' + MAX + ' · pick ' + MIN + '–' + MAX + '</span></div><div class="kp-list">' +
      METRICS.map(m => { const on = keys.includes(m.k), dis = on ? keys.length <= MIN : keys.length >= MAX;
        return '<label class="kp-it' + (dis ? ' dis' : '') + '"><input type="checkbox" data-k="' + m.k + '"' + (on ? ' checked' : '') + (dis ? ' disabled' : '') + '><span>' + ctx.esc(m.label) + '</span>' + (on ? '<i>' + (keys.indexOf(m.k) + 1) + '</i>' : '') + '</label>'; }).join('') +
      '</div><div class="kp-f"><button class="lnk" id="kpiReset" type="button">Reset to Default</button><button class="btn primary" id="kpiDone" type="button">Done</button></div>';
    pop.querySelectorAll('input').forEach(i => i.onchange = () => {
      const k = i.dataset.k; keys = i.checked ? [...keys, k].slice(0, MAX) : keys.length > MIN ? keys.filter(x => x !== k) : keys;
      save(); render(); renderPop();
    });
    pop.querySelector('#kpiReset').onclick = () => { keys = DEFAULT_KPIS.slice(); save(); render(); renderPop(); };
    pop.querySelector('#kpiDone').onclick = () => toggle(false);
  }
  function toggle(on) { pop.classList.toggle('on', on); btn.setAttribute('aria-expanded', on); if (on) renderPop(); }
  btn.onclick = e => { e.stopPropagation(); toggle(!pop.classList.contains('on')); };
  document.addEventListener('pointerdown', e => { if (pop.classList.contains('on') && !pop.contains(e.target) && !btn.contains(e.target)) toggle(false); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && pop.classList.contains('on')) toggle(false); });
  ctx.onChange(render); render();
  ctx.kpiKeys = () => keys.slice();
}
