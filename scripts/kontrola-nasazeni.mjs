#!/usr/bin/env node
/* JE VENKU TO, CO MÁ BÝT? — KONTROLA NASAZENÉHO WEBU
   ==================================================================
   Spuštění:
     node scripts/kontrola-nasazeni.mjs
     node scripts/kontrola-nasazeni.mjs --web https://parcelaka.cz
     node scripts/kontrola-nasazeni.mjs --data-stare-hodin 48

   PROČ. Celý řetěz hlídačů v tomhle repozitáři kontroluje REPOZITÁŘ:
   zkoušky, generátory, sebeoprava. Nasazení ale dělá někdo jiný
   (GitHub Pages z větve) a nikdo nekontroloval, co je doopravdy VENKU.
   Zelená CI a rozbitý web vedle sebe obstojí: stačí, aby selhalo
   nasazení, aby se nepropsala data nebo aby se stránky nasadily jen
   zpola. Pak se web tváří, že běží, jen je o den starší — a to je ten
   nejhorší druh vady, protože nikomu nesvítí.

   CO SE MĚŘÍ NA ŽIVÉM WEBU (a každý bod umí říct, co je špatně):
     1. úvodní stránka vůbec odpovídá a je to naše stránka,
     2. JE VENKU TA VERZE, CO JE V REPOZITÁŘI — razítka `?v=`
        u skriptů se porovnají s těmi, které má index.html u nás.
        Tohle je jediná kontrola, která pozná „nasazení se nepropsalo",
        a je exaktní: razítko je hash obsahu,
     3. odchytávač chyb z hlavičky je venku (jinak by web mlčel o pádech
        právě tam, kde jsou lidé),
     4. hlavička CSP je venku,
     5. data nejsou stará (robot je obnovuje čtyřikrát denně),
     6. sitemap odpovídá a má v sobě tisíce adres,
     7. náhodná stránka pozemku ze sitemapy odpovídá — tedy nasadily se
        i generované stránky, ne jen ty ručně psané,
     8. neznámá adresa vrací opravdu 404, ne 200 s textem „nenalezeno"
        (to druhé vyhledávače indexují jako platnou stránku),
     9. robots.txt odpovídá.

   CO TENHLE SKRIPT NEDĚLÁ: neopravuje. Nasazení se z repozitáře
   vyvolat nedá a „zkusit to znovu" u cizí služby není oprava, ale
   hádání. Místo toho říká PŘESNĚ, co je venku jinak — s oběma
   razítky, ať je vidět, jestli je venku starší verze, nebo žádná.
   ================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VLOZENY } from './hlasic-chyb.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (jm, vychozi) => {
  const i = process.argv.indexOf(jm);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : vychozi;
};
const WEB = String(arg('--web', process.env.PK_WEB || 'https://www.parcelaka.cz')).replace(/\/+$/, '');
const STARE_HODIN = Math.max(1, parseInt(arg('--data-stare-hodin', process.env.PK_DATA_STARE_HODIN || '24'), 10) || 24);

const dobre = [], vady = [], nezmereno = [];
const ANO = (t) => dobre.push(t);
const NE = (co, proc) => vady.push(`${co} — ${proc}`);
const NEVIM = (co, proc) => nezmereno.push(`${co} — ${proc}`);

async function stahni(cesta) {
  const adresa = cesta.startsWith('http') ? cesta : WEB + cesta;
  const ab = new AbortController();
  const t = setTimeout(() => ab.abort(), 20000);
  try {
    const r = await fetch(adresa, { signal: ab.signal, redirect: 'follow',
      headers: { 'user-agent': 'parcelka-kontrola-nasazeni' } });
    const telo = await r.text();
    return { stav: r.status, telo, adresa };
  } catch (e) {
    return { stav: 0, telo: '', adresa, chyba: String((e && e.message) || e).slice(0, 120) };
  } finally { clearTimeout(t); }
}

/* ---- 1) úvodní stránka ------------------------------------------- */
const uvod = await stahni('/');
if (uvod.stav !== 200) {
  NE('úvodní stránka', uvod.chyba ? `nešla stáhnout (${uvod.chyba})` : `odpověděla ${uvod.stav}`);
} else if (!/<html lang="cs"/.test(uvod.telo)) {
  NE('úvodní stránka', 'odpověděla 200, ale není to naše stránka (chybí <html lang="cs">)');
} else {
  ANO(`úvodní stránka odpovídá (${(uvod.telo.length / 1024).toFixed(0)} kB)`);
}

/* ---- 2) je venku ta verze, co je v repozitáři? ------------------- */
/* Razítko `?v=` je hash obsahu souboru, takže tohle je přesné
   srovnání „co máme" proti „co je venku" — ne odhad podle data. */
if (uvod.stav === 200 && existsSync(path.join(KOREN, 'index.html'))) {
  const mistni = readFileSync(path.join(KOREN, 'index.html'), 'utf8');
  const razitka = (h) => {
    const m = {};
    for (const x of h.matchAll(/(js\/min\/[\w-]+\.js|css\/[\w.-]+\.css)\?v=([a-f0-9]+)/g)) m[x[1]] = x[2];
    return m;
  };
  const u_nas = razitka(mistni);
  const venku = razitka(uvod.telo);
  const jmena = Object.keys(u_nas);
  const chybi = jmena.filter((f) => !venku[f]);
  const jine = jmena.filter((f) => venku[f] && venku[f] !== u_nas[f]);
  if (!jmena.length) {
    NEVIM('shoda s repozitářem', 'v místním index.html nejsou žádná razítka ?v= — čím to srovnat?');
  } else if (chybi.length) {
    NE('shoda s repozitářem', `venku chybí ${chybi.length} z ${jmena.length} souborů`
      + ` (${chybi.slice(0, 3).join(', ')}) — nasazená stránka je jiná než naše`);
  } else if (jine.length) {
    const u = jine[0];
    NE('shoda s repozitářem', `venku je starší verze: ${jine.length} z ${jmena.length} razítek nesedí,`
      + ` např. ${u} má venku ?v=${venku[u]}, u nás ?v=${u_nas[u]}`
      + ' — nasazení se nepropsalo (zkontrolujte úlohu „pages build and deployment")');
  } else {
    ANO(`venku je přesně naše verze (${jmena.length} razítek ?v= souhlasí)`);
  }
}

/* ---- 3) a 4) odchytávač chyb a CSP ------------------------------- */
if (uvod.stav === 200) {
  if (uvod.telo.includes(VLOZENY)) ANO('odchytávač chyb z hlavičky je venku');
  else NE('odchytávač chyb', 'v nasazené stránce není (do bajtu) — web by o pádech mlčel'
    + ' právě tam, kde jsou lidé');

  if (/<meta http-equiv="Content-Security-Policy"/.test(uvod.telo)) ANO('hlavička CSP je venku');
  else NE('hlavička CSP', 'v nasazené stránce není');
}

/* ---- 5) data nejsou stará ---------------------------------------- */
{
  const d = await stahni('/data/index.json');
  if (d.stav !== 200) {
    NE('data webu', d.chyba ? `nešla stáhnout (${d.chyba})` : `odpověděla ${d.stav}`);
  } else {
    let j = null;
    try { j = JSON.parse(d.telo); } catch (e) { j = null; }
    const kdy = j && (j.updated_at || j.updated);
    const t = kdy ? Date.parse(kdy) : NaN;
    if (!j) NE('data webu', 'nasazený soubor data/index.json není platný JSON');
    else if (!isFinite(t)) NEVIM('svěžest dat', `v datech není čitelné datum (updated=${kdy})`);
    else {
      const hodin = (Date.now() - t) / 3600000;
      if (hodin > STARE_HODIN) {
        NE('svěžest dat', `nasazená data jsou ${hodin.toFixed(0)} h stará (strop ${STARE_HODIN} h)`
          + ' — robot je obnovuje každých 6 h, takže se buď zastavil, nebo se nenasazuje');
      } else ANO(`nasazená data jsou svěží (${hodin.toFixed(0)} h, strop ${STARE_HODIN} h)`);
    }
  }
}

/* ---- 6) a 7) sitemap a jedna generovaná stránka ------------------ */
{
  const s = await stahni('/sitemap.xml');
  if (s.stav !== 200) {
    NE('mapa webu', s.chyba ? `nešla stáhnout (${s.chyba})` : `odpověděla ${s.stav}`);
  } else {
    const adresy = [...s.telo.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    if (adresy.length < 2000) {
      NE('mapa webu', `je v ní jen ${adresy.length} adres — vyhledávač nemá co indexovat`);
    } else ANO(`mapa webu má ${adresy.length} adres`);

    /* Adresy v mapě webu musí být absolutní a na jedné doméně —
       relativní nebo rozházené adresy vyhledávač bere jako jiný web. */
    const cizi = adresy.filter((a) => !/^https:\/\/[\w.-]+\//.test(a));
    const domeny = [...new Set(adresy.map((a) => (a.match(/^https:\/\/([\w.-]+)\//) || [, ''])[1]))]
      .filter(Boolean);
    if (cizi.length) NE('mapa webu', `${cizi.length} adres není absolutních (např. „${cizi[0]}")`);
    else if (domeny.length > 1) NE('mapa webu', `adresy ukazují na ${domeny.length} různých domén (${domeny.join(', ')})`);
    else ANO(`adresy v mapě webu jsou absolutní a na jedné doméně (${domeny[0]})`);

    const pozemky = adresy.filter((a) => /\/pozemek-[\w-]+\.html$/.test(a));
    if (!pozemky.length) {
      NEVIM('generovaná stránka pozemku', 'v nasazené mapě webu nejsou žádné stránky pozemků');
    } else {
      /* Jedna náhodně, ne první: první by se mohla nasadit shodou
         okolností a zbytek ne.
         A BERE SE Z NÍ CESTA, NE CELÁ ADRESA. V mapě webu stojí vždy
         ostrá domena (má tam stát), takže kontrola jiného prostředí by
         se jinak ptala ostrého webu a tvrdila o něm něco, co o něm
         neplatí. Naměřeno vlastní zkouškou, která se ptala podstrčeného
         serveru a dostala „fetch failed" z ostré domény. */
      const vzorek = pozemky[Math.floor(Math.random() * pozemky.length)];
      const jmeno = vzorek.replace(/^https?:\/\/[^/]+\//, '');
      const p = await stahni('/' + jmeno);
      if (p.stav !== 200) NE('generovaná stránka pozemku', `${jmeno} odpověděla ${p.stav || p.chyba}`);
      else if (!/<html lang="cs"/.test(p.telo)) NE('generovaná stránka pozemku', `${jmeno} nevypadá jako naše`);
      else ANO(`generovaná stránka pozemku odpovídá (${jmeno})`);
    }
  }
}
/* ---- 8) neznámá adresa vrací 404 --------------------------------- */
{
  const n = await stahni('/tahle-adresa-neexistuje-9q7k2x.html');
  if (n.stav === 404) ANO('neznámá adresa vrací 404');
  else if (n.stav === 200) {
    NE('neznámá adresa', 'vrací 200 místo 404 — vyhledávače si takovou stránku zaindexují'
      + ' jako platnou');
  } else NEVIM('neznámá adresa', `odpověděla ${n.stav || n.chyba}`);
}

/* ---- 9) robots.txt ----------------------------------------------- */
{
  const r = await stahni('/robots.txt');
  if (r.stav === 200) ANO('robots.txt odpovídá');
  else NE('robots.txt', `odpověděl ${r.stav || r.chyba}`);
}

/* ---------------- VERDIKT ----------------------------------------- */
const out = [];
out.push(`\nKONTROLA NASAZENÉHO WEBU — ${WEB}\n`);
out.push(`V pořádku (${dobre.length}):`);
for (const x of dobre) out.push('  ✓ ' + x);
if (vady.length) {
  out.push(`\nVADY (${vady.length}):`);
  for (const x of vady) out.push('  ✕ ' + x);
}
if (nezmereno.length) {
  out.push(`\nNEZMĚŘENO — NEPLATÍ ZA „V POŘÁDKU" (${nezmereno.length}):`);
  for (const x of nezmereno) out.push('  ? ' + x);
}
out.push('');
out.push(vady.length
  ? 'VERDIKT: venku NENÍ to, co má být. Co a jak jinak, stojí výš.'
  : 'VERDIKT: venku je to, co má být.');
out.push('');
console.log(out.join('\n'));
if (vady.length) {
  console.log('::error::Nasazený web: ' + vady.length + ' vad. ' + vady.slice(0, 3).join(' | '));
  process.exit(1);
}
