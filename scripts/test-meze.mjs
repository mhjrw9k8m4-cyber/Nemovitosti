// Test: platí v prohlížeči a na serveru TYTÉŽ meze?
//
// Spuštění: node scripts/test-meze.mjs   (bez prohlížeče, zlomek vteřiny)
//
// Proč: js/kontrola.js má v hlavičce slib — „Kontroly v prohlížeči jsou
// rychlá zpětná vazba pro poctivého člověka; kdo chce, obejde je. Tvrdá
// hranice je vždycky na serveru (create_listing v supabase/)." Ten slib
// dlouho neplatil: server kontroloval obec, polohu, vulgarity a spam, ale
// o výměře ani ceně nevěděl nic. Kdo poslal rovnou do RPC, uložil pozemek
// o nulové výměře za korunu — a na mapě byl.
//
// Teď tam meze jsou. Jenže dvě kopie téhož čísla se dřív nebo později
// rozejdou (na tomhle webu už se to stalo u cen i u rad), a rozejdou se
// tiše: prohlížeč odmítne, server pustí, nebo naopak člověk dostane
// nesrozumitelnou chybu z databáze. Tenhle test je drží u sebe.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const MEZE = createRequire(import.meta.url)(path.join(KOREN, 'js', 'kontrola.js')).MEZE;
const sql = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
/* Čte se ze sloučeného 00-vse.sql — to je soubor, který se opravdu pouští
   v Supabase. Kdyby se změnil jen zdrojový kousek a zapomnělo se sloučit,
   tohle by to ukázalo. */
/* POSLEDNÍ definice, ne první. Sloučený soubor vznikl z několika
   migrací a create_listing se v něm předefinovává; v Postgresu platí ta
   poslední. Test čtený od první by hlídal verzi, která na serveru
   nakonec neběží — a mlčel by přesně tehdy, kdy nemá. */
const ZNACKA = 'create or replace function create_listing';
const vytvor = sql.slice(sql.lastIndexOf(ZNACKA));
const telo = vytvor.slice(0, vytvor.indexOf('$$;'));
pravda(`create_listing se ve sloučeném SQL najde (${(sql.match(/create or replace function create_listing/g) || []).length}× předefinované, platí poslední)`,
  sql.includes(ZNACKA) && telo.length > 500 && telo.includes('begin'),
  `nalezeno ${telo.length} znaků — test by jinak nic neměřil`);

// Každá mez z prohlížeče musí v těle funkce stát jako číslo.
const PARY = [
  ['vymeraMin', MEZE.vymeraMin], ['vymeraMax', MEZE.vymeraMax],
  ['cenaMin', MEZE.cenaMin], ['cenaMax', MEZE.cenaMax],
  ['perM2Min', MEZE.perM2Min], ['perM2Max', MEZE.perM2Max],
];
for (const [jmeno, hodnota] of PARY) {
  const je = new RegExp('(^|[^\\d])' + hodnota + '([^\\d]|$)').test(telo);
  pravda(`mez ${jmeno} (${hodnota}) platí i na serveru`, je,
    `v create_listing se číslo ${hodnota} nevyskytuje — prohlížeč a server se rozešly`);
}

// A pole, která prohlížeč vyžaduje, musí server vyžadovat taky.
for (const [pole, hlaska] of [['obec', 'obec je povinná'], ['okres', 'okres je povinný'], ['poloha', 'poloha je povinná']]) {
  pravda(`server vyžaduje ${pole}`, telo.includes(hlaska),
    `v create_listing chybí „${hlaska}" — v prohlížeči je to povinné, na serveru ne`);
}

/* Že se kontroluje i POMĚR, ne jen obě čísla zvlášť. Přidaná nula v ceně
   projde obě meze zvlášť a teprve Kč/m² ji prozradí. */
pravda('server hlídá i cenu za m², ne jen obě čísla zvlášť',
  /p_price[^;]*\/\s*p_area/.test(telo),
  'v create_listing se cena za m² nepočítá');

console.log('\nMeze v prohlížeči a na serveru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Meze: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
