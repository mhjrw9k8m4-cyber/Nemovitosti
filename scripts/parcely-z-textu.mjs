#!/usr/bin/env node
/* PARCELNÍ ČÍSLO Z TEXTU INZERÁTU — a kdy se o něm mlčí
   ==================================================================
   Spuštění: node scripts/parcely-z-textu.mjs   (vypíše, kolik jich je)

   PROČ. Parcelní číslo má v datech jen 273 nabídek z 1 948 (14 %);
   u 1 675 stojí „—". Je to přitom jediný údaj, kterým je pozemek
   určený: podle něj se dá dohledat v katastru, podle něj se píše
   kupní smlouva (js/smlouva.js bez něj odmítne pokračovat) a bez něj
   se dvě různé parcely v jedné vsi nedají rozeznat. V textu inzerátu
   přitom často je.

   KOLIK Z TOHO JDE POCTIVĚ VZÍT — A JAK JSEM SE SPLETL. Nejdřív jsem
   měřil „v popisu je právě jedno parcelní číslo a někde v textu
   výměra, která sedí na nabídku": vyšlo 499 nabídek a vypadalo to
   hotově. Pak jsem si přečetl pět popisů:

     • Český Brod: „dva stavební pozemky o celkové výměře 3 315 m² …
       parcela č. 261/25 – 1 531 m² * parcela č." — text je UŘÍZNUTÝ
       (popisy mají strop kolem 460 znaků), druhé číslo v něm není,
       takže „právě jedno" byla nepravda. A výměra, která „sedí",
       byla ta CELKOVÁ, ne té parcely.
     • Rudice: „LV č. 65 o výměře 1976 m², podíl 1/2 • Parcela č. 3591
       - o výměře 3952 m²" — číslo je správné, ale sedla výměra podílu,
       ne parcely.

   Obě shody tedy platily náhodou. Pravidlo se proto zpřísnilo:

     1) v popisu je právě JEDNO parcelní číslo,
     2) výměra stojí TĚSNĚ ZA NÍM (do 60 znaků) a sedí na výměru
        nabídky s odchylkou do 1 %,
     3) popis nevypadá uříznutě (není u stropu a nekončí uprostřed).

   Z 1 621 popisů tím projde 221 nabídek místo 499. Je to méně, ale
   u všech pěti ručně přečtených to sedělo — a parcelní číslo, které
   je VEDLE, je horší než žádné: podle něj se podepisuje smlouva.

   A JEŠTĚ JEDNA VĚC, KTERÁ SE TÍM NEDĚLÁ. Číslo se NEVKLÁDÁ do pole
   `parcel`. To pole je součástí klíče pozemku (PKKlic.pkey), takže by
   se 221 pozemkům změnil klíč: přejmenovaly by se jejich stránky,
   rozsypaly by se rozeslané odkazy a lidem by zmizely uložené
   pozemky. Jde to vedle, jako údaj „podle inzerátu".
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Parcelní číslo. OKNO ZA ČÍSLEM TU SCHVÁLNĚ NENÍ: když jsem ho měl
   v regulárním výrazu jako ([\s\S]{0,60}), snědlo text za prvním
   nálezem a druhé parcelní číslo se v něm schovalo — na
   „Parcela č. 100/1 o výměře 500 m² a parcela č. 100/2 o výměře 500 m²"
   našel výraz jediné číslo a pravidlo „v popisu je právě jedno"
   prohlásilo pravdu o nepravdě. Našla to zkouška, ne já. Čísla se proto
   hledají bez okna a okno se bere až podle polohy nálezu. */
const PARCELA = /(?:parc(?:\.|eln[íi]|ela)?\s*(?:č(?:\.|[íi]slo)?)?|p\.\s*č\.)\s*([0-9]{1,5}(?:\/[0-9]{1,4})?)/gi;
/* Jak daleko za číslem se ještě hledá výměra. */
export const OKNO = 60;
const VYMERA = /([0-9][0-9\s ]{0,8})\s*(?:m\s*2|m²)/i;
/* Popisy jsou u zdroje zkrácené; nejdelší naměřený má 461 znaků.
   Co je blízko stropu, může mít další parcelní číslo za řezem. */
export const STROP_POPISU = 440;
/* Odchylka výměry. Inzeráty zaokrouhlují, katastr ne. */
export const TOLERANCE = 0.01;

/**
 * Parcelní číslo z textu inzerátu, nebo null.
 *   text    — popis inzerátu
 *   nabidka — { area } (výměra, na kterou se shoda kontroluje)
 * Druhý výstup `proc` říká, proč se mlčí — kvůli zkoušce i kvůli
 * tomu, aby se dalo spočítat, co se zahazuje a proč.
 */
export function najdi(text, nabidka) {
  const s = String(text == null ? '' : text);
  if (!s.trim()) return { cislo: null, proc: 'bez popisu' };
  const vym = (nabidka && typeof nabidka.area === 'number') ? nabidka.area : 0;
  if (!(vym > 0)) return { cislo: null, proc: 'nabídka nemá výměru' };

  PARCELA.lastIndex = 0;
  const nalezy = [...s.matchAll(PARCELA)];
  if (!nalezy.length) return { cislo: null, proc: 'v popisu žádné číslo' };
  const cisla = [...new Set(nalezy.map((x) => x[1]))];
  if (cisla.length > 1) return { cislo: null, proc: 'v popisu víc čísel' };

  /* UŘÍZNUTÝ TEXT SE NEPOČÍTÁ. Z „…parcela č. 261/25 – 1 531 m²
     * parcela č." se nedá poznat, kolik parcel inzerát prodává. */
  const orez = s.trim();
  if (orez.length >= STROP_POPISU) return { cislo: null, proc: 'popis je u stropu, může být uříznutý' };
  if (/(?:č|čís|čísl|parcela|výměře|výměra)\.?\s*$/i.test(orez)) {
    return { cislo: null, proc: 'popis končí uprostřed' };
  }

  const za = s.slice(nalezy[0].index + nalezy[0][0].length,
    nalezy[0].index + nalezy[0][0].length + OKNO);
  const m = VYMERA.exec(za);
  if (!m) return { cislo: null, proc: 'u čísla není výměra' };
  const u = Number(String(m[1]).replace(/[\s ]/g, ''));
  if (!(u > 0)) return { cislo: null, proc: 'u čísla není výměra' };
  if (Math.abs(u - vym) / vym > TOLERANCE) {
    return { cislo: null, proc: `výměra u čísla (${u}) nesedí na nabídku (${Math.round(vym)})` };
  }
  return { cislo: cisla[0], proc: 'ok' };
}

/** Popisy ke klíči nabídky (pkey + cena | výměra) — tak je ukládá robot. */
export function klicPopisu(d, pkey) {
  return pkey(d) + '#' + (d.price || 0) + '|' + (d.area || 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const req = createRequire(import.meta.url);
  const KLIC = req(path.join(KOREN, 'js', 'klic.js')).PKKlic;
  const PKC = req(path.join(KOREN, 'js', 'cisteni.js'));
  const PKH = req(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const data = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  const popisy = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'popisy.json'), 'utf8'));
  const vse = PKH.bezDuplicit(PKC.pozemky((data.opportunities || data).slice()));
  const duvody = new Map();
  let ma = 0, doplneno = 0;
  for (const d of vse) {
    if (d.parcel && d.parcel !== '—') { ma++; continue; }
    const v = najdi(popisy[klicPopisu(d, KLIC.pkey)], d);
    if (v.cislo) doplneno++;
    const klic = v.cislo ? 'ok' : v.proc.replace(/\(.*/, '').trim();
    duvody.set(klic, (duvody.get(klic) || 0) + 1);
  }
  console.log(`\nParcelní číslo — ${vse.length} nabídek`);
  console.log('='.repeat(56));
  console.log(`v datech ho má:        ${ma} (${Math.round((100 * ma) / vse.length)} %)`);
  console.log(`z textu se doplní:     ${doplneno} (+${Math.round((100 * doplneno) / vse.length)} b.)`);
  console.log(`celkem tedy:           ${ma + doplneno} (${Math.round((100 * (ma + doplneno)) / vse.length)} %)`);
  console.log('\nProč se u ostatních mlčí:');
  for (const [k, n] of [...duvody].sort((a, b) => b[1] - a[1])) {
    if (k === 'ok') continue;
    console.log(`  ${String(n).padStart(5)}  ${k}`);
  }
  console.log();
}
