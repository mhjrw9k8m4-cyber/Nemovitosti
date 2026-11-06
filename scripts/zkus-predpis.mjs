#!/usr/bin/env node
/* OSTRÝ POKUS S PŘEDPISEM — kolik celých nabídek z výpisu doopravdy vyjde.
 * ===================================================================
 * Spuštění: node scripts/zkus-predpis.mjs [host]
 *           (výchozí host: verejnedrazby.cz)
 *
 * PROČ TOHLE NEDĚLÁ NIC JINÉHO. Sonda zdrojů (scripts/sonda-zdroju.mjs)
 * odpovídá ANO/NE na otázku „má smysl se tím webem zabývat". Ohledání
 * (scripts/ohledej.mjs) vypíše, co na stránce je. Bot (zkus-portal.mjs)
 * hledá, KDE výpis vůbec je. Ani jedno nepustí PŘEDPIS a neřekne to
 * jediné, podle čeho se dá rozhodnout o zapojení: kolik nabídek
 * z výpisu vyjde CELÝCH — s cenou, výměrou i odkazem.
 *
 * NIC NEZAPISUJE. Výstup je jen v logu běhu; co s ním, rozhoduje
 * člověk. Zapojení zdroje je krok navíc a dělá se zvlášť.
 *
 * ŠETRNOST A ROBOTS.TXT. Čte se nejvýš tolik stránek, kolik má předpis
 * ve `stropStranek`, mezi dotazy se čeká PAUZA_MS a robots.txt se ptá
 * PRVNÍ — když nedovoluje nebo se nedá přečíst, nestáhne se nic a
 * napíše se proč. Žádné obcházení, žádná druhá hlavička.
 * =================================================================== */
import { PREDPISY, kategorieZNazvu, podilZNazvu } from './predpisy-zdroju.mjs';
import { zZaznamu, bezZnacek } from './cteni-zdroje.mjs';
import { smimeCist } from './robots.mjs';
import { BOT_UA } from './bot-ua.mjs';

const PAUZA_MS = 2000;
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

const host = (process.argv[2] || 'verejnedrazby.cz').replace(/^www\./i, '').toLowerCase();
const predpis = PREDPISY[host];
if (!predpis) {
  console.log(`Pro ${host} předpis není. Co máme: ${Object.keys(PREDPISY).join(', ') || '(nic)'}`);
  process.exit(0);
}

const { stahni } = await import('./fetch-opportunities.mjs');
const mezipamet = new Map();

const adresaStranky = (i) => {
  const d = predpis.dalsiStranky;
  return (!i || !d) ? predpis.vypis : predpis.vypis + d.parametr + (i * d.krok);
};

console.log(`\nOSTRÝ POKUS S PŘEDPISEM — ${predpis.jmeno} (${host})`);
console.log(`výpis: ${predpis.vypis}`);

/* ROBOTS.TXT PRVNÍ. Není to formalita: když nedovoluje, končíme tady. */
let r;
try { r = await smimeCist(predpis.vypis, { stahni, ua: BOT_UA, mezipamet }); }
catch (e) { r = { dovoleno: false, duvod: 'robots.txt: ' + (e && e.message || e) }; }
console.log(`robots.txt: ${r.dovoleno ? 'DOVOLUJE' : 'NEDOVOLUJE'}${r.duvod ? ' — ' + r.duvod : ''}`);
if (!r.dovoleno) {
  console.log('Nečte se nic. Tohle není vada předpisu ani důvod to obcházet.');
  process.exit(0);
}

const stropStranek = (predpis.dalsiStranky && predpis.dalsiStranky.stropStranek) || 1;
let prvniHtml = '';
let posledniHtml = null;
const vse = [];
const poStrankach = [];
for (let i = 0; i < stropStranek; i++) {
  const adr = adresaStranky(i);
  let html = '';
  try {
    const odp = await stahni(adr, { casLimit: 20000, pokusy: 1 });
    html = odp && typeof odp.text === 'function' ? await odp.text() : String((odp && odp.text) || '');
  } catch (e) {
    poStrankach.push({ adr, bajtu: 0, nasel: 0, proc: 'spadlo: ' + (e && e.message || e) });
    if (i + 1 < stropStranek) await spi(PAUZA_MS);
    continue;
  }
  const n = zZaznamu(html, adr, predpis);
  if (i === 0) prvniHtml = html;
  if (html) posledniHtml = { adr, html };
  poStrankach.push({ adr, bajtu: html.length, nasel: n.length });
  vse.push(...n);
  if (i + 1 < stropStranek) await spi(PAUZA_MS);
}

console.log('\nPO STRÁNKÁCH:');
for (const s of poStrankach) {
  console.log(`  ${String(s.nasel).padStart(3)} nabídek  ${String(s.bajtu).padStart(7)} B  ${s.adr}`
    + (s.proc ? '  — ' + s.proc : ''));
}

/* Duplicity: stránkování se umí překrývat a týž záznam pak přijde
   dvakrát. Páruje se evidenčním číslem, takže se to pozná jistě. */
const podleCisla = new Map();
for (const n of vse) if (n.cislo && !podleCisla.has(n.cislo)) podleCisla.set(n.cislo, n);
const jedinecne = [...podleCisla.values()];

const cele = jedinecne.filter((x) => x.cena > 0 && x.vymera > 0 && x.odkaz);
const podily = jedinecne.filter((x) => podilZNazvu(x.nazev));

const podleKategorie = new Map();
for (const x of jedinecne) {
  const k = kategorieZNazvu(x.nazev);
  const klic = k ? `${k.kategorie} / ${k.druh}` : '(nepoznáno)';
  podleKategorie.set(klic, (podleKategorie.get(klic) || 0) + 1);
}

console.log('\nCO Z TOHO JE:');
console.log(`  záznamů celkem      ${vse.length}`);
console.log(`  jedinečných         ${jedinecne.length}  (duplicit ${vse.length - jedinecne.length})`);
console.log(`  s cenou             ${jedinecne.filter((x) => x.cena > 0).length}`);
console.log(`  s výměrou           ${jedinecne.filter((x) => x.vymera > 0).length}`);
console.log(`  s odkazem           ${jedinecne.filter((x) => x.odkaz).length}`);
console.log(`  CELÝCH (vše troje)  ${cele.length}`);
console.log(`  z toho podíly       ${podily.length}  (cena je za zlomek, výměra celá)`);

/* PODLE STAVU AUKCE (§455). Tohle je číslo, podle kterého se
   o zapojení rozhoduje: výpis vede i skončené dražby a ty na web
   nepatří — kdo si otevře „Prodáno", je obelhaný. Zajímá tedy, kolik
   zůstane CELÝCH A ŽIVÝCH, ne kolik je celých. */
const zivy = (predpis.zivyStav || null);
const podleStavu = new Map();
for (const x of jedinecne) podleStavu.set(x.stav || '(bez stavu)', (podleStavu.get(x.stav || '(bez stavu)') || 0) + 1);
console.log('\nPODLE STAVU AUKCE:');
for (const [k, n] of [...podleStavu.entries()].sort((a, b) => b[1] - a[1])) {
  const znak = zivy ? (zivy.includes(k) ? ' ← na web patří' : '') : '';
  console.log(`  ${String(n).padStart(3)}  ${k}${znak}`);
}
if (zivy) {
  const ziveCele = cele.filter((x) => zivy.includes(x.stav));
  const ziveNemovitosti = ziveCele.filter((x) => x.kategorie && x.kategorie !== 'jiné');
  console.log(`\n  CELÝCH A ŽIVÝCH          ${ziveCele.length}`);
  console.log(`  z toho nemovitostí       ${ziveNemovitosti.length}  ← tolik by web dostal`);
}

console.log('\nPODLE KATEGORIE:');
for (const [k, n] of [...podleKategorie.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(3)}  ${k}`);
}

/* UKÁZKA, NE JEN POČTY. Čísla můžou souhlasit a obsah být nesmysl —
   proto se vypíše pět celých nabídek tak, jak by šly na web. */
console.log('\nUKÁZKA (prvních 5 celých):');
for (const x of cele.slice(0, 5)) {
  const k = kategorieZNazvu(x.nazev);
  console.log(`  [${x.cislo}] ${k ? k.druh : '?'} · ${x.vymera} m² · ${x.cena} Kč`);
  console.log(`      ${x.nazev.slice(0, 120)}`);
  console.log(`      ${x.odkaz}`);
}

/* NEZAŘAZENÉ JMENOVITĚ. Číslo „31 nepoznáno" se nedá vyšetřit —
   může to být další druh nemovitosti (a pak se o něj přicházíme),
   nebo další cizí věc (a pak se má odložit). Rozhodnout se to dá
   jen tak, že je člověk uvidí. Druhý ostrý pokus 6. 11. na tohle
   narazil a bez výpisu se nedalo pokračovat. */
const nezarazene = jedinecne.filter((x) => !kategorieZNazvu(x.nazev));
console.log(`\nNEZAŘAZENÉ ${nezarazene.length} — jmenovitě (nejvýš 40):`);
for (const x of nezarazene.slice(0, 40)) {
  console.log(`  [${x.cislo || '—'}] ${x.nazev.slice(0, 110)}`);
}

/* SUROVÝ ÚSEK PŘED NÁZVEM. Tohle je jediná cesta, jak poznat, proč
   se do názvu plete něco, co tam nepatří — třetí ostrý pokus 6. 11.
   našel dva "názvy", které začínaly textem filtračního panelu webu
   ("Neprodáno Prodáno Ukončeno Zrušeno Kraj Vybrat vše…"), a desítky,
   které začínaly stavem aukce. Bez surového úseku se nedá rozhodnout,
   jestli je vada v `zacatekZaznamu`, nebo v `konecZaznamu`, a člověk
   by musel hádat. Vypíše se prvních 6 úseků první stránky, zkrácené.
   NIC SE TÍM NEMĚNÍ, je to jen výpis do logu. */
const surove = (html, kolik, co) => {
  if (!html) return;
  const text = bezZnacek(html);
  const re = new RegExp(predpis.konecZaznamu.source, 'g');
  console.log(`\nSUROVÝ ÚSEK — ${co} (prvních ${kolik}, po 260 znacích od konce):`);
  let od = 0, m, i = 0;
  while ((m = re.exec(text)) !== null && i < kolik) {
    const kus = text.slice(od, m.index);
    od = m.index + m[0].length;
    i++;
    console.log(`  [${m[1] || '—'}] …${kus.slice(-260).replace(/\s+/g, ' ').trim()}`);
  }
};
/* PRVNÍ STRÁNKA UKÁŽE JEN ŽIVÉ AUKCE a to je málo: čtvrtý pokus
   6. 11. právě na tom uvízl — vady se dějí u neaktivních záznamů
   („Prodáno", „Ukončeno") a ty jsou až na konci výpisu. Proto se
   vypisuje i poslední načtená stránka. Jeden běh, obojí vidět. */
surove(prvniHtml, 4, 'první stránka');
if (posledniHtml) surove(posledniHtml.html, 6, 'poslední stránka ' + posledniHtml.adr);

/* A CO SE NEPOVEDLO. Bez tohohle by se čtvrtina ztracených nabídek
   schovala za hezké číslo nahoře. */
const nedodelky = jedinecne.filter((x) => !(x.cena > 0 && x.vymera > 0 && x.odkaz));
console.log(`\nNEÚPLNÝCH ${nedodelky.length} — ukázka prvních 5:`);
for (const x of nedodelky.slice(0, 5)) {
  const chybi = [!(x.cena > 0) && 'cena', !(x.vymera > 0) && 'výměra', !x.odkaz && 'odkaz'].filter(Boolean);
  console.log(`  [${x.cislo || '—'}] chybí: ${chybi.join(', ')} · ${x.nazev.slice(0, 100)}`);
}

console.log('\nTohle měření nic nezapojuje. Rozhodnutí patří člověku.');
