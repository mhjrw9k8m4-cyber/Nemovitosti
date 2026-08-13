#!/usr/bin/env node
// Zjistí hodnoty typu dražby (dobrovolná/nedobrovolná) v datasetu.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const r = await fetch('https://cevd.gov.cz/opendata/drazby/drazby_2026.json', { headers: UA });
const j = await r.json();
const arr = Array.isArray(j) ? j : (Object.values(j).find(Array.isArray) || []);

const typ = {}, zpusob = {}, forma = {};
for (const rec of arr) {
  const zi = rec.zakladniInformace || {};
  typ[JSON.stringify(zi.typDrazby)] = (typ[JSON.stringify(zi.typDrazby)] || 0) + 1;
  zpusob[JSON.stringify(zi.zpusobDrazby)] = (zpusob[JSON.stringify(zi.zpusobDrazby)] || 0) + 1;
  forma[JSON.stringify(zi.formaDrazby)] = (forma[JSON.stringify(zi.formaDrazby)] || 0) + 1;
}
console.log('typDrazby:', JSON.stringify(typ, null, 2));
console.log('zpusobDrazby:', JSON.stringify(zpusob, null, 2));
console.log('formaDrazby:', JSON.stringify(forma, null, 2));
console.log('Hotovo.');
