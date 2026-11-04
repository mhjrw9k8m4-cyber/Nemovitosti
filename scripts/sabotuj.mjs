#!/usr/bin/env node
/* SABOTÁŽNÍ STROJ — AŤ SI HLÍDAČE PROKÁŽE STROJ SÁM
   ==================================================================
   Spuštění:
     node scripts/sabotuj.mjs test-uzsvm.mjs        prokáže jednu zkoušku
     node scripts/sabotuj.mjs --strop=3 test-…      nejvýš tři sabotáže
     node scripts/sabotuj.mjs --vypis test-…        jen vypíše, co by zkusil

   PROČ. Pravidlo z CLAUDE.md je jasné: každý nový hlídač se prokáže
   SABOTÁŽÍ — rozbije se měřená věc a hlídač to musí chytit. Dělal jsem
   to ručně a §369 ukázal, co to stojí: dvě sabotáže byly PRÁZDNÉ
   (záplata se nenašla, soubor se nezměnil) a já si je odškrtl jako
   „hlídač nedrží". Zeleně přitom svítilo něco, co se nikdy nezměřilo.

   Dnes se to stalo ještě dvakrát jinak: sabotáž proběhla, soubor se
   změnil — a zkouška přesto prošla, protože měla slepé místo (fixtura
   bez adresy rozhodovala místo verdiktu; vyřazení zapojených zdrojů má
   dvě větve a měřila se jedna). Obojí je nález o ZKOUŠCE, ne o kódu.

   Tenhle stroj dělá týž postup, jen bez mojí nepozornosti:
     1. vybere soubor, který zkouška hlídá (podle jejích importů),
     2. vyrobí seznam MECHANICKÝCH sabotáží (obrátí porovnání, zahodí
        pojistku, posune konstantu, zruší `filter(Boolean)`, zamění
        `&&` za `||`),
     3. každou zvlášť zapíše, OVĚŘÍ DIFFEM, že se soubor opravdu
        změnil, pustí zkoušku a soubor vrátí z gitu,
     4. zapíše, co zkouška chytila a co ne.

   CO NEUMÍ A NEPŘEDSTÍRÁ. Mechanická sabotáž není promyšlená: nerozumí
   tomu, co kód znamená, takže umí vyrobit i nesmysl, který spadne na
   syntaxi (to se počítá jako „nepoužitelná", ne jako „chycená").
   Nenahrazuje sabotáž promyšlenou — ukazuje SLEPÁ MÍSTA: hlídače,
   kteří nechytí ani obrácené porovnání, a to je nález sám pro sebe.

   ŠEST POJISTEK, PROTOŽE TENHLE STROJ PÍŠE DO ZDROJE:
     1. Jen `scripts/*.mjs` a `js/*.js`. Nikdy data, nikdy generované
        stránky, nikdy workflow.
     2. Jen nad ČISTÝM souborem. Když má soubor rozdělanou změnu,
        sabotáž se nespustí — jinak by se vracelo cizí.
     3. Vrací se z gitu (`git show HEAD:soubor`), ne z paměti.
     4. Po každé sabotáži se ověří, že soubor je zpátky bitově shodný.
     5. Nikdy sám v sobě: značka v prostředí, ať se stroj nepustí
        ve zkoušce, kterou sám pouští.
     6. Časový limit na zkoušku; co nedoběhne, je „nerozhodnuto", ne
        „chycená".
   ================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const UVNITR = 'SABOTUJ_UVNITR';
export const CAS_LIMIT_MS = 300000;
export const STROP_SABOTAZI = 4;

/* ------------------------------------------------------------------
   KATALOG SABOTÁŽÍ. Každá je { jmeno, najdi, nahrad, proc }. `najdi`
   je regulární výraz; bere se PRVNÍ výskyt, aby byla změna malá a
   srozumitelná.
   ------------------------------------------------------------------ */
export const SABOTAZE = [
  { jmeno: 'obrácené porovnání (>= na >)', najdi: /\s>=\s/, nahrad: ' > ',
    proc: 'Mez o jeden stupeň: hlídač s mezí „aspoň" nesmí projít s „víc než".' },
  { jmeno: 'obrácené porovnání (<= na <)', najdi: /\s<=\s/, nahrad: ' < ',
    proc: 'Táž mez z druhé strany.' },
  { jmeno: 'obrácená rovnost (=== na !==)', najdi: /\s===\s/, nahrad: ' !== ',
    proc: 'Rovnost obráceně je nejhrubší vada, jakou kód může mít.' },
  { jmeno: 'zahozená pojistka (if … continue)', najdi: /\n\s*if \([^\n]{3,120}\) \{? ?continue; ?\}?\n/,
    nahrad: '\n', proc: 'Krok, který něco zahazuje, se vypne — hlídač to má poznat.' },
  { jmeno: 'zahozený filter(Boolean)', najdi: /\.filter\(Boolean\)/, nahrad: '',
    proc: 'Prázdné hodnoty projdou dál (přesně vada z dnešní prázdné distribuce).' },
  { jmeno: 'a místo nebo (&& na ||)', najdi: /\s&&\s/, nahrad: ' || ',
    proc: 'Podmínka, která měla platit celá, stačí napůl.' },
  { jmeno: 'posunutá konstanta (+1)', najdi: /=\s(\d{1,6});/, nahrad: null,
    proc: 'Číslo v kódu o jedničku jinak: mez, strop ani počet se nesmí dát posunout bez povšimnutí.' },
];

/* Kandidáti pro jeden soubor: co z katalogu se na něj vůbec dá použít. */
export function kandidatiSabotazi(telo, katalog = SABOTAZE) {
  const ven = [];
  for (const s of (katalog || [])) {
    const m = String(telo || '').match(s.najdi);
    if (!m) continue;
    let nahrad = s.nahrad;
    if (nahrad === null) {
      /* Posunutá konstanta: hodnota se dopočítá z nálezu. */
      const cislo = Number(m[1]);
      if (!isFinite(cislo)) continue;
      nahrad = '= ' + (cislo + 1) + ';';
    }
    ven.push({ jmeno: s.jmeno, proc: s.proc, najdi: s.najdi, nahrad, ukazka: m[0].trim().slice(0, 80) });
  }
  return ven;
}

/* Co ta zkouška vlastně hlídá: její importy z vlastního kódu. Bere se
   první, který není zkouška ani pomůcka — a schválně se nehádá: když
   zkouška nic takového neimportuje, vrací se nic a sabotáž se nedělá. */
export const POMOCNE = /^(chyby-hlaska|zkouska-|pomocne|falesn)/;

export function coHlidá(teloZkousky) {
  const ven = [];
  for (const m of String(teloZkousky || '').matchAll(/from '\.\/([a-z0-9-]+\.mjs)'/g)) {
    const f = m[1];
    if (/^test-/.test(f) || POMOCNE.test(f)) continue;
    if (!ven.includes('scripts/' + f)) ven.push('scripts/' + f);
  }
  for (const m of String(teloZkousky || '').matchAll(/['"`]\.\.\/(js\/[a-z0-9.-]+\.js)['"`]/g)) {
    if (!ven.includes(m[1])) ven.push(m[1]);
  }
  return ven;
}

/* ROVNOCENNÁ MUTACE — SABOTÁŽ, KTERÁ NEMŮŽE NIC ZMĚNIT.
   ==================================================================
   Některou mechanickou mutaci nechytí ŽÁDNÁ zkouška, protože nemění
   výsledek. Naměřený případ (scripts/archiv.mjs): v
   `first_seen <= den ? first_seen : den` dá obrácení na `<` pro
   first_seen rovné dnešku tentýž den — obě varianty vracejí `den`.
   Taková mutace není slepé místo zkoušky, je to mutace bez následku.

   A PROČ TO NENECHAT PROSTĚ ČERVENÉ. Protože falešný nález je drahý
   jinak než chybějící: učí člověka hlášení nečíst, a tím zabije
   i nálezy, které pravdivé jsou (§375). Hlášení, ve kterém dvě
   položky navždy svítí „NECHYTILA" a nedá se s nimi nic udělat, je
   přesně tenhle případ.

   TŘI POJISTKY, ABY SE TÍM NEDALO JEN MLČET:
     1. Prohlášení stojí U KÓDU, ne ve stroji ani v seznamu vedle —
        prochází tedy stejnou revizí jako ten řádek, kterého se týká.
     2. Musí JMENOVAT sabotáž přesně tak, jak ji stroj jmenuje, takže
        se nedá napsat „tenhle soubor nehlídáme".
     3. Musí nést DŮVOD aspoň o `MIN_DUVOD` znacích. Když chybí nebo je
        krátký, prohlášení se neuzná a položka zůstane „NECHYTILA" —
        plus se připíše, že důvod chybí.
   Rovnocenné mutace se v hlášení VYPISUJÍ (znakem „="), nezmizí.
   ================================================================== */
export const ZNACKA_ROVNOCENNE = 'ROVNOCENNÁ SABOTÁŽ:';
export const MIN_DUVOD = 60;

export function rovnocenna(telo, jmenoSabotaze) {
  const jm = String(jmenoSabotaze || '');
  if (!jm) return null;
  for (const r of String(telo || '').split('\n')) {
    const i = r.indexOf(ZNACKA_ROVNOCENNE);
    if (i < 0) continue;
    const zbytek = r.slice(i + ZNACKA_ROVNOCENNE.length).trim();
    if (zbytek.slice(0, jm.length) !== jm) continue;
    const duvod = zbytek.slice(jm.length).replace(/^[\s—-]+/, '').replace(/\*\/\s*$/, '').trim();
    if (duvod.length < MIN_DUVOD) {
      return { jmeno: jm, duvod: '', kratky: true };
    }
    return { jmeno: jm, duvod };
  }
  return null;
}

/* NA ČEM SE ZKOUŠKA SOUDÍ NEJDŘÍV.
   `coHlidá` vrací VŠECHNY moduly, které si zkouška importuje — a to je
   v pořádku pro hledání, ne pro soud. Naměřeno 4. 11.: `test-uzsvm`
   dostala do seznamu i `cti-nabidky-statu.mjs`, odkud si půjčuje dvě
   funkce (čtení výměry a druhu), a slepé místo v CIZÍM modulu se
   připsalo JÍ — přitom ten modul má vlastní zkoušku
   (`test-nabidky-statu`), která ho hlídá.
   Soudit zkoušku za cizí modul je falešný nález (§375) z třetí strany:
   neříká nepravdu o kódu, ale o tom, KDO má co opravit.
   Pořadí proto dává dopředu modul, podle kterého je zkouška
   pojmenovaná: `test-uzsvm.mjs` → `cti-uzsvm.mjs`. Jméno se hledá
   oběma směry (zkouška `test-archiv` hlídá `archiv.mjs`, zkouška
   `test-uzsvm` modul `cti-uzsvm.mjs`), a půjčené moduly zůstávají
   v seznamu za ním — jen se na ně dojde, až když zbude strop. */
export function poradiCilu(zkouska, cile) {
  const jmeno = String(zkouska || '').replace(/^test-/, '').replace(/\.mjs$/, '');
  if (!jmeno) return (cile || []).slice();
  const skore = (c) => {
    const zaklad = String(c).replace(/^.*\//, '').replace(/\.(mjs|js)$/, '');
    if (zaklad === jmeno) return 0;                       // archiv.mjs ↔ test-archiv
    if (zaklad.endsWith('-' + jmeno) || zaklad.endsWith(jmeno)) return 1;   // cti-uzsvm ↔ test-uzsvm
    if (jmeno.endsWith(zaklad)) return 2;
    return 3;                                             // půjčený modul
  };
  return (cile || []).slice().sort((a, b) => skore(a) - skore(b));
}

export function smiSabotovat(cesta) {
  const c = String(cesta || '');
  if (/\.\./.test(c)) return false;
  if (/^js\/min\//.test(c)) return false;              // generované
  return /^scripts\/[a-z0-9-]+\.mjs$/.test(c) || /^js\/[a-z0-9.-]+\.js$/.test(c);
}

/* ------------------------------------------------------------------
   ŽIVÁ ČÁST: zapsat, ověřit diffem, pustit zkoušku, vrátit z gitu.
   ------------------------------------------------------------------ */
function git(args) {
  return execFileSync('git', args, { cwd: KOREN, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

export function cistySoubor(cesta) {
  try { return git(['status', '--porcelain', '--', cesta]).trim() === ''; }
  catch { return false; }
}

export function vratZGitu(cesta) {
  const z = git(['show', 'HEAD:' + cesta]);
  writeFileSync(join(KOREN, cesta), z);
}

export function zmenilSe(cesta) {
  try { return git(['diff', '--numstat', '--', cesta]).trim() !== ''; }
  catch { return false; }
}

export async function prokazZkousku(zkouska, { strop = STROP_SABOTAZI, casLimit = CAS_LIMIT_MS, vypis = false } = {}) {
  const cestaZkousky = 'scripts/' + zkouska;
  let teloZkousky = '';
  try { teloZkousky = readFileSync(join(KOREN, cestaZkousky), 'utf8'); }
  catch { return { zkouska, chyba: 'zkoušku nejde přečíst' }; }
  const cile = poradiCilu(zkouska, coHlidá(teloZkousky).filter(smiSabotovat));
  if (!cile.length) {
    return { zkouska, hlidá: [], sabotaze: [],
      poznamka: 'zkouška neimportuje nic z našeho kódu — mechanická sabotáž tu nemá co rozbít' };
  }
  const vysledky = [];
  for (const cil of cile) {
    if (vysledky.length >= strop) break;
    if (!cistySoubor(cil)) {
      vysledky.push({ cil, jmeno: '—', stav: 'nelze', proc: 'soubor má rozdělanou změnu' });
      continue;
    }
    const puvodni = readFileSync(join(KOREN, cil), 'utf8');
    const kand = kandidatiSabotazi(puvodni);
    for (const k of kand) {
      if (vysledky.length >= strop) break;
      if (vypis) { vysledky.push({ cil, jmeno: k.jmeno, stav: 'vypis', ukazka: k.ukazka }); continue; }
      /* 1) zapsat */
      writeFileSync(join(KOREN, cil), puvodni.replace(k.najdi, k.nahrad));
      /* 2) OVĚŘIT DIFFEM — bez tohohle kroku sabotáž nic nedokazuje (§369) */
      const opravduZmeneno = zmenilSe(cil);
      let stav = 'neznámo', vystup = '';
      if (!opravduZmeneno) {
        stav = 'prázdná';
      } else {
        try {
          execFileSync(process.execPath, [cestaZkousky], {
            cwd: KOREN, encoding: 'utf8', timeout: casLimit,
            env: Object.assign({}, process.env, { [UVNITR]: '1' }),
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          /* Zkouška prošla nad rozbitým kódem. Buď je to slepé místo —
             nebo mutace, která nic nezměnila a kód to u sebe přiznává
             (viz ROVNOCENNÁ MUTACE výš). Rozhoduje prohlášení
             v původním, NEsabotovaném těle. */
          const rov = rovnocenna(puvodni, k.jmeno);
          if (rov && !rov.kratky) { stav = 'rovnocenná'; k.proc = rov.duvod; }
          else if (rov && rov.kratky) {
            stav = 'NECHYTILA';
            k.proc = 'u kódu je prohlášení o rovnocenné mutaci, ale bez důvodu aspoň o '
              + MIN_DUVOD + ' znacích — neuznává se';
          } else stav = 'NECHYTILA';
        } catch (e) {
          const kod = e && e.status;
          vystup = String((e && (e.stdout || '')) || '').slice(-400);
          if (e && e.killed) stav = 'nerozhodnuto';
          else if (kod === 1) stav = 'chytila';
          else stav = 'nepoužitelná';   // spadlo na syntaxi, ne na kontrole
        }
      }
      /* 3) vrátit z gitu a 4) ověřit, že je soubor zpátky */
      vratZGitu(cil);
      const vraceno = readFileSync(join(KOREN, cil), 'utf8') === puvodni;
      vysledky.push({ cil, jmeno: k.jmeno, proc: k.proc, ukazka: k.ukazka, stav, vraceno,
        vystup: stav === 'NECHYTILA' ? '' : vystup.split('\n').slice(-2).join(' ') });
      if (!vraceno) {
        return { zkouska, hlidá: cile, sabotaze: vysledky,
          chyba: `soubor ${cil} se nevrátil do původní podoby — zastavuji` };
      }
    }
  }
  const chytila = vysledky.filter((v) => v.stav === 'chytila').length;
  const nechytila = vysledky.filter((v) => v.stav === 'NECHYTILA').length;
  const rovnocenne = vysledky.filter((v) => v.stav === 'rovnocenná').length;
  /* ŽÁDNÝ KANDIDÁT NENÍ VÝSLEDEK, NE MLČENÍ. Naměřeno na prvním běhu
     smyčky: `scripts/rozbal-hledani.mjs` má 2 146 znaků a není v něm
     ani jedno `>=`, `===`, `if … continue`, `filter(Boolean)` ani
     konstanta — mechanická sabotáž tam nemá co rozbít. Bez téhle věty
     by hlášení vypsalo jen hlavičku a vypadalo to na vadu stroje. */
  if (!vysledky.length) {
    return { zkouska, hlidá: cile, sabotaze: [], chytila: 0, nechytila: 0,
      poznamka: 'v hlídaném kódu není co mechanicky rozbít — žádný tvar z katalogu se v něm'
        + ' nevyskytuje; promyšlená sabotáž tu zůstává na člověku' };
  }
  return { zkouska, hlidá: cile, sabotaze: vysledky, chytila, nechytila, rovnocenne };
}

export function hlaseniProkazu(v) {
  if (!v) return [];
  if (v.chyba) return [`${v.zkouska}: ${v.chyba}`];
  if (v.poznamka) return [`${v.zkouska}: ${v.poznamka}`];
  const radky = [`${v.zkouska} hlídá ${v.hlidá.join(', ')}`];
  for (const s of v.sabotaze) {
    const znak = s.stav === 'chytila' ? '✓'
      : (s.stav === 'NECHYTILA' ? '✕' : (s.stav === 'rovnocenná' ? '=' : '·'));
    radky.push(`  ${znak} ${s.stav.padEnd(13)} ${s.jmeno}  (${s.cil})`);
    if (s.stav === 'NECHYTILA' || s.stav === 'rovnocenná') radky.push(`        ${s.proc}`);
  }
  if (v.rovnocenne) {
    radky.push(`  ${v.rovnocenne} mutace nemůže nic změnit a kód to u sebe přiznává (viz důvod výš).`);
  }
  if (v.nechytila) {
    radky.push(`  SLEPÉ MÍSTO: ${v.nechytila} sabotáží zkouška nechytila — a to je nález o zkoušce.`);
  }
  return radky;
}

async function main() {
  if (process.env[UVNITR] === '1') {
    console.log('Sabotážní stroj se nepouští sám v sobě.');
    return;
  }
  const vypis = process.argv.includes('--vypis');
  const strop = (() => {
    const a = process.argv.find((x) => x.startsWith('--strop='));
    const n = a ? parseInt(a.slice(8), 10) : NaN;
    return isFinite(n) && n > 0 ? n : STROP_SABOTAZI;
  })();
  const zkouska = process.argv.slice(2).find((a) => /^test-[a-z0-9-]+\.mjs$/.test(a));
  if (!zkouska) {
    console.error('Řekněte, kterou zkoušku prokázat: node scripts/sabotuj.mjs test-uzsvm.mjs');
    process.exit(2);
  }
  const v = await prokazZkousku(zkouska, { strop, vypis });
  for (const r of hlaseniProkazu(v)) console.log(r);
  if (v.chyba) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Sabotáž spadla:', e && e.message ? e.message : e); process.exit(1); });
}
