#!/usr/bin/env node
// Otestuj skutečné odkazy z živých dat podle zdroje — kam vedou (200 / redirect / generic).
import { readFileSync } from 'node:fs';
const UA = { 'user-agent': 'Mozilla/5.0 PozemkomatBot/0.1' };
const data = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const ops = data.opportunities;

function src(o) {
  if (o.type !== 'sale') return o.type;
  const e = o.extra || '';
  if (/Bezrealitky/.test(e)) return 'Bezrealitky';
  if (/Farmy/.test(e)) return 'Farmy';
  if (/SPÚ|státní/.test(e)) return 'SPÚ';
  return 'sale?';
}
// spočítej, kolik má odkaz (url) a kolik ne, podle zdroje
const stat = {};
for (const o of ops) { const s = src(o); (stat[s] = stat[s] || { total: 0, withUrl: 0 }); stat[s].total++; if (o.url) stat[s].withUrl++; }
console.log('odkazy podle zdroje:', JSON.stringify(stat));

// otestuj jeden reálný url z každého zdroje
async function head(u) { try { const r = await fetch(u, { headers: UA, redirect: 'manual' }); return r.status + (r.headers.get('location') ? ' → ' + r.headers.get('location') : ''); } catch (e) { return 'CHYBA ' + e.message; } }
const seen = {};
for (const o of ops) {
  const s = src(o);
  if (seen[s] || !o.url) continue; seen[s] = 1;
  console.log(`\n[${s}] ${o.place} → ${o.url}`);
  console.log('   HTTP', await head(o.url));
}
console.log('\nHotovo.');
