/* ARCHIV NABÍDEK — co se nabízelo, za kolik a jak dlouho.
   ====================================================================
   Spuštění:  node scripts/archiv.mjs              (jeden krok za dnešek)
              node scripts/archiv.mjs --zpetne     (dopočítá z historie gitu)

   PROČ VŮBEC. Web zná jen dnešek: data/opportunities.json se při každém
   běhu robota přepíše celé. Když nabídka zmizí, zůstane po ní náhrobek,
   který se po 90 dnech smaže (DNI_ARCHIV v generate-parcel-pages.mjs) —
   a pak už nikde není, že ten pozemek byl za tolik nabízený od–do.
   Přitom je to jediný údaj o trhu, který tenhle web získává sám a nikdo
   jiný ho takhle nemá: NABÍDKOVÁ CENA A DOBA NA TRHU.

   Ceny v katastru jsou kupní, ale veřejně se k nim takhle nedostaneš.
   Doba, po kterou nabídka visela, než zmizela, je nejbližší veřejný
   odhad toho, jestli byla cena reálná.

   JAK TO UKLÁDÁ. Jeden řádek JSON na jeden řádek souboru (JSONL),
   jeden soubor na měsíc, a NIKDY SE NIC NEPŘEPISUJE. Je to schválně:
     · velké pole v jednom JSON by se při každém přírůstku přepsalo celé
       a git by si pamatoval celou kopii — takhle vidí ten jeden nový
       řádek a repozitář neroste;
     · SQLite ani Parquet do gitu nepatří. Jsou binární, nejdou
       porovnat a každá verze se uloží znovu. Když bude potřeba se
       v archivu dotazovat, vyrobí se z těchhle řádků kdykoli.

   CO JE ŘÁDEK. Uzavřené období, kdy jedna nabídka visela za jednu cenu:
     k  klíč pozemku (místo|parcela|okres|šířka|délka — bez ceny!)
     m  obec, o okres, d druh, t typ nabídky (prodej/dražba/exekuce)
     v  výměra m², c cena Kč
     od, do  první a naposled viděna (YYYY-MM-DD)
     proc  'zmizela' (ze zdroje) nebo 'cena' (změnila se, běží dál)

   Klíč NESMÍ obsahovat cenu — jinak by každá sleva vypadala jako nový
   pozemek a doba na trhu by se počítala od nuly. Proto pkey(), ne
   klicNabidky().
   ==================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pkey } from './generate-parcel-pages.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADR = path.join(KOREN, 'data', 'archiv');
const STAV = path.join(ADR, 'stav.json');

/* KLÍČ I ODSTRANĚNÍ DUPLICIT BERE ARCHIV Z TÝCHŽE MODULŮ JAKO WEB.
   Kdyby si to tu počítal po svém, archiv by si pamatoval něco jiného,
   než co web ukazuje — a to je právě ten druh rozdílu, který se pozná
   až za rok, kdy už se s tím nedá nic dělat. */
const _req = createRequire(import.meta.url);
const KLIC = _req(path.join(KOREN, 'js', 'klic.js')).PKKlic;
const PKH = _req(path.join(KOREN, 'js', 'hlidani-logika.js'));
const PKC = _req(path.join(KOREN, 'js', 'cisteni.js'));

/* VERZE STAVU. Při změně klíče se stará podoba MUSÍ zahodit, jinak by
   se v jednom souboru potkaly dvě soustavy klíčů: všechno staré by
   vypadalo jako zmizelé a všechno nové jako právě přidané. */
export const VERZE = 2;

export function nactiStav() {
  try {
    const s = JSON.parse(fs.readFileSync(STAV, 'utf8'));
    if (s && s.verze === VERZE) return s;
    /* Starou verzi nejde dopočítat, jen přepočítat z historie gitu
       (node scripts/archiv.mjs --prepocitat). Tiše ji přijmout je
       to nejhorší, co se dá udělat. */
    if (s && s.verze !== VERZE) {
      console.error(`::error::data/archiv/stav.json je verze ${s.verze}, čekám ${VERZE}.`
        + ' Spusťte: node scripts/archiv.mjs --prepocitat');
      process.exit(1);
    }
  } catch (e) { /* není, začíná se od nuly */ }
  return { verze: VERZE, den: '', nabidky: {} };
}

/* Z jedné nabídky udělá to, co si o ní archiv pamatuje. Víc ne: popisy
   ani odkazy do archivu nepatří, jsou cizí a stárnou. */
function zaznam(d) {
  return { c: Math.round(d.price || 0), v: Math.round(d.area || 0),
    m: d.place || '', o: d.okres || '', dr: d.druh || '', t: d.type || '' };
}

/* JEDEN KROK: stav + dnešní nabídky → nový stav a uzavřené řádky.
   Čistá funkce, aby se dala zkoušet bez souborů i bez gitu. */
export function krok(stav, nabidky, den) {
  /* NEJDŘÍV DUPLICITY, PAK KLÍČ — a obojí tak, jak to dělá web.
     Dřív tu stálo `if (!zive.has(pkey(d))) zive.set(...)` s poznámkou
     „duplicity řeší web jinde; tady platí první". To odstranění duplicit
     opravdu zastávalo, jenže pkey je hrubý: 38 klíčů sedí na 94 nabídek
     a u 25 z nich se liší cena. Dva různé pozemky v jedné vsi tím
     splynuly v jednu nabídku a archiv si podle pořadí v souboru
     zapisoval, že „zlevnila" a zdražila zpátky. Osm ze 138 změn ceny
     takhle vzniklo a nikdy se nestalo.
     Teď duplicity odstraňuje PKHlidani.bezDuplicit (tentýž modul jako
     mapa) a klíč rozlišuje podle adresy inzerátu (PKKlic.klicArchivu). */
  /* POŘADÍ MUSÍ BÝT TOTÉŽ JAKO V APLIKACI: nejdřív PKCisteni.pozemky
     (js/main.js ho volá na načtená data), až potom PKHlidani.bezDuplicit
     (volá ho boot()). Když jsem to zkusil jen přes bezDuplicit nad
     surovými daty, vybralo z dvojice duplicit JINÉHO zástupce než web —
     a protože klíč archivu vychází z adresy inzerátu, sedlo z 131
     historií na nabídky jen 73. Dedup musí být tatáž cesta, ne jen
     tatáž funkce. */
  const cista = PKH.bezDuplicit(PKC.pozemky((nabidky || []).filter((d) => d && d.place && d.okres)));
  const zive = new Map();
  for (const d of cista) {
    const k = KLIC.klicArchivu(d);
    if (!zive.has(k)) zive.set(k, d);
  }
  const novy = { verze: VERZE, den, nabidky: {} };
  const uzavrene = [];

  for (const [k, d] of zive) {
    const z = zaznam(d);
    const byl = stav.nabidky[k];
    if (!byl) {
      /* first_seen ze zdroje je lepší než dnešek — nabídka mohla viset
         dřív, než ji tenhle archiv poprvé uviděl. Dopředu se ale věřit
         nedá: datum v budoucnosti se zahodí. */
      const od = (typeof d.first_seen === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.first_seen)
        && d.first_seen <= den) ? d.first_seen : den;
      novy.nabidky[k] = Object.assign({ od, videno: den }, z);
      continue;
    }
    if (byl.c !== z.c) {
      uzavrene.push({ k, m: byl.m, o: byl.o, dr: byl.dr, t: byl.t,
        v: byl.v, c: byl.c, od: byl.od, do: byl.videno, proc: 'cena' });
      novy.nabidky[k] = Object.assign({ od: den, videno: den }, z);
      continue;
    }
    novy.nabidky[k] = Object.assign({ od: byl.od, videno: den }, z);
  }

  for (const k of Object.keys(stav.nabidky)) {
    if (zive.has(k)) continue;
    const byl = stav.nabidky[k];
    uzavrene.push({ k, m: byl.m, o: byl.o, dr: byl.dr, t: byl.t,
      v: byl.v, c: byl.c, od: byl.od, do: byl.videno, proc: 'zmizela' });
  }
  return { stav: novy, uzavrene };
}

export function pripoj(uzavrene) {
  if (!uzavrene.length) return 0;
  fs.mkdirSync(ADR, { recursive: true });
  const podle = new Map();
  for (const r of uzavrene) {
    const mes = r.do.slice(0, 7);
    if (!podle.has(mes)) podle.set(mes, []);
    podle.get(mes).push(JSON.stringify(r));
  }
  for (const [mes, radky] of podle) {
    fs.appendFileSync(path.join(ADR, mes + '.jsonl'), radky.join('\n') + '\n');
  }
  return uzavrene.length;
}

function nabidkyZe(text) {
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : (j.opportunities || []);
  } catch (e) { return null; }
}

function dnes() { return new Date().toISOString().slice(0, 10); }

/* ZPĚTNÝ DOPOČET. Robot commituje data/opportunities.json při každém
   běhu, takže historie trhu v repozitáři JE — jen se v ní nedá hledat.
   Tohle ji projde odzadu dopředu a udělá z ní archiv. Běží jen tehdy,
   když archiv ještě neexistuje; jinak by řádky přibyly podruhé. */
function zpetne({ prepocitat = false } = {}) {
  if (prepocitat && fs.existsSync(ADR)) {
    /* Maže se jen to, co tenhle skript sám vyrábí. */
    for (const f of fs.readdirSync(ADR)) {
      if (f.endsWith('.jsonl') || f === 'stav.json') fs.unlinkSync(path.join(ADR, f));
    }
    console.log('Archiv smazán, počítá se znovu z historie gitu.');
  }
  const log = execFileSync('git', ['log', '--reverse', '--format=%H %ad', '--date=short',
    '--', 'data/opportunities.json'], { cwd: KOREN, encoding: 'utf8', maxBuffer: 1 << 28 });
  /* POSLEDNÍ OTISK DNE, NE PRVNÍ. Komentář výš to slibuje („stačí
     poslední stav dne"), kód ale bral první: podmínka `den ===
     posledniDen` přeskočila všechny další commity téhož dne. Robot
     běží čtyřikrát denně a zdroje blikají — podle prvního běhu dne
     vypadala nabídka, která se do večera vrátila, jako zmizelá. */
  const radky = (function () {
    const posledni = new Map();
    for (const r of log.trim().split('\n').filter(Boolean)) {
      const i = r.indexOf(' ');
      posledni.set(r.slice(i + 1), r);          // --reverse: poslední zápis dne vyhraje
    }
    return [...posledni.values()];
  }());
  let stav = { verze: VERZE, den: '', nabidky: {} };
  let celkem = 0, pouzito = 0, posledniDen = '';
  for (const r of radky) {
    const [sha, den] = r.split(' ');
    if (den === posledniDen) continue;      // víc běhů za den: stačí poslední stav dne
    let text;
    try { text = execFileSync('git', ['show', sha + ':data/opportunities.json'],
      { cwd: KOREN, encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { continue; }
    const n = nabidkyZe(text);
    if (!n || !n.length) continue;
    const v = krok(stav, n, den);
    stav = v.stav;
    celkem += pripoj(v.uzavrene);
    pouzito++; posledniDen = den;
  }
  fs.writeFileSync(STAV, JSON.stringify(stav, null, 1));
  console.log(`Zpětný dopočet: ${pouzito} dnů z ${radky.length} otisků, uzavřeno ${celkem} období, `
    + `sledovaných nabídek ${Object.keys(stav.nabidky).length}.`);
}

function krokDneska() {
  const n = nabidkyZe(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  if (!n || !n.length) { console.log('Archiv: data/opportunities.json je prázdný, nic se nedělá.'); return; }
  const stav = nactiStav();
  const den = dnes();
  if (stav.den === den) { console.log('Archiv: dnešek už je započítaný, nic se nedělá.'); return; }
  const v = krok(stav, n, den);
  const pocet = pripoj(v.uzavrene);
  fs.mkdirSync(ADR, { recursive: true });
  fs.writeFileSync(STAV, JSON.stringify(v.stav, null, 1));
  console.log(`Archiv: ${Object.keys(v.stav.nabidky).length} živých nabídek, `
    + `uzavřeno ${pocet} období (${v.uzavrene.filter((x) => x.proc === 'zmizela').length} zmizelo, `
    + `${v.uzavrene.filter((x) => x.proc === 'cena').length} změnilo cenu).`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prepocitat = process.argv.includes('--prepocitat');
  if (prepocitat || process.argv.includes('--zpetne')) zpetne({ prepocitat }); else krokDneska();
}
