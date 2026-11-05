#!/usr/bin/env node
/* OHLÁSIT NÁLEZ ZKOUŠENÍ PORTÁLŮ — úspěch, který na někoho čeká.
   ====================================================================
   Volá to .github/actions/ohlas-nalez po úspěšném běhu zkouseni-portalu.

   PROČ TO VZNIKLO. Bot běží každé pondělí, zapíše nález do
   data/cesty-portalu.json a tím to skončilo. Nález z 5. 11. nesl tři
   cesty, se kterými se dalo něco udělat — dvě slibné a jednu „ke
   čtení" na Ministerstvu obrany — a nedozvěděl se o nich nikdo:
   úloha skončila ZELENĚ a zelená tečka v Actions znamená „nic
   k řešení". Repozitář má hlásič selhání (scripts/ohlas-selhani.mjs)
   a chyběl mu ten druhý konec: hlásič nálezu.

   HLÁSÍ SE JEN NOVÉ. Seznam akceschopných cest se po každém běhu
   opakuje; hlásit ho celý by znamenalo každé pondělí tentýž úkol.
   Hlásí se proto `noveOdMinule` z nálezu — rozdíl proti minulému
   běhu podle host + adresa + verdikt (počítá to noveProtiMinule()
   v scripts/cesty-portalu.mjs a hlídá test-zkus-portal).

   JEDEN ÚKOL, NE JEDEN NA BĚH. Stejně jako u selhání: existující
   otevřený úkol se doplní komentářem a poznává se podle skryté
   značky v těle, ne podle názvu.

   SÁM NIKDY NESPADNE. Jeho vlastní chyba nesmí shodit úlohu, která
   dobře doběhla — co se nepovede, napíše jako `::warning::` a skončí
   nulou. Ale NIKDY nemlčí.

   JEDEN HLÁSIČ PRO VŠECHNY HLEDAČE. Hledače jsou tři — zkoušení
   portálů, sonda zdrojů a hledání v katalozích — a všechny tři mají
   tentýž problém: zapíšou nález do JSON a skončí zeleně. Kopírovat
   tenhle skript třikrát by znamenalo tři místa, kde se příště zapomene
   na totéž. Místo toho má KAŽDÝ nález týž tvar položky:

     { jmeno, host, adresa, verdikt, proc, coSTim, znaky? }

   a hlásič se jen řekne, který soubor a které pole čte. Tvar je ta
   spojka — a hlídá ho zkouška u každého hledače zvlášť.

   Spuštění (proměnné prostředí):
     GH_TOKEN   — github.token z běhu
     REPO       — „vlastnik/jmeno"
     BEH        — adresa běhu
     NALEZ      — cesta k souboru s nálezem (výchozí data/cesty-portalu.json)
     POLE       — klíč s novými položkami (výchozí noveOdMinule)
     ZNACKA_ID  — rozlišení skryté značky (výchozí zkouseni-portalu)
     NAZEV      — jak se hledač jmenuje v názvu úkolu
     GH_API     — švík pro zkoušku (v běhu se nenastavuje)
   ==================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CO_S_TIM } from './cesty-portalu.mjs';

const E = process.env;
const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Značka musí jít rozlišit podle hledače: dva hledače s jednou značkou
   by si lepily nálezy do jednoho úkolu a z „co s tím" by byla kaše. */
const ZNACKA_ID = (E.ZNACKA_ID || 'zkouseni-portalu').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ZNACKA = `<!-- ohlas-nalez:${ZNACKA_ID} -->`;
const POLE = E.POLE || 'noveOdMinule';
const NAZEV = E.NAZEV || 'Zkoušení portálů';

const chybi = ['GH_TOKEN', 'REPO', 'BEH'].filter((k) => !E[k]);
if (chybi.length) {
  console.log('::warning::ohlas-nalez: chybí ' + chybi.join(', ') + ' — úkol se nezaloží');
  process.exit(0);
}
const API = (E.GH_API || 'https://api.github.com') + '/repos/' + E.REPO;
const hlavicky = {
  Authorization: 'Bearer ' + E.GH_TOKEN,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};

async function jdi(cesta, volby) {
  const r = await fetch(API + cesta, { ...volby, headers: hlavicky });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* níž */ }
  return { stav: r.status, j, t };
}

/* Tělo úkolu se skládá z MĚŘENÉHO, ne z dojmů: u každé cesty stojí
   verdikt, co s tím, adresa a — když je — i to, co se na ní naměřilo. */
export function teloUkolu(nove, beh) {
  const radky = [ZNACKA, '', `**${NAZEV}: nález, se kterým se dá něco udělat.**`, ''];
  for (const c of nove) {
    radky.push(`### ${c.jmeno || c.host} — ${c.verdikt}`);
    radky.push(`- **co s tím:** ${c.coSTim || CO_S_TIM[c.verdikt] || '—'}`);
    if (c.cesta) radky.push(`- cesta: ${c.cesta}`);
    radky.push(`- adresa: ${c.adresa}`);
    if (c.proc) radky.push(`- odůvodnění bota: ${c.proc}`);
    if (c.nabidek) radky.push(`- přečteno nabídek: ${c.nabidek}`);
    if (c.znaky) {
      const p = Object.entries(c.znaky.pocty || {}).map(([k, v]) => `${k} ${v}×`).join(', ');
      radky.push(`- naměřeno na stránce: „${c.znaky.titulek}", ${c.znaky.znaku} znaků textu${p ? ', ' + p : ''}`);
      if (c.znaky.ukazka) radky.push(`- ukázka: ${c.znaky.ukazka.slice(0, 200)}…`);
    }
    radky.push('');
  }
  radky.push('---');
  radky.push('Nález: `' + (E.NALEZ || 'data/cesty-portalu.json') + '` (pole `' + POLE + '`). Běh: ' + beh);
  radky.push('');
  radky.push('**Žádný zdroj se tím nezapojil.** O cizím webu se rozhoduje po přečtení'
    + ' jeho podmínek užití a to je práce pro člověka. Tenhle úkol zakládá'
    + ' `.github/actions/ohlas-nalez`; další nález přijde jako komentář, ne jako nový úkol.');
  return radky.join('\n');
}

try {
  const soubor = E.NALEZ || path.join(KOREN, 'data', 'cesty-portalu.json');
  let nalez = null;
  try { nalez = JSON.parse(readFileSync(soubor, 'utf8')); }
  catch (e) {
    console.log('::warning::ohlas-nalez: nález se nepodařilo přečíst (' + soubor + ')');
    process.exit(0);
  }
  const nove = Array.isArray(nalez[POLE]) ? nalez[POLE] : [];
  if (!nove.length) {
    console.log('Nic nového proti minulému nálezu — úkol se nezakládá.');
    process.exit(0);
  }
  const seznam = await jdi('/issues?state=open&per_page=100');
  const uz = (Array.isArray(seznam.j) ? seznam.j : []).find((i) => String(i.body || '').includes(ZNACKA));
  if (uz) {
    const r = await jdi(`/issues/${uz.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: teloUkolu(nove, E.BEH) }),
    });
    if (r.stav >= 200 && r.stav < 300) console.log(`Úkol #${uz.number} už byl otevřený — doplněn komentář (${nove.length} nových cest).`);
    else console.log(`::warning::komentář k úkolu #${uz.number} se nepovedlo přidat (${r.stav})`);
  } else {
    const r = await jdi('/issues', {
      method: 'POST',
      body: JSON.stringify({
        title: `${NAZEV}: ${nove.length} nových nálezů, se kterými se dá něco udělat`,
        body: teloUkolu(nove, E.BEH),
      }),
    });
    if (r.j && r.j.number) console.log('Založen úkol #' + r.j.number);
    else console.log('::warning::úkol se nepovedlo založit (' + r.stav + '): '
      + String((r.j && r.j.message) || r.t).slice(0, 120));
  }
} catch (e) {
  console.log('::warning::ohlas-nalez: ' + String((e && e.message) || e).slice(0, 140));
}
process.exit(0);
