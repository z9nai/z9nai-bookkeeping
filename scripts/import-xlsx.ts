// Converts the "Family Budget" sheet (exported as .xlsx) into the app's data
// files — the same code the Import view uses in the browser.
//   node scripts/import-xlsx.ts "Family Budget.xlsx" <data directory> [--dry-run]
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { readXlsx } from '../src/xlsxRead.ts';
import { analyzeWorkbook, buildImport, defaultMapping } from '../src/sheetImport.ts';
import { yearStats } from '../src/budget.ts';
import type { Category } from '../src/types.ts';

const args = process.argv.slice(2);
const dry = args.includes('--dry-run');
const [file, outDir] = args.filter(a => !a.startsWith('--'));
if (!file) { console.error('Aufruf: node scripts/import-xlsx.ts <datei.xlsx> [<datenverzeichnis>] [--dry-run]'); process.exit(1); }

const buf = readFileSync(file);
const sheets = await readXlsx(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer);
const analysis = analyzeWorkbook(sheets);
const mapping = defaultMapping(analysis.headers);

console.log(`Tabs: ${sheets.map(s => s.name).join(', ')}`);
console.log(`Jahre erkannt: ${analysis.years.map(y => y.year).reverse().join(', ')}`);
for (const w of analysis.warnings) console.log(`! ${w}`);
console.log('\nZuordnung der Spaltennamen:');
for (const h of analysis.headers) {
  const t = mapping[h.name];
  console.log(`  ${h.kind === 'income' ? '[E]' : '[A]'} ${h.name}${t !== h.name ? `  →  ${t}` : ''}   (${h.years.length} Jahre)`);
}

const existing: Category[] = outDir && existsSync(join(outDir, 'categories.json'))
  ? JSON.parse(readFileSync(join(outDir, 'categories.json'), 'utf8')) : [];
const result = buildImport(analysis, mapping, existing, analysis.years.map(y => y.year));

console.log('\nJahr   Buchungen   Ausgaben (Sheet)        Einnahmen (Sheet)       Check');
for (const y of [...result.years].sort((a, b) => a.year - b.year)) {
  const src = analysis.years.find(x => x.year === y.year)!;
  const st = yearStats(y, result.categories, new Date(2100, 0, 1));
  const ok = (a: number, b: number | null) => b == null ? '?' : Math.abs(a - b) < 0.02 ? 'ok' : `DIFF ${Math.round(a - b)}`;
  const f = (n: number) => Math.round(n).toString().padStart(8);
  const g = (n: number | null) => (n == null ? '–' : Math.round(n).toString()).padStart(8);
  console.log(`${y.year}   ${String(y.bookings.length).padStart(6)}     ${f(st.expense.total)} (${g(src.cachedTotals.expense)})   ${f(st.income.total)} (${g(src.cachedTotals.income)})   ${ok(st.expense.total, src.cachedTotals.expense)} / ${ok(st.income.total, src.cachedTotals.income)}`);
  for (const w of src.warnings) console.log(`       ! ${w}`);
}
console.log(`\nKategorien: ${result.categories.length} (${result.newCategories.length} neu), Buchungen: ${result.bookings}`);

if (dry || !outDir) { console.log('\nTestlauf — nichts geschrieben.'); process.exit(0); }
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'categories.json'), JSON.stringify(result.categories, null, 2));
for (const y of result.years) writeFileSync(join(outDir, `budget-${y.year}.json`), JSON.stringify(y, null, 2));
console.log(`\nGeschrieben nach ${outDir}: categories.json + ${result.years.length} Jahresdateien`);
