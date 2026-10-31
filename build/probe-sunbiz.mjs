// Diagnostic: Florida Division of Corporations' public SFTP server (dos.fl.gov "Data Downloads"): what the folders hold,
// and the first records of a daily corporate file cut by the layout build/entities.mjs uses, to check the offsets.
// Read-only. Run "Probe services" with script=sunbiz.
import { execFileSync } from 'node:child_process';
import { sunbizCut } from '../lib/entities.mjs';

const auth = (process.env.SUNBIZ_USER || 'Public') + ':' + (process.env.SUNBIZ_PASS || 'PubAccess1845!');
const curl = (url, extra = []) => execFileSync('curl', ['-sS', '-k', '--max-time', '300', '--user', auth, ...extra, url], { maxBuffer: 64 * 1048576 }).toString('latin1');
for (const dir of ['/', '/Public/', '/Public/doc/', '/Public/doc/cor/', '/Public/doc/quarterly/', '/Public/doc/quarterly/cor/'])
  try { console.log('## list', dir, '\n' + curl('sftp://sftp.floridados.gov' + dir).split('\n').slice(-25).join('\n')); } catch (e) { console.log('## list', dir, 'ERROR', e.message.slice(0, 300)); }
let daily = null;
try { daily = curl('sftp://sftp.floridados.gov/Public/doc/cor/').split('\n').map(l => l.trim().split(/\s+/).pop()).filter(f => /^\d{8}c\.txt$/i.test(f)).sort().pop(); } catch (e) { /* listed above */ }
if (daily) {
  const text = curl('sftp://sftp.floridados.gov/Public/doc/cor/' + daily, ['-r', '0-20000']);
  const lines = text.split(/\r?\n/).filter(Boolean);
  console.log('## daily', daily, 'record length', lines.map(l => l.length).slice(0, 5));
  for (const l of lines.slice(0, 4)) { console.log('## raw', JSON.stringify(l.slice(0, 700))); console.log('## cut', JSON.stringify(sunbizCut(l))); }
}
console.log('done');
