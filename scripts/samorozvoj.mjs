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
  let prokazanych = 0, sSlepymMistem = 0, nedotcenych = 0, nedorucenych = 0, nelzeTady = 0,
    mlcivych = 0;
  for (const t of (zkousky || [])) {
    const r = z[t];
    if (!r || !r.kdy) { nedotcenych++; continue; }
    /* ZKOUŠKA, KTEROU TENHLE STROJ NEUMÍ PUSTIT, JE TAKY VLASTNÍ SLOUPEC.
       Nemá prohlížeč, takže o hlídači neříká nic — ani že je prokázaný,
       ani že je slepý, ani že se ho stroj nedotkl. */
    if (r.nelzeTady) { nelzeTady++; continue; }
    if ((r.slepa || []).length) sSlepymMistem++;
    else if ((r.chytila || 0) > 0) prokazanych++;
    /* Mlčení nad mutací souboru, který hlídá víc zkoušek, není ani
       důkaz, ani slepé místo — je to nerozhodnuto, které se rozhodne,
       až tu samou mutaci dostane druhý hlídač téhož souboru. */
    else if ((r.mlcela || []).length) mlcivych++;
    /* SABOTÁŽ, KTERÁ SE K PRODUKTU NEDOSTALA, JE VLASTNÍ SLOUPEC.
       U zkoušek v prohlížeči stroj zapíše mutaci do js/*.js, jenže
       stránky servírují js/min/*.js a to se nepřestavuje — hlídač tu
       mutaci nemohl vidět (viz scripts/sabotuj.mjs). Říkat tomu
       „ještě se ho stroj nedotkl" by lhalo: dotkl se ho a nedosáhl.
       Prokázané to ale taky není. */
    else if ((r.nedorucene || []).length) nedorucenych++;
    else nedotcenych++;     // běh proběhl, ale nebylo co rozbít
  }
  return { celkem: (zkousky || []).length, prokazanych, sSlepymMistem, nedotcenych,
    nedorucenych, nelzeTady, mlcivych };
}

export function hlaseniUctu(stav, nalezu) {
  const podil = stav.celkem ? Math.round(stav.prokazanych / stav.celkem * 100) : 0;
  const radky = [
    `Účet samorozvoje: ${stav.prokazanych} z ${stav.celkem} hlídačů prokázáno sabotáží (${podil} %),`
    + ` ${stav.sSlepymMistem} se slepým místem, ${stav.nedotcenych} ještě neprokázáno.`,
  ];
  /* Vypisuje se jen když tam něco je — nula by byla věta pro nic.
     Jakmile tam něco je, je to hranice stroje, ne stav hlídačů, a
     patří to do účtu zvlášť. */
  if (stav.nedorucenych) {
    radky.push(`A u ${stav.nedorucenych} se sabotáž k prohlížeči nedostala`
      + ' (stránky servírují minifikovanou kopii) — hranice stroje, ne stav hlídače.');
  }
  if (stav.mlcivych) {
    radky.push(`U ${stav.mlcivych} zkouška nad mutací mlčela, ale týž soubor hlídá víc zkoušek`
      + ' — nerozhodnuto: rozhodne se, až tu mutaci dostane druhý hlídač téhož souboru.');
  }
  if (stav.nelzeTady) {
    radky.push(`A ${stav.nelzeTady} jich tenhle stroj neumí ani spustit`
      + ' (zkouška potřebuje prohlížeč, který tu není) — prokáže je jen běh v CI.');
  }
  radky.push(`Nálezů v tomhle běhu: ${nalezu}.`);
  return radky;
}

/* Nálezy, které se mají ohlásit nahlas (a tím shodit úlohu, aby přišlo
   upozornění). Slepé místo v hlídači ano — tichý hlídač je horší než
   žádný. „Ještě neprokázáno" ne: to není vada, to je nedokončená práce
   a smyčka ji dělá. */
/* SOUPIS PO SOUBORECH: kdo tu vadu chytil a kdo u ní mlčel.
   ------------------------------------------------------------------
   Jednotka měření nemůže být zkouška, když jeden soubor hlídá deset
   zkoušek. „test-barvy nechytila obrácené `>=` v js/main.js" je
   pravda o jednom řezu; otázka, která zajímá, je „chytí tu vadu
   vůbec někdo?". Soupis se proto vede po párech (soubor, mutace) a
   přibývá do něj každé kolo — tím se smyčka sama dopracuje k odpovědi,
   kterou po jednom běhu mít nemůže. */
export function soupisPoSouborech(ucet, prokazy) {
  const soubory = Object.assign({}, (ucet && ucet.soubory) || {});
  for (const v of (prokazy || [])) {
    for (const s of (v.sabotaze || [])) {
      if (!s.cil || !s.jmeno || s.jmeno === '—') continue;
      if (s.stav !== 'chytila' && s.stav !== 'NECHYTILA') continue;
      const proSoubor = Object.assign({}, soubory[s.cil] || {});
      const par = proSoubor[s.jmeno] || { chytily: [], mlcely: [] };
      const kam = s.stav === 'chytila' ? 'chytily' : 'mlcely';
      const druhy = s.stav === 'chytila' ? 'mlcely' : 'chytily';
      /* Zkouška může změnit verdikt (někdo ji doplní) — pak ať se
         nedrží v obou sloupcích naráz. */
      par[druhy] = (par[druhy] || []).filter((f) => f !== v.zkouska);
      if (!(par[kam] || []).includes(v.zkouska)) par[kam] = (par[kam] || []).concat(v.zkouska);
      proSoubor[s.jmeno] = par;
      soubory[s.cil] = proSoubor;
    }
  }
  return soubory;
}

/* Vada, kterou nechytí nikdo. Mez jsou DVĚ mlčící zkoušky, které ten
   soubor hlídají: jedna sama o sobě může mít prostě jiný předmět
   (test-barvy čte z js/main.js barvy, ne meze), ale dva nezávislí
   hlídači mlčící nad touž mutací téhož souboru znamenají, že ji
   nehlídá nikdo. Tíha 3 — to je nález o celé sadě. */
export const MEZ_MLCENI = 2;
export function vadyBezHlidace(ucet) {
  const ven = [];
  const soubory = (ucet && ucet.soubory) || {};
  for (const cil of Object.keys(soubory)) {
    for (const mutace of Object.keys(soubory[cil] || {})) {
      const par = soubory[cil][mutace] || {};
      const mlcely = par.mlcely || [], chytily = par.chytily || [];
      if (chytily.length || mlcely.length < MEZ_MLCENI) continue;
      ven.push({ cil, mutace, mlcely,
        jmeno: `vada, kterou nechytí nikdo: ${mutace} v ${cil}`,
        tiha: 3,
        dukaz: `mlčely nad ní zkoušky ${mlcely.join(', ')} — a žádná ji nechytila`,
        co: 'Hlídač na tuhle vadu v tomhle souboru neexistuje; napsat ho.' });
    }
  }
  return ven.sort((a, b) => a.jmeno.localeCompare(b.jmeno));
}

export function kOhlaseni(nalezy, prokazy) {
  const vazne = (nalezy || []).filter((n) => n.tiha >= 3);
  /* NAHLAS SE O ZKOUŠCE KŘIČÍ JEN TAM, KDE JE OBVINĚNÍ PEVNÉ: soubor
     nehlídá nikdo jiný, takže mlčení je opravdu její slepé místo.
     Když ho hlídá ještě někdo, čeká se na soupis po souborech — jinak
     by stroj poslal člověka doplňovat do zkoušky na barvy kontrolu na
     mez v logice hledání (§397). */
  const slepa = (prokazy || []).filter((p) => (p.sabotaze || [])
    .some((s) => s.stav === 'NECHYTILA' && !(s.hlidajiJeste || []).length));
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
      /* SLEPÉ MÍSTO SE ZAPISUJE JEN TAM, KDE JE OBVINĚNÍ PEVNÉ: ten
         soubor nehlídá nikdo jiný. Když ho hlídá víc zkoušek, je
         mlčení téhle zkoušky zatím jen mlčení (§397) a čeká se, co
         řekne soupis po souborech. */
      slepa: (v.sabotaze || [])
        .filter((x) => x.stav === 'NECHYTILA' && !(x.hlidajiJeste || []).length)
        .map((x) => x.jmeno),
      mlcela: (v.sabotaze || [])
        .filter((x) => x.stav === 'NECHYTILA' && (x.hlidajiJeste || []).length)
        .map((x) => `${x.jmeno} v ${x.cil}`),
      nedorucene: (v.sabotaze || []).filter((x) => x.stav === 'nedoručená').map((x) => x.jmeno),
      /* Běh, který se vůbec nekonal: stroj na tu zkoušku nemá prohlížeč.
         Zapisuje se, aby se o ni smyčka příště neopřela jako o padající. */
      nelzeTady: !!v.nelzeTady,
      /* A čím se stroj vědomě nezabýval: vlastní pomůcky zkoušek. */
      pomucky: (v.pomucky || []),
      poznamka: v.poznamka || v.chyba || '',
    };
    /* Po chybě se smyčka zastaví, ať se nejistota nehromadí — ale „na tomhle
       stroji chybí prohlížeč" chyba zkoušky není a zastavovat kvůli ní celé
       kolo by znamenalo, že se smyčka zasekne na první zkoušce v prohlížeči
       a k dalším 300 hlídačům se nikdy nedostane. */
    if (v.chyba && !v.nelzeTady) break;
  }

  /* 3) ÚČET. */
  const stav = stavUctu(zkousky, ucet);
  console.log('');
  for (const r of hlaseniUctu(stav, nalezy.length)) console.log(r);

  ucet.soubory = soupisPoSouborech(ucet, prokazy);
  const bezHlidace = vadyBezHlidace(ucet);
  for (const n of bezHlidace) console.log(`\nNÁLEZ: ${n.jmeno} — ${n.dukaz}`);
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
  const { vazne, slepa } = kOhlaseni(nalezy.concat(bezHlidace), prokazy);
  for (const n of vazne) console.error(`::error::${n.jmeno} — ${n.dukaz}`);
  for (const p of slepa) {
    const jen = p.sabotaze.filter((s) => s.stav === 'NECHYTILA' && !(s.hlidajiJeste || []).length);
    console.error(`::error::${p.zkouska}: ${jen.length} sabotáží nechytila`
      + ` (${jen.map((s) => s.jmeno + ' v ' + s.cil).join(', ')}) — ten soubor nehlídá nikdo jiný`);
  }
  if (vazne.length || slepa.length) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Samorozvoj spadl:', e && e.message ? e.message : e); process.exit(1); });
}
