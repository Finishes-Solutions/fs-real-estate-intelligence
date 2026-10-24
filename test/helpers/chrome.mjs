// The local Chromium the tests print PDFs with: CHROME_PATH when set, otherwise the first browser found in the usual
// places (the Playwright build on Linux CI, Google Chrome or Chromium on a Mac, the distro packages on Linux). Sets
// CHROME_PATH so lib/pdf.mjs uses it; leaves it unset when there is none (the tests then use their stand-in).
import fs from 'node:fs';
const CANDIDATES = ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'];
export function localChrome() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const found = CANDIDATES.find(p => fs.existsSync(p)); if (found) process.env.CHROME_PATH = found;
  return found || '';
}
