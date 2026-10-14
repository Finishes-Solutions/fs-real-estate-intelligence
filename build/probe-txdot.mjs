// Diagnostic: TxDOT planned and active road projects for our counties (Project Tracker, UTP). Run "Probe services"
// with script=txdot. Read-only.
import { time, arcLayer, agol } from './probe-kit.mjs';
const ORG = 'https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services';
await time('txdot services', async () => { const r = await arcLayer(ORG); return r.services?.filter(s => /proj|utp|letting|construct|plan|stip|tip|work/i.test(s)); }, 8000);
for (const name of ['TxDOT_Projects', 'TxDOT_Project_Tracker', 'Project_Tracker', 'TxDOT_UTP_Projects', 'UTP_Projects', 'TxDOT_Projects_Lines', 'TxDOT_Projects_Points'])
  await time('txdot layer ' + name, () => arcLayer(`${ORG}/${name}/FeatureServer/0`, { sample: 2 }), 5000);
for (const q of ['TxDOT projects', 'TxDOT Project Tracker', 'Unified Transportation Program', 'TxDOT letting', 'H-GAC transportation improvement program', 'Houston District projects'])
  await time('agol ' + q, () => agol(q), 5000);
console.log('done');
