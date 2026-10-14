// Diagnostic: school districts and campuses with enrollment (TEA), for our counties. Run "Probe services" with
// script=tea. Read-only.
import { time, arcLayer, agol, links } from './probe-kit.mjs';
for (const q of ['TEA Schools', 'Texas schools 2025 2026', 'School Districts TEA', 'Texas public schools enrollment', 'Current Schools TEA'])
  await time('agol ' + q, () => agol(q), 5000);
for (const u of ['https://services2.arcgis.com/5MVN2jsqIrNZD4tP/arcgis/rest/services'])
  await time('tea org ' + u, () => arcLayer(u), 5000);
for (const u of ['https://tea.texas.gov/reports-and-data/student-data/standard-reports/enrollment-reports', 'https://tea.texas.gov/reports-and-data/school-performance/accountability-research/tapr', 'https://rptsvr1.tea.texas.gov/adhocrpt/adste.html', 'https://schoolsdata2-tea-texas.opendata.arcgis.com/'])
  await time('tea page ' + u, () => links(u, /download|enroll|csv|xls|data|campus|district/i, 60), 5000);
console.log('done');
