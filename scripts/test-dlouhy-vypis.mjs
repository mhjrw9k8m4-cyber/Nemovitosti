// Test: dlouhý výpis okresu se složí, ale nic se z něj neztratí.
//
// Spuštění: node scripts/test-dlouhy-vypis.mjs   (bez prohlížeče)
//
// NALEZENO MĚŘENÍM. Okresní stránka vypisovala všechny nabídky okresu.
// Okres Hodonín jich má 114 a karta měří 417 px, takže stránka byla
// 52 744 px vysoká — dvaašedesát obrazovek telefonu — a nadpisy
// „Prohlédněte si okres na mapě" (50 468 px) a „Kde je v okrese nabídek
// nejvíc" (50 739 px) stály tam, kam se nikdo nedoroluje. Z 77 okresů
// má 31 přes pětadvacet nabídek a sedm přes padesát.
//
// Zkrátit seznam ale nejde: u Hodonína by se zahodilo 54 odkazů na
// stránky pozemků, a ty jsou pro vyhledávač cesta dovnitř webu. Zbytek
// se proto skládá do <details> — obsah zůstává v HTML, čte ho odečítač
// i vyhledávač a nepotřebuje to řádek skriptu.
//
// Po změně: 14 391 px místo 52 744, mapa na 12 116 px místo 50 468.
//
// CO SE HLÍDÁ — a hlavně to první:
//   1. ŽÁDNÁ NABÍDKA SE NEZTRATILA (počet karet i odkazů sedí na data),
//   2. ovladač je tam, kde má být, a není tam, kde by nic neskrýval,
//   3. rozbalených karet je přesně tolik, kolik se slíbilo,
//   4. číslo v ovladači souhlasí se skutečným zbytkem.
//
// SAMO SKLÁDÁNÍ SE TU NEMĚŘÍ, protože ho dělá prohlížeč, ne náš kód.
// Ověřeno ručně v Chromiu na okrese Hodonín: zavřené <details> → 24
// viditelných karet a stránka 14 391 px, otevřené → 114 karet
// a 52 442 px. Pozor při takovém měření na past, do které jsem spadl:
// `getBoundingClientRect().height > 0` uvnitř zavřeného <details> VRACÍ
// nenulovou výšku (Chromium tam používá content-visibility a layout
// zůstane poslední známý), takže to vypadalo, jako by se nic neskládalo.
// Spolehlivé je `el.checkVisibility()`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const MEZ = 24;   // ROZBALENO_V_OKRESE v scripts/generate-region-pages.mjs
const soubory = fs.readdirSync(KOREN).filter((f) => /^pozemky-okres-.*\.html$/.test(f));
pravda('okresní stránky se našly', soubory.length > 50, `je jich ${soubory.length}`);

let sOvladacem = 0, bezOvladace = 0;
const chybne = [];
for (const f of soubory) {
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
  const karet = (h.match(/class="okr-item/g) || []).length;
  const det = h.match(/<details class="okr-vic"><summary>([^<]*)<\/summary>/);
  if (!det) {
    bezOvladace++;
    /* Bez ovladače smí být jen krátký výpis. Mez je „mez + 4": ovladač,
       který skrývá jednu kartu, je horší než ta karta. */
    if (karet > MEZ + 4) chybne.push(`${f}: ${karet} karet a žádný ovladač`);
    continue;
  }
  sOvladacem++;
  const pred = h.split('<details class="okr-vic">')[0];
  const rozbalenych = (pred.match(/class="okr-item/g) || []).length;
  if (rozbalenych !== MEZ) chybne.push(`${f}: rozbalených ${rozbalenych}, čekalo se ${MEZ}`);
  const slib = Number(String(det[1]).replace(/[^\d]/g, ''));
  if (slib !== karet - MEZ) chybne.push(`${f}: ovladač slibuje ${slib}, zbývá ${karet - MEZ}`);
}
pravda('na dlouhých výpisech ovladač je a na krátkých ne', chybne.length === 0,
  chybne.slice(0, 3).join(' | '));
pravda('a oboje se opravdu vyskytlo (jinak se neměří nic)',
  sOvladacem > 0 && bezOvladace > 0, `s ovladačem ${sOvladacem}, bez ${bezOvladace}`);

/* A TEĎ TO HLAVNÍ: nic se neztratilo. Počet karet na stránce okresu se
   porovná s tím, co je v datech — ne s jiným místem na stránce. */
const data = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const PKH = (await import('node:module')).createRequire(import.meta.url)(
  path.join(KOREN, 'js', 'hlidani-logika.js'));
const cisto = PKH.bezDuplicit(data.opportunities || []);
const poOkresech = {};
for (const o of cisto) poOkresech[o.okres] = (poOkresech[o.okres] || 0) + 1;
const neshody = [];
let porovnano = 0;
for (const f of soubory) {
  /* NEZLOMITELNÁ MEZERA. Krok sazby sází „v okrese" s mezerou 160, ne 32,
     takže vzor s obyčejnou mezerou se nechytil VŮBEC — a tahle kontrola,
     ta nejdůležitější z celé zkoušky, tiše neměřila nic. Našlo se to až
     sabotáží: po zahození zbytku výpisu zůstala zelená. Mezery se proto
     nejdřív srovnají; repozitář tuhle past má popsanou u test-cerstvost. */
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8').replace(/\u00a0/g, ' ');
  const karet = (h.match(/class="okr-item/g) || []).length;
  const nazev = (h.match(/<h1[^>]*>Pozemky v okrese ([^.<]+)\.?<\/h1>/) || [])[1];
  if (!nazev) { neshody.push(`${f}: z nadpisu se nedal přečíst název okresu`); continue; }
  const ma = poOkresech[nazev.trim()] || 0;
  if (!ma) { neshody.push(`${f}: okres „${nazev.trim()}" v datech není`); continue; }
  porovnano++;
  if (karet !== ma) neshody.push(`${f}: na stránce ${karet}, v datech ${ma}`);
}
pravda('na stránce je tolik nabídek, kolik jich okres v datech má',
  neshody.length === 0, neshody.slice(0, 3).join(' | '));
/* A pojistka proti tomu, aby kontrola výš zase tiše nic neměřila. */
pravda('a porovnal se přitom skoro každý okres', porovnano >= soubory.length - 2,
  `porovnáno ${porovnano} ze ${soubory.length}`);

/* Složené karty musí zůstat odkazy — kdyby se místo nich vypsal jen text,
   přišel by web o cestu dovnitř. */
{
  const nejdelsi = soubory
    .map((f) => ({ f, n: (fs.readFileSync(path.join(KOREN, f), 'utf8').match(/class="okr-item/g) || []).length }))
    .sort((a, b) => b.n - a.n)[0];
  const h = fs.readFileSync(path.join(KOREN, nejdelsi.f), 'utf8');
  const zbytek = h.split('<div class="okr-vic-list">')[1] || '';
  const odkazu = (zbytek.match(/href="pozemek-[^"]+\.html"/g) || []).length;
  pravda(`ve složené části nejdelšího výpisu (${nejdelsi.f}) zůstaly odkazy`,
    odkazu >= nejdelsi.n - MEZ - 2, `odkazů ${odkazu}, karet ve zbytku ${nejdelsi.n - MEZ}`);
  zpravy.push(`  · naměřeno: ${soubory.length} okresů, nejdelší ${nejdelsi.n} nabídek`
    + ` (${sOvladacem} stránek má ovladač, ${bezOvladace} ne)`);
}

console.log('\nDlouhý výpis okresu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Dlouhý výpis: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
