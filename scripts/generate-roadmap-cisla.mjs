#!/usr/bin/env node
/* ČÍSLA V ROADMAPĚ SE PŘEPOČÍTÁVAJÍ, NEPÍŠOU
   ==================================================================
   docs/roadmap.md je jediné místo, kde se dá přečíst, co je hotové
   a co čeká na majitele. Tabulka „Stav k…" v ní ale stárla tiše:
   tvrdila 11 tabulek a 25 funkcí (bylo 14 a 33), 2 018 nabídek
   (2 006), 1 629 popisů (1 618), 2 000 stránek pozemků (2 053)
   a 62/68 zkoušek (75/88). Plán, který lže v číslech, se nedá použít
   k rozhodování, a to je jeho jediný účel.

   Data se navíc obnovují samy každých 6 hodin (update-data.yml),
   takže ta čísla by ručně nemohl udržet nikdo. Proto se tabulka
   mezi značkami POČÍTÁ ze zdroje — stejně jako čísla v úvodu webu.

   Text mezi značkami nepište ručně; přepíše se. Všechno ostatní
   v roadmapě je napsané člověkem a tenhle krok se toho nedotkne.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CESTA = path.join(KOREN, 'docs', 'roadmap.md');
const OD = '<!-- PK-STAV-OD: přepočítá scripts/generate-roadmap-cisla.mjs -->';
const DO = '<!-- PK-STAV-DO -->';

/** 2006 → „2 006" (nezlomitelná mezera, jako to dělá sazba.mjs). */
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function spocitej() {
  const sql = fs.readdirSync(path.join(KOREN, 'supabase'))
    .filter((f) => f.endsWith('.sql') && f !== '00-vse.sql')
    .map((f) => fs.readFileSync(path.join(KOREN, 'supabase', f), 'utf8')).join('\n');
  const tabulky = new Set([...sql.matchAll(/create table (?:if not exists )?(?:public\.)?([a-z_]+)/gi)].map((m) => m[1]));
  const funkce = new Set([...sql.matchAll(/create or replace function (?:public\.)?([a-z_]+)/gi)].map((m) => m[1]));

  const opp = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  const nab = opp.opportunities || [];
  const popisy = Object.keys(JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'popisy.json'), 'utf8'))).length;

  const html = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  const souboru = fs.readdirSync(path.join(KOREN, 'scripts')).filter((f) => /^test-.*\.mjs$/.test(f)).length;
  const wf = fs.readFileSync(path.join(KOREN, '.github', 'workflows', 'testy.yml'), 'utf8');
  const joby = wf.split(/\n  (?=[\w-]+:\n)/);
  const vJobu = (jmeno) => {
    const j = joby.find((b) => b.trimStart().startsWith(jmeno + ':'));
    return j ? [...j.matchAll(/node (scripts\/test-[a-z0-9-]+\.mjs)/g)].length : 0;
  };

  return {
    tabulky: tabulky.size, funkce: funkce.size,
    nabidek: nab.length,
    prodeju: nab.filter((d) => d.type === 'sale').length,
    drazeb: nab.filter((d) => d.type === 'drazba').length,
    exekuci: nab.filter((d) => d.type === 'exekuce').length,
    popisy,
    pozemku: html.filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)).length,
    okresnich: html.filter((f) => f.startsWith('pozemky-okres-')).length,
    krajskych: html.filter((f) => /^pozemky-[a-z-]+-kraj\.html$/.test(f)).length,
    souboru, bezProhlizece: vJobu('testy'), sProhlizecem: vJobu('v-prohlizeci'),
    den: (opp.updated || '').split('T')[0],
  };
}

export function tabulka(c) {
  const [r, m, d] = (c.den || '').split('-');
  const datum = r ? `${Number(d)}. ${Number(m)}. ${r}` : 'neznámého dne';
  return `## Stav k ${datum}

| Co | Jak to je |
|---|---|
| Web | GitHub Pages, vlastní doména. **Přesun na Vercel z původního plánu se neuskutečnil a není potřeba** — Pages web nasazují samy z větve a server na pozadí dělá Supabase. U Vercelu zůstalo vedlejší nasazení, proto se tam zapíná jeho analytika. |
| Databáze | Supabase, ${c.tabulky} tabulek a ${c.funkce} funkcí (RPC). Sloučený balík k nahrání je \`supabase/00-vse.sql\`. |
| Data příležitostí | ${fmt(c.nabidek)} nabídek (${fmt(c.prodeju)} prodejů, ${fmt(c.drazeb)} dražeb, ${fmt(c.exekuci)} exekucí), ${fmt(c.popisy)} popisů od inzerentů. Stahuje se samo každých 6 hodin (\`update-data.yml\`). |
| Stránky | ${fmt(c.pozemku)} vlastních stránek pozemků, ${c.okresnich} okresních, ${c.krajskych} krajských — všechny generované, v \`sitemap.xml\`. |
| Zkoušky | ${fmt(c.souboru)} souborů, v CI dva úkoly: ${c.bezProhlizece} bez prohlížeče, ${c.sProhlizecem} s prohlížečem. |`;
}

export function prepis(text, c) {
  const i = text.indexOf(OD), j = text.indexOf(DO);
  if (i < 0 || j < 0 || j < i) throw new Error('generate-roadmap-cisla: v docs/roadmap.md chybí značky PK-STAV-OD / PK-STAV-DO');
  return text.slice(0, i + OD.length) + '\n\n' + tabulka(c) + '\n\n' + text.slice(j);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = spocitej();
  const stary = fs.readFileSync(CESTA, 'utf8');
  const novy = prepis(stary, c);
  if (novy === stary) console.log('čísla v roadmapě souhlasí');
  else { fs.writeFileSync(CESTA, novy); console.log(`přepsána tabulka stavu: ${c.nabidek} nabídek, ${c.pozemku} stránek pozemků, ${c.bezProhlizece}+${c.sProhlizecem} zkoušek`); }
}
