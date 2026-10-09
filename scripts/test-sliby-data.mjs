// Test: co web slibuje o DATECH, to taky dělá.
//
// Spuštění: node scripts/test-sliby-data.mjs   (nepotřebuje prohlížeč)
//
// Sourozenec scripts/test-sliby.mjs hlídá sliby, které jsou vidět na
// vykreslené stránce, a potřebuje k tomu prohlížeč. Tenhle hlídá sliby
// o nakládání s daty, a ty se dají ověřit ze zdroje — proto zvlášť.
//
// V zásadách soukromí stálo „Účet a uložené pozemky běží zatím jen ve vašem
// prohlížeči (localStorage). Nic se neodesílá na server." Byla to pravda —
// a zestárla: web mezitím dostal účty, hlídání, inzeráty i zprávy, takže
// js/auth.js volá auth/v1/signup a v databázi je devět tabulek.
// Vedle toho stálo „Žádné reklamní ani sledovací skripty třetích stran",
// zatímco 2 006 stránek načítalo značku analytiky.
//
// Takovou nepravdu nepozná žádný z ostatních testů: kontrast, odstíny ani
// rozvržení se neptají, jestli text mluví pravdu. A u slibu o cizích
// osobních údajích je to ta nejdražší chyba, jakou web může mít — dražší
// než kterákoli vada vzhledu.
//
// Pravidlo je proto obrácené než obvykle: NEHLÍDÁ SE KÓD, HLÍDÁ SE TEXT.
// Ke každému absolutnímu slibu patří skutečnost, kterou jde změřit.
import { readFileSync, readdirSync } from 'node:fs';
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

const main = readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8');

// --- Text zásad soukromí vytáhnout z INFO.soukromi -------------------
const odkud = main.indexOf('soukromi: {');
const pokud = main.indexOf('podminky: {', odkud);
/* KOMENTÁŘE PRYČ. U každé opravené věty stojí v kódu vysvětlivka, která
   cituje, co tam bylo dřív — a tenhle test by ji našel jako živý text
   a hlásil nepravdu, která už tam není. Přesně to se při psaní stalo. */
const text = (odkud >= 0 && pokud > odkud ? main.slice(odkud, pokud) : '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/[^\n]*$/gm, ' ');
pravda('zásady soukromí se v js/main.js našly', text.length > 400,
  `nalezeno ${text.length} znaků — změnil se název bloku INFO.soukromi?`);

// --- Skutečnost 1: posílá web něco na server? ------------------------
const jsSoubory = readdirSync(path.join(KOREN, 'js')).filter((f) => f.endsWith('.js'));
const vsechenJs = jsSoubory.map((f) => readFileSync(path.join(KOREN, 'js', f), 'utf8')).join('\n');
const volaUcty = /auth\/v1\/(signup|token|user|recover)/.test(vsechenJs);
const volaData = /rest\/v1\//.test(vsechenJs);
pravda('web opravdu volá server (jinak tenhle test nic nehlídá)',
  volaUcty && volaData,
  `účty ${volaUcty}, data ${volaData} — pokud web server opustil, patří sem jiný slib`);

// Absolutní popření odesílání nesmí stát v textu, když se odesílá.
const popiraOdesilani = /[Nn]ic se neodesílá na server/.test(text);
pravda('text netvrdí „nic se neodesílá na server", když web volá účty',
  !(popiraOdesilani && volaUcty),
  'v zásadách stojí, že se nic neodesílá, ale js volá auth/v1 — jedno z toho je nepravda');

// A naopak: když se odesílá, text to musí říct.
pravda('text přiznává, že s účtem jdou data na server',
  !volaUcty || /na server/.test(text.replace(/[Nn]ic se neodesílá na server/g, '')),
  'web má účty, ale zásady o odesílání na server mlčí');

// --- Skutečnost 2: načítá web cizí nebo měřicí značku? ---------------
const htmlSoubory = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const MERICI = /(_vercel\/insights|google-analytics|googletagmanager|plausible|matomo|hotjar|clarity\.ms|segment\.com)/;
const sMerenim = htmlSoubory.filter((f) =>
  MERICI.test(readFileSync(path.join(KOREN, f), 'utf8')));
const tvrdiBezSkriptu = /[Žž]ádné[^<]{0,40}(sledovací|měřicí|analytické)[^<]{0,20}skripty/.test(text);
pravda('text netvrdí „žádné sledovací skripty", když je stránky načítají',
  !(tvrdiBezSkriptu && sMerenim.length > 0),
  `měřicí značku nese ${sMerenim.length} stránek (např. ${sMerenim.slice(0, 2).join(', ')}), `
  + 'a zásady přitom tvrdí, že žádné takové skripty nejsou');

// --- Skutečnost 3: co zůstává v prohlížeči, to ať text jmenuje -------
const klice = [...vsechenJs.matchAll(/'(pk_[a-z0-9_]+)'/g)].map((m) => m[1]);
pravda('web si v prohlížeči opravdu něco ukládá (jinak nemá co slibovat)',
  new Set(klice).size >= 5, `nalezeno klíčů: ${new Set(klice).size}`);
pravda('text zmiňuje, že část věcí zůstává jen v prohlížeči',
  /localStorage|ve vašem prohlížeči/.test(text),
  'zásady o místním úložišti mlčí, přestože web používá ' + new Set(klice).size + ' klíčů');

// --- Skutečnost 4: slib o GDPR a kontaktu ----------------------------
pravda('text říká, jak uplatnit práva podle GDPR',
  /GDPR/.test(text) && /(výmaz|opravu|přístup)/.test(text),
  'v zásadách chybí poučení o právech');

console.log('\nSliby o datech — co web tvrdí, to taky dělá');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${jsSoubory.length} skriptů, ${htmlSoubory.length} ručních stránek, `
  + `měřicí značka na ${sMerenim.length} z nich`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sliby o datech: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
