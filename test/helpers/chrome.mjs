// The local Chromium the tests print PDFs with (lib/pdf.mjs localBrowser): sets CHROME_PATH so lib/pdf.mjs uses it, and
// leaves it unset when there is none (the tests then use their stand-in).
import { localBrowser } from '../../lib/pdf.mjs';
export function localChrome() { const p = localBrowser(); if (p) process.env.CHROME_PATH = p; return p; }
