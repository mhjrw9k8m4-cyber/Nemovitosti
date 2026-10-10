#!/usr/bin/env node
/* PRVNÍ VIDĚNÍ NABÍDKY DOPOČÍTANÉ Z HISTORIE GITU.
 * ====================================================================
 * Spuštění:  node scripts/prvni-videno.mjs            (jen spočítá)
 *            node scripts/prvni-videno.mjs --zapsat   (opraví data)
 *
 * PROČ TO EXISTUJE. Pole `first_seen` nastavuje robot při stahování tak,
 * že nabídku hledá v minulém souboru podle otisku. Otisk ale nesl i CENU,
 * takže jakmile prodejce zlevnil, nabídka se nenašla a dostala dnešek —
 * přišla o svůj věk. Naměřeno: všech 25 nabídek se zaznamenanou změnou
 * ceny mělo first_seen přesně ten den, kdy se cena změnila, a na stránce
 * „Co je nového" stálo 14 pozemků zároveň v „Nově přidané" i „Zlevněné".
 * Robot to od téhle opravy dělá správně (druhé kolo párování bez ceny),
 * jenže data, která tím už přišla o datum, se samy neopraví.
 *
 * ODKUD SE BERE PRAVDA. data/opportunities.json má v gitu přes sto verzí
 * a každá nese `updated`. Projde se celá historie a pro každý otisk BEZ
 * CENY se zapamatuje nejstarší den, kdy v datech byl. Je to táž úvaha,
 * jakou používá scripts/historie-cen.mjs na cenové řady.
 *
 * CO TO NEUMÍ. Starší, než je první commit, se nedostaneme — nabídka
 * mohla na trhu viset měsíce předtím, než ji robot poprvé uviděl.
 * Dopočtené datum je tedy SPODNÍ MEZ, ne skutečné stáří inzerátu, a tak
 * se o něm na webu musí mluvit (stránka „Co je nového" to už dělá).
 * Dopředu se nikdy neposouvá: když historie nabídku nezná, datum zůstává.
 * ==================================================================== */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIL = path.join(KOREN, 'data', 'opportunities.json');
const ZDROJ = 'data/opportunities.json';

const bezDiakritiky = (x) => String(x == null ? '' : x)
  .normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
/** Otisk BEZ ceny — nabídka je táž, i když prodejce zlevnil. */
export function otiskBezCeny(o) {
  return [o.type || '', bezDiakritiky(o.okres), bezDiakritiky(o.place),
    o.parcel || '', o.area || ''].join('|').slice(0, 240);
}

/** Nejstarší den, kdy byl otisk v datech vidět. Mapa otisk → 'RRRR-MM-DD'. */
export function nejstarsiZHistorie(cti) {
  const nejdriv = new Map();
  let precteno = 0;
  for (const text of cti()) {
    let j;
    try { j = JSON.parse(text); } catch (e) { continue; }
    const den = String(j.updated || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(den)) continue;
    precteno++;
    for (const o of (j.opportunities || [])) {
      const k = otiskBezCeny(o);
      const stav = nejdriv.get(k);
      if (!stav || den < stav) nejdriv.set(k, den);
    }
  }
  return { nejdriv, precteno };
}

/** Vrátí, co by se změnilo. Datum se NIKDY neposouvá dopředu. */
export function opravData(nabidky, nejdriv) {
  const zmeny = [];
  for (const o of nabidky) {
    const d = nejdriv.get(otiskBezCeny(o));
    if (!d) continue;
    if (typeof o.first_seen === 'string' && d >= o.first_seen) continue;
    zmeny.push({ o, bylo: o.first_seen || null, ma: d });
  }
  return zmeny;
}

function spust() {
  const zapsat = process.argv.includes('--zapsat');
  const commity = execFileSync('git', ['log', '--format=%H', '--', ZDROJ],
    { cwd: KOREN, encoding: 'utf8' }).trim().split('\n').filter(Boolean).reverse();
  console.log(`• commitů s daty: ${commity.length}`);
  function* cti() {
    for (const c of commity) {
      try { yield execFileSync('git', ['show', `${c}:${ZDROJ}`], { cwd: KOREN, encoding: 'utf8', maxBuffer: 256e6 }); }
      catch (e) { /* commit, ve kterém soubor ještě nebyl */ }
    }
  }
  const { nejdriv, precteno } = nejstarsiZHistorie(cti);
  console.log(`• přečteno ${precteno} verzí, různých otisků ${nejdriv.size}`);
  const soubor = JSON.parse(readFileSync(CIL, 'utf8'));
  const zmeny = opravData(soubor.opportunities || [], nejdriv);
  console.log(`• dřívější datum dostane ${zmeny.length} z ${(soubor.opportunities || []).length} nabídek`);
  const dny = zmeny.map((z) => z.ma).sort();
  if (dny.length) console.log(`  nejstarší dopočtený den: ${dny[0]}`);
  if (!zapsat) { console.log('(jen výpis — zápis zapne --zapsat)'); return; }
  for (const z of zmeny) z.o.first_seen = z.ma;
  writeFileSync(CIL, JSON.stringify(soubor) + '\n');
  console.log(`• zapsáno do ${ZDROJ}`);
}

if (import.meta.url === `file://${process.argv[1]}`) spust();
