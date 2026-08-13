#!/usr/bin/env node
// Diagnostika Farmy.cz — proč projde jen málo nabídek? Co u nich chybí.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function get(u) { try { const r = await fetch(u, { headers: UA }); return await r.text(); } catch { return ''; } }

const listHtml = await get('https://farmy.cz/inzerce_aktualni_nabidky');
const ids = [...new Set([...listHtml.matchAll(/nabidka_detail\?nab=(\d+)/g)].map((m) => m[1]))];
console.log('nabídek:', ids.length);
let okGps = 0, okArea = 0, okPm2 = 0, okTot = 0, okOkres = 0, full = 0;
for (const id of ids) {
  const html = await get('https://farmy.cz/nabidka_detail?nab=' + id);
  await sleep(150);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  const gps = /Poloha GPS\s+([\d.]+)N/i.test(text);
  const area = /Výměra\s+[\d\s]+?\s*m2/i.test(text);
  const pm2 = /Cena\s+[\d\s.]+,\d{2}\s*Kč\s*\/\s*m2/i.test(text);
  const tot = /Cena\s+[\d\s.]+,\d{2}\s*Kč(?!\s*\/\s*m2)/i.test(text);
  const okr = /v okrese\s+.+?\s+v\s+\S+\s+kraji/i.test(text);
  if (gps) okGps++; if (area) okArea++; if (pm2) okPm2++; if (tot) okTot++; if (okr) okOkres++;
  if (gps && area && (pm2 || tot)) full++;
  // ukázka ceny u těch bez ceny
  if (!pm2 && !tot) {
    const ci = text.search(/cena/i);
    console.log(`  nab ${id} BEZ CENY:`, ci >= 0 ? text.slice(ci, ci + 70) : '(žádná zmínka ceny)');
  }
}
console.log(`\nSouhrn z ${ids.length}: gps=${okGps} area=${okArea} cena/m2=${okPm2} cena_celkem=${okTot} okres(text)=${okOkres} | KOMPLETNÍ=${full}`);
console.log('Hotovo.');
