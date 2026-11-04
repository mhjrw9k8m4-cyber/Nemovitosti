#!/usr/bin/env node
/* SAMOROZVOJ — SMYČKA, KTERÁ SI NAJDE PRÁCI, PROKÁŽE HLÍDAČE A VEDE
   O TOM ÚČET
   ==================================================================
   Spuštění:
     node scripts/samorozvoj.mjs              jeden běh, jen vypíše
     node scripts/samorozvoj.mjs --zapis      zapíše účet a nález
     node scripts/samorozvoj.mjs --kolo=3     tři zkoušky za běh
   V Actions: workflow „Samorozvoj".

   CO TO JE A CO TO NENÍ. Tohle není stroj, který by sám vymýšlel, co
   má web umět. Je to stroj na tu část mojí práce, která je POSTUP, ne
   úsudek — a ta část je velká:

     1. NAJDI SI PRÁCI SÁM (scripts/nalezce.mjs). Spočítá, co nesedí:
        zdroj, který stáhl a nezveřejnil; místo, které místem není; dvě
        nabídky s jedním klíčem archivu; zkoušku, kterou nikdo nepouští.
        Každý nález má jméno, důkaz a třídu příčiny.
     2. PROKAŽ HLÍDAČE SABOTÁŽÍ (scripts/sabotuj.mjs). Rozbije měřenou
        věc a kouká, jestli to hlídač chytí. Ověřuje přitom diffem, že
        se soubor opravdu změnil — bez toho sabotáž nedokazuje nic
        (§369) — a vrací soubor z gitu.
     3. VEĎ O TOM ÚČET (data/samorozvoj.json). Kolik hlídačů existuje,
        kolik jich je sabotáží prokázaných, kde jsou slepá místa. To
        číslo je míra toho, jak moc se dá repozitáři věřit — a roste
        samo tím, že smyčka běží.
     4. STŘÍDEJ. Zkoušek je přes tři sta a sabotáž trvá; za jeden běh
        se proto prokáže několik a příště se pokračuje tam, kde se
        přestalo. Pořadí drží účet, takže se dojde na všechny.

   CO SMYČKA NEDĚLÁ. Nemění web ani kód. Nález je věta „tady čísla
   nesedí a tady je důkaz"; co z toho plyne, rozhoduje člověk. Opravy,
   které jde spočítat ze zdroje, má na starosti scripts/sebeoprava.mjs
   se svými osmi pravidly — tady se nic takového nepřidává, protože
   automat, který smí měnit kód podle vlastního nálezu, je nebezpečný
   přesně tak, jak je slabý jeho nález.

   A PROČ TO DÁVÁ SMYSL: PRVNÍ BĚH. Na zkoušce, kterou jsem napsal
   hodinu předtím a měl ji za důkladnou (74 kontrol, čtyři vymyšlené
   sabotáže), stroj našel ŠEST slepých míst — zahozenou pojistku,
   zrušený `filter(Boolean)`, posunutý strop a jednu kontrolu, která
   byla TAUTOLOGIE (obě strany si bral z téhož modulu, takže se
   posunuly spolu). To jsem já ručně nenašel ani nehledal.
   ================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { vsechnyNalezy, hlaseniNalezu } from './nalezce.mjs';
import { prokazZkousku, hlaseniProkazu, UVNITR } from './sabotuj.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const UCET = join(KOREN, 'data', 'samorozvoj.json');
export const KOLO = 3;                 // kolik zkoušek prokázat za běh
export const STROP_SABOTAZI = 6;       // kolik sabotáží na jednu zkoušku

/* Zkoušky, které si pouští vlastní workflow nebo potřebují živou
   Supabase — sabotáž by u nich měřila síť, ne hlídače. */
export const MIMO_STRIDANI = /^(test-chat|test-listing|test-search|test-zkousky-meri|test-kontrola-spusteni|test-samorozvoj)/;

export function vsechnyZkousky(kde) {
  try {
    return readdirSync(kde || join(KOREN, 'scripts'))
      .filter((f) => /^test-[a-z0-9-]+\.mjs$/.test(f))
      .filter((f) => !MIMO_STRIDANI.test(f))
      .sort();
  } catch { return []; }
}

/* ------------------------------------------------------------------
   STŘÍDÁNÍ. Na řadě je ta zkouška, která byla prokazována nejdřív
   (nebo nikdy). Tím se dojde na všechny a nic se neopakuje dřív, než
   se projde zbytek.
   ------------------------------------------------------------------ */
export function naRade(zkousky, ucet, kolik = KOLO) {
  const kdy = (ucet && ucet.zkousky) || {};
  return [...(zkousky || [])]
    .sort((a, b) => {
      const ka = (kdy[a] && kdy[a].kdy) || '';
      const kb = (kdy[b] && kdy[b].kdy) || '';
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.localeCompare(b);
    })
    .slice(0, Math.max(1, kolik));
}

/* ÚČET. Čísla, která dávají smysl i bez vysvětlování: kolik hlídačů
   je prokázaných, kolik má slepé místo a kolika se stroj ještě
   nedotkl. */
export function stavUctu(zkousky, ucet) {
  const z = (ucet && ucet.zkousky) || {};
  let prokazanych = 0, sSlepymMistem = 0, nedotcenych = 0;
  for (const t of (zkousky || [])) {
    const r = z[t];
    if (!r || !r.kdy) { nedotcenych++; continue; }
    if ((r.nechytila || 0) > 0) sSlepymMistem++;
    else if ((r.chytila || 0) > 0) prokazanych++;
    else nedotcenych++;     // běh proběhl, ale nebylo co rozbít
  }
  return { celkem: (zkousky || []).length, prokazanych, sSlepymMistem, nedotcenych };
}

export function hlaseniUctu(stav, nalezu) {
  const podil = stav.celkem ? Math.round(stav.prokazanych / stav.celkem * 100) : 0;
  return [
    `Účet samorozvoje: ${stav.prokazanych} z ${stav.celkem} hlídačů prokázáno sabotáží (${podil} %),`
    + ` ${stav.sSlepymMistem} se slepým místem, ${stav.nedotcenych} ještě neprokázáno.`,
    `Nálezů v tomhle běhu: ${nalezu}.`,
  ];
}

/* Nálezy, které se mají ohlásit nahlas (a tím shodit úlohu, aby přišlo
   upozornění). Slepé místo v hlídači ano — tichý hlídač je horší než
   žádný. „Ještě neprokázáno" ne: to není vada, to je nedokončená práce
   a smyčka ji dělá. */
export function kOhlaseni(nalezy, prokazy) {
  const vazne = (nalezy || []).filter((n) => n.tiha >= 3);
  const slepa = (prokazy || []).filter((p) => (p.nechytila || 0) > 0);
  return { vazne, slepa };
}

async function main() {
  if (process.env[UVNITR] === '1') {
    console.log('Samorozvoj se nepouští sám v sobě.');
    return;
  }
  const zapsat = process.argv.includes('--zapis');
  const kolo = (() => {
    const a = process.argv.find((x) => x.startsWith('--kolo='));
    const n = a ? parseInt(a.slice(7), 10) : NaN;
    return isFinite(n) && n > 0 ? n : KOLO;
  })();

  let ucet = { dny: {}, zkousky: {} };
  try { ucet = JSON.parse(readFileSync(UCET, 'utf8')); } catch { /* první běh */ }
  ucet.zkousky = ucet.zkousky || {};

  /* 1) NAJDI SI PRÁCI. */
  let data = null;
  try { data = JSON.parse(readFileSync(join(KOREN, 'data', 'opportunities.json'), 'utf8')); }
  catch { data = null; }
  let klicArchivu = null;
  try {
    const src = readFileSync(join(KOREN, 'js', 'klic.js'), 'utf8');
    const root = {};
    /* Soubor je pro prohlížeč; spustí se v prázdném obalu, ať se z něj
       dá vzít klíč bez prohlížeče. */
    new Function('root', src.replace(/\(typeof window[^)]*\)\);?\s*$/, '(root));'))(root);
    klicArchivu = root.PKKlic && root.PKKlic.klicArchivu;
  } catch { klicArchivu = null; }
  const nalezy = vsechnyNalezy({ data, klicArchivu, soupisSabotazi: ucet });
  for (const r of hlaseniNalezu(nalezy)) console.log(r);

  /* 2) PROKAŽ HLÍDAČE. */
  const zkousky = vsechnyZkousky();
  const radа = naRade(zkousky, ucet, kolo);
  console.log(`\nNa řadě ${radа.length} z ${zkousky.length} hlídačů: ${radа.join(', ')}`);
  const dnes = new Date().toISOString().slice(0, 10);
  const prokazy = [];
  for (const t of radа) {
    let v;
    try { v = await prokazZkousku(t, { strop: STROP_SABOTAZI }); }
    catch (e) { v = { zkouska: t, chyba: String((e && e.message) || e).slice(0, 160) }; }
    prokazy.push(v);
    for (const r of hlaseniProkazu(v)) console.log(r);
    ucet.zkousky[t] = {
      kdy: dnes,
      hlidá: (v.hlidá || []).length,
      chytila: v.chytila || 0,
      nechytila: v.nechytila || 0,
      /* Mutace bez následku se počítají zvlášť a jmenovitě. Nejsou to
         chycené sabotáže (zkouška se neozvala) ani slepá místa (není
         co chytit) — a kdyby se schovaly do jednoho čísla s jedním
         nebo druhým, účet by lhal v obou směrech. */
      rovnocenne: (v.sabotaze || []).filter((x) => x.stav === 'rovnocenná').map((x) => x.jmeno),
      slepa: (v.sabotaze || []).filter((x) => x.stav === 'NECHYTILA').map((x) => x.jmeno),
      poznamka: v.poznamka || v.chyba || '',
    };
    if (v.chyba) break;         // nejistota se nehromadí: po chybě se zastaví
  }

  /* 3) ÚČET. */
  const stav = stavUctu(zkousky, ucet);
  console.log('');
  for (const r of hlaseniUctu(stav, nalezy.length)) console.log(r);

  if (zapsat) {
    ucet.updated = dnes;
    ucet.dny = Object.assign({}, ucet.dny || {}, {
      [dnes]: { prokazanych: stav.prokazanych, slepych: stav.sSlepymMistem, nalezu: nalezy.length },
    });
    ucet.nalezy = nalezy;
    writeFileSync(UCET, JSON.stringify(ucet, null, 1));
    console.log(`\nZapsáno do ${UCET}.`);
  } else {
    console.log('\n(Nic se nezapsalo. S --zapis se účet uloží do data/samorozvoj.json.)');
  }

  /* 4) CO SE MÁ OHLÁSIT NAHLAS. */
  const { vazne, slepa } = kOhlaseni(nalezy, prokazy);
  for (const n of vazne) console.error(`::error::${n.jmeno} — ${n.dukaz}`);
  for (const p of slepa) {
    console.error(`::error::${p.zkouska}: ${p.nechytila} sabotáží nechytila`
      + ` (${p.sabotaze.filter((s) => s.stav === 'NECHYTILA').map((s) => s.jmeno).join(', ')})`);
  }
  if (vazne.length || slepa.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Samorozvoj spadl:', e && e.message ? e.message : e); process.exit(1); });
}
