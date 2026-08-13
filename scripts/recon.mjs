#!/usr/bin/env node
// Vypíše přesná pole čistého POZEMKU (kategorie "Pozemky") z datasetu dražeb.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const r = await fetch('https://cevd.gov.cz/opendata/drazby/drazby_2026.json', { headers: UA });
const j = await r.json();
const arr = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || []);

let shown = 0;
const stavy = {};
for (const rec of arr) {
  for (const p of (rec.predmetyDrazby || [])) {
    stavy[p.stavPredmetu] = (stavy[p.stavPredmetu] || 0) + 1;
    const v = (p.veci || [])[0];
    if (!v) continue;
    const kat = (v.kategorie || '').toLowerCase();
    const isLand = kat.includes('pozem') && v.vecNemovita && v.vecNemovita.pozemek;
    if (isLand && shown < 2) {
      shown++;
      console.log(`\n=== POZEMEK #${shown} (kategorie: ${v.kategorie}, stav: ${p.stavPredmetu}) ===`);
      console.log('vecNemovita:', JSON.stringify(v.vecNemovita, null, 2).slice(0, 1600));
      console.log('vyvolavaciCena:', JSON.stringify(p.vyvolavaciCena));
      console.log('obvyklaCena:', JSON.stringify(p.obvyklaCena));
      console.log('konaniDrazby:', JSON.stringify(rec.zakladniInformace?.konaniDrazby).slice(0, 400));
    }
  }
}
console.log('\n--- Stavy předmětů (kolik čeho) ---');
console.log(JSON.stringify(stavy, null, 2));
console.log('Hotovo.');
