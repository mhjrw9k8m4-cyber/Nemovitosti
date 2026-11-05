/* Test: klíč, který zná jen zkouška
   ==================================================================
   Spuštění: node scripts/test-pouziti-klicu.mjs   (bez sítě, bez prohlížeče)

   PROČ TENHLE HLÍDAČ VZNIKL (§438, poučení z §436).

   §434 zavedl pravidlo „adresa, která vede na jinou domenu, se
   přepíše na zkoušený host". Bylo prokázané sabotáží — tři kontroly
   ze tří — a přesto bylo v produkci MRTVÉ od první minuty, protože
   volání v `zkusPortal()` vypadalo takhle:

       dalsiCesty({ tvar: nalez.tvar, telo }, { … })

   Zkouška přitom volala `dalsiCesty({ tvar, telo, adresa }, …)`.
   Klíč `adresa` tedy znala JEN zkouška; produkce ho neposílala, a tak
   se celé pravidlo nemělo o co opřít. Vada se našla až ostrým během
   na cizí web, po osmi zbytečných dotazech na cizí host.

   CO TENHLE SOUBOR MĚŘÍ. Projde `scripts/*.mjs`, u každé NAŠÍ vyvezené
   funkce posbírá klíče, které se jí předávají v objektovém literálu —
   zvlášť pro každou POZICI argumentu — a srovná zkoušky s produkcí.
   Klíč, který posílá jen zkouška, je podezřelý: zkouška měří tvar,
   se kterým se naostro nikdy nejede.

   Není to hádání: spuštěno na stavu repozitáře PŘED opravou §436
   (commit ecfa671147) tenhle hlídač hlásí přesně
       dalsiCesty#0: zkouška navíc [adresa] / produkce [tvar, telo]
   tedy tu vadu, která nás stála ostrý běh.

   CO NEVIDÍ, ať se to neplete. Vidí jen objektové LITERÁLY. Když
   produkce poskládá volby do proměnné a pošle `dalsiCesty(nalez,
   volby)`, hlídač o těch klíčích neví a tu pozici přeskočí — mlčí,
   netvrdí, že je to v pořádku. Taky nerozlišuje, ze kterého modulu
   funkce téhož jména je; jmenná kolize by se projevila jako falešný
   nález, ne jako slepé místo.
   ================================================================== */
import { readdirSync, readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const DIR = new URL('./', import.meta.url);
const jeZkouska = (f) => /^test-/.test(f);

/* --- CO SMÍ ZNÁT JEN ZKOUŠKA -------------------------------------
   Každý řádek je volba s rozumnou výchozí hodnotou, kterou produkce
   ZÁMĚRNĚ nechává být — ne zapomenutý klíč. Kdo sem přidá řádek,
   napíše proč; prázdný důvod je pád stejně jako chybějící řádek. */
export const SMI_JEN_ZKOUSKA = {
  'cileZkouseni#0': {
    kandidati: 'zkouška podstrčí svůj registr; naostro se bere KANDIDATI z výchozí hodnoty',
    zapojene: 'totéž pro seznam už zapojených zdrojů (ZAPOJENE)',
  },
  'stahni#1': {
    cekaniNasobek: 'zkrácení pauz mezi pokusy, aby zkouška nestála minuty; naostro se čeká naplno',
  },
  'dalsiCesty#1': {
    vzor: 'zkouška si vynutí jeden tvar cesty, aby měřila jeden krok; naostro se berou všechny',
  },
  'cestyProPortal#1': {
    strop: 'zkouška si strop zvedá i snižuje, aby změřila mez; naostro platí STROP_CEST',
  },
};

/* --- ČTENÍ VOLÁNÍ ------------------------------------------------- */
export function vyvezeneFunkce(soubory, cti) {
  const ven = new Set();
  for (const f of soubory) {
    if (jeZkouska(f)) continue;
    for (const m of cti(f).matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/g)) ven.add(m[1]);
  }
  return ven;
}

/* Klíče objektových literálů v argumentech volání dané funkce.
   Čte se znak po znaku, protože argument může obsahovat řetězec se
   závorkou i zanořený objekt — regulární výraz by na tom uklouzl. */
export function kliceVolani(text, jmena) {
  const ven = [];
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(text))) {
    const jmeno = m[1];
    if (!jmena.has(jmeno)) continue;
    let i = re.lastIndex, hloubka = 1, arg = '', args = [], vRetezci = null;
    while (i < text.length && hloubka > 0) {
      const c = text[i];
      if (vRetezci) { if (c === vRetezci && text[i - 1] !== '\\') vRetezci = null; arg += c; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { vRetezci = c; arg += c; i++; continue; }
      if ('([{'.includes(c)) hloubka++;
      if (')]}'.includes(c)) hloubka--;
      if (hloubka === 0) break;
      if (c === ',' && hloubka === 1) { args.push(arg); arg = ''; i++; continue; }
      arg += c; i++;
    }
    args.push(arg);
    args.forEach((a, poz) => {
      const s = a.trim();
      if (!s.startsWith('{') || !s.endsWith('}')) return;
      /* I tady se hlídají řetězce, ne jen závorky: `{ a: ')' , b: 2 }`
         by se bez toho přečetlo jako jediný klíč `a` (změřeno — tuhle
         vadu našla zkouška stroje pár řádků níž, ne úvaha). */
      const klice = [];
      let h = 0, kus = '', vR = null, pred = '';
      for (const c of s.slice(1, -1)) {
        if (vR) { if (c === vR && pred !== '\\') vR = null; kus += c; pred = c; continue; }
        if (c === '"' || c === "'" || c === '`') { vR = c; kus += c; pred = c; continue; }
        if ('([{'.includes(c)) h++;
        if (')]}'.includes(c)) h--;
        if (c === ',' && h === 0) { if (kus.trim()) klice.push(kus); kus = ''; pred = c; continue; }
        kus += c; pred = c;
      }
      if (kus.trim()) klice.push(kus);
      const jm = klice.map((k) => {
        const t = k.trim(); const dv = t.indexOf(':');
        const n = (dv > 0 ? t.slice(0, dv) : t).trim();
        return /^[A-Za-z_$][\w$]*$/.test(n) ? n : null;
      }).filter(Boolean);
      if (jm.length) ven.push({ jmeno, poz, klice: jm });
    });
  }
  return ven;
}

/* Srovnání: co posílá zkouška a produkce ne. Pozice, kterou produkce
   s literálem nevolá vůbec, se PŘESKOČÍ (viz „co nevidí" výš). */
export function kliceJenVeZkousce(soubory, cti) {
  const jmena = vyvezeneFunkce(soubory, cti);
  const zk = new Map(), pr = new Map();
  for (const f of soubory) {
    const kam = jeZkouska(f) ? zk : pr;
    for (const v of kliceVolani(cti(f), jmena)) {
      const k = `${v.jmeno}#${v.poz}`;
      if (!kam.has(k)) kam.set(k, new Set());
      for (const x of v.klice) kam.get(k).add(x);
    }
  }
  const ven = [];
  for (const [k, kliceZk] of zk) {
    if (!pr.has(k)) continue;
    const kliceP = pr.get(k);
    const chybi = [...kliceZk].filter((x) => !kliceP.has(x));
    if (chybi.length) ven.push({ misto: k, chybi, produkce: [...kliceP] });
  }
  return ven.sort((a, b) => a.misto.localeCompare(b.misto));
}

/* --- MĚŘENÍ ------------------------------------------------------- */
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* 1) SÁM STROJ. Změří se na vymyšleném kousku kódu, aby se vědělo, že
      nález dole není náhoda ani ticho. */
{
  const vzorky = {
    'modul.mjs': `export function pravidlo(nalez, { strop = 3 } = {}) { return nalez.adresa; }
      export function jine(a) { return a; }
      pravidlo({ tvar: 'JSON', telo: t }, { strop: 9 });`,
    'test-modul.mjs': `pravidlo({ tvar: 'JSON', telo: t, adresa: 'https://a.cz' }, { strop: 1 });`,
  };
  const cti = (f) => vzorky[f];
  const soubory = Object.keys(vzorky);

  je('najde naše vyvezené funkce', [...vyvezeneFunkce(soubory, cti)].sort(), ['jine', 'pravidlo']);
  je('najde klíč, který posílá jen zkouška', kliceJenVeZkousce(soubory, cti), [
    { misto: 'pravidlo#0', chybi: ['adresa'], produkce: ['tvar', 'telo'] },
  ]);

  const bezVady = { ...vzorky, 'modul.mjs': vzorky['modul.mjs'].replace('telo: t }', 'telo: t, adresa: a }') };
  je('a když produkce klíč posílá, mlčí', kliceJenVeZkousce(soubory, (f) => bezVady[f]), []);

  /* Pozice, kterou produkce volá jen proměnnou, se přeskočí — a je to
     napsané nahoře, aby se ticho nepletlo se zelenou. */
  const sPromennou = {
    'modul.mjs': 'export function f(a, b) { return a; }\nf(nalez, volby);',
    'test-modul.mjs': 'f({ x: 1 }, { y: 2 });',
  };
  je('pozici bez literálu v produkci přeskočí',
    kliceJenVeZkousce(Object.keys(sPromennou), (f) => sPromennou[f]), []);

  const sZavorkou = kliceVolani("pravidlo({ a: ')', b: 2 });", new Set(['pravidlo']));
  pravda('řetězec se závorkou nerozhodí čtení argumentů',
    sZavorkou.length === 1 && sZavorkou[0].klice.join(',') === 'a,b', JSON.stringify(sZavorkou));
}

/* 2) SKUTEČNÝ REPOZITÁŘ. Co není v seznamu „smí jen zkouška", je vada
      §436-třídy: zkouška měří tvar, se kterým se naostro nejede. */
{
  const soubory = readdirSync(DIR).filter((f) => f.endsWith('.mjs'));
  const cti = (f) => readFileSync(new URL('./' + f, import.meta.url), 'utf8');
  const nalez = kliceJenVeZkousce(soubory, cti);

  pravda(`stroj má na čem měřit (${soubory.length} souborů, ${nalez.length} míst s rozdílem)`,
    soubory.length > 50 && nalez.length > 0,
    'nula míst s rozdílem by znamenala, že se nečte, ne že je čisto');

  const neomluvene = [];
  for (const n of nalez) {
    const smi = SMI_JEN_ZKOUSKA[n.misto] || {};
    for (const k of n.chybi) {
      if (!smi[k] || !String(smi[k]).trim()) {
        neomluvene.push(`${n.misto} → ${k} (produkce posílá [${n.produkce.join(', ')}])`);
      }
    }
  }
  pravda('žádný klíč nezná jen zkouška', neomluvene.length === 0,
    neomluvene.length
      ? 'Tohle zkouška posílá a produkce ne — buď to produkce poslat MÁ (to je vada'
        + ' jako §436), nebo je to volba se zdůvodněním do SMI_JEN_ZKOUSKA:\n      '
        + neomluvene.join('\n      ')
      : '');

  /* Seznam výjimek se taky hlídá: řádek, ke kterému už žádný rozdíl
     není, je mrtvý a patří pryč, ať se v něm neschová budoucí vada. */
  const zive = new Set(nalez.map((n) => n.misto));
  const mrtve = Object.keys(SMI_JEN_ZKOUSKA).filter((m) => !zive.has(m));
  pravda('v seznamu výjimek nezůstal mrtvý řádek', mrtve.length === 0,
    'tyhle výjimky už nic neomlouvají, patří ze SMI_JEN_ZKOUSKA pryč: ' + mrtve.join(', '));

  for (const [misto, klice] of Object.entries(SMI_JEN_ZKOUSKA)) {
    for (const [k, duvod] of Object.entries(klice)) {
      pravda(`výjimka ${misto} → ${k} má napsaný důvod`,
        !!String(duvod || '').trim() && String(duvod).length > 25, 'důvod chybí nebo je prázdný');
    }
  }
}

console.log('Klíč, který zná jen zkouška (§438)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Použití klíčů: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
