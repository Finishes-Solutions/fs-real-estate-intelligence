// runs every test in package.json's test script, 6 at a time; logs to argv[2]; prints FAIL lines
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const files = JSON.parse(fs.readFileSync('package.json')).scripts.test.split('&&').map(s => s.trim().replace(/^node /, ''));
const env = { ...process.env, CHROME_PATH: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' }; let i = 0, fails = [];
const run = () => new Promise(res => { const f = files[i++]; if (!f) return res(false); const n = f.replace(/^.*\//, '').replace(/\.(mjs|sh)$/, ''), log = fs.createWriteStream(out + '/' + n + '.log'), p = f.endsWith('.mjs') ? spawn('node', [f], { env }) : spawn('sh', ['-c', f], { env });
  p.stdout.pipe(log); p.stderr.pipe(log); p.on('close', c => { if (c) fails.push(n); res(true); }); });
await Promise.all(Array.from({ length: 6 }, async () => { while (await run()); }));
console.log(files.length + ' files; failed: ' + (fails.join(', ') || 'none'));
