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
import { pkey } from './generate-parcel-pages.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADR = path.join(KOREN, 'data', 'archiv');
const STAV = path.join(ADR, 'stav.json');

export function nactiStav() {
  try { return JSON.parse(fs.readFileSync(STAV, 'utf8')); }
  catch (e) { return { verze: 1, den: '', nabidky: {} }; }
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
  const zive = new Map();
  for (const d of nabidky || []) {
    if (!d || !d.place || !d.okres) continue;
    const k = pkey(d);
    if (!zive.has(k)) zive.set(k, d);     // duplicity řeší web jinde; tady platí první
  }
  const novy = { verze: 1, den, nabidky: {} };
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
function zpetne() {
  const log = execFileSync('git', ['log', '--reverse', '--format=%H %ad', '--date=short',
    '--', 'data/opportunities.json'], { cwd: KOREN, encoding: 'utf8', maxBuffer: 1 << 28 });
  const radky = log.trim().split('\n').filter(Boolean);
  let stav = { verze: 1, den: '', nabidky: {} };
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
  if (process.argv.includes('--zpetne')) zpetne(); else krokDneska();
}
