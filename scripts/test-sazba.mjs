// Test: jednoznaková slova nesmí zůstat na konci řádku.
//
// Spuštění: node scripts/test-sazba.mjs   (bez prohlížeče)
//
// České sazečské pravidlo: po jednoznakové předložce nebo spojce (a, i,
// k, o, s, u, v, z) se sází nezlomitelná mezera, aby to slovo nezůstalo
// samo na konci řádku. Na úzkém telefonu se to stane snadno a je to
// první věc, které si na textu všimne každý, kdo kdy sázel.
//
// PROČ ZKOUŠKA, KDYŽ SE TO TU DODRŽUJE. Právě proto. Změřeno na všech
// 2163 stránkách: 20 840× je nezlomitelná mezera správně a obyčejná
// jen jednou (ochrana-udaju.html, „e-mail a (zašifrované) heslo").
// Pravidlo tedy na tomhle webu platí skoro absolutně — a takové se dá
// uhlídat, aniž by zkouška otravovala planými nálezy. Bez ní se bude
// rozpadat po jedné větě při každé úpravě textu.
//
// MĚŘÍ SE JEN VIDITELNÝ TEXT. Skripty, styly a komentáře jdou pryč;
// značka se nahradí nulovým bajtem, ne mezerou, aby „</b> i <b>"
// nevypadalo jako předložka s mezerou, a naopak aby se nespojila dvě
// slova ze dvou značek.
//
// VELKÁ PÍSMENA SE NEHLÍDAJÍ: „Část A — Vlastník" je označení oddílu
// listu vlastnictví, ne předložka, a nezlomitelnou mezeru mít nemá.
//
// DRUHÉ PRAVIDLO TÉŽE SAZBY: česká uvozovka se musí zavřít česky.
// Změřeno 14. 10.: text otevíral správně „ (U+201E), ale ZAVÍRAL
// ROVNOU " — 52 párů z 63, správně jen deset. „Obvyklá" cena,
// „Cena do", „jak stojí a leží". Čtenář to nepojmenuje, ale vidí:
// levá uvozovka je dole a vpravo visí kolmá čárka jako z psacího
// stroje. Jedno místo to zavíralo dokonce entitou (`&quot;`), což
// vypadá v prohlížeči stejně a ve zdroji se hledá jinak.
// Zavírá se teď v kroku sazby, takže to platí i pro 2 102 vyrobených
// stránek a pro text, který teprve někdo napíše.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const viditelny = (s) => s
  .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
  .replace(/<!--[\s\S]*?-->/g, ' ')
  .replace(/<[^>]+>/g, '\0');

const stranky = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
let spravne = 0; const spatne = [];
for (const f of stranky) {
  const t = viditelny(readFileSync(path.join(ROOT, f), 'utf8'));
  for (const m of t.matchAll(/(?<![\wÀ-ž])([aikosuvz])( | )(?=[\wÀ-ž(„])/g)) {
    if (m[2] === ' ') spravne++;
    else spatne.push(`${f}: …${t.slice(Math.max(0, m.index - 34), m.index + 36).replace(/\0/g, '|').replace(/\s+/g, ' ').trim()}…`);
  }
}

/* ---- uvozovky ---- */
let uvozPary = 0; const uvozVadne = []; const uvozNepar = [];
for (const f of stranky) {
  const t = viditelny(readFileSync(path.join(ROOT, f), 'utf8'));
  /* Vadný pár: otevírací „ a pak rovná uvozovka (znak nebo entita),
     a mezi nimi žádná jiná uvozovka. \0 je zbytek po značce, uvnitř
     citace běžně stojí odkaz nebo zvýraznění. */
  for (const m of t.matchAll(/\u201e(?:(?!\u201e|\u201c|")[\s\S])*?(?:"|&quot;)/g)) {
    uvozVadne.push(`${f}: …${m[0].replace(/\0/g, '|').replace(/\s+/g, ' ').slice(0, 70)}…`);
  }
  const o = (t.match(/\u201e/g) || []).length;
  const z = (t.match(/\u201c/g) || []).length;
  uvozPary += Math.min(o, z);
  if (o !== z) uvozNepar.push(`${f}: otevíracích ${o}, zavíracích ${z}`);
}

/* ---- čísla, datumy, § a zkratka čísla ----
   Zlom uprostřed čísla nebo datumu je tatáž vada jako předložka na
   konci řádku, jen hůř se o ní mluví: čtenář vidí „2" a o řádek níž
   „000 Kč" a cenu si musí slepit sám. Změřeno 14. 10. v prohlížeči na
   22 stránkách a dvou šířkách (8 042 řádků): jedenáct rozlomených
   datumů na nove-pozemky.html při 390 px, jedna cena a jeden
   „zákon č. / 480/2004". */
let tisiceOk = 0, datumOk = 0, paragrafOk = 0;
const tisiceSpatne = [], datumSpatne = [], paragrafSpatne = [], cisloSpatne = [];
for (const f of stranky) {
  /* Entita je totéž co znak; kdyby se někde objevila, nesmí se počítat
     jako obyčejná mezera. */
  const t = viditelny(readFileSync(path.join(ROOT, f), 'utf8')).replace(/&nbsp;/g, '\u00a0');
  const kousek = (i) => `${f}: …${t.slice(Math.max(0, i - 28), i + 30).replace(/\0/g, '|').replace(/\s+/g, ' ').trim()}…`;
  tisiceOk += (t.match(/\d\u00a0\d{3}/g) || []).length;
  datumOk += (t.match(/\d{1,2}\.\u00a0\d{1,2}\./g) || []).length;
  paragrafOk += (t.match(/§\u00a0\d/g) || []).length;
  /* Před první skupinou nesmí stát číslice ani nezlomitelná mezera —
     „2026 123" jsou dvě čísla, ne jedno rozlomené. */
  for (const m of t.matchAll(/(?<![\d\u00a0])\d{1,3} \d{3}(?!\d)/g)) tisiceSpatne.push(kousek(m.index));
  for (const m of t.matchAll(/\d{1,2}\. (?=\d{1,2}\.[ \u00a0]|\d{4}(?!\d))/g)) datumSpatne.push(kousek(m.index));
  for (const m of t.matchAll(/§ \d/g)) paragrafSpatne.push(kousek(m.index));
  /* Zkratka „Kč." je konec věty za cenou, ne zkratka čísla. */
  for (const m of t.matchAll(/(?<![0-9A-Za-zÁ-Žá-ž])č\. \d/g)) cisloSpatne.push(kousek(m.index));
}

/* Předpoklady. Bez nich by „žádná obyčejná mezera" mohla být pravda
   o prázdnu — třeba kdyby se rozbilo čištění značek nebo seznam
   stránek. Obojí se mi už jednou povedlo. */
pravda(`stránek je z čeho brát (${stranky.length})`, stranky.length >= 2000,
  'našlo se jen ' + stranky.length);
pravda(`a nezlomitelné mezery se opravdu našly (${spravne})`, spravne >= 5000,
  'nalezeno jen ' + spravne + ' — čištění značek nebo hledání je rozbité');
pravda('po žádné jednoznakové předložce nestojí obyčejná mezera', spatne.length === 0,
  spatne.slice(0, 8).join('\n      ') + (spatne.length > 8 ? `\n      … a dalších ${spatne.length - 8}` : ''));

pravda(`a uvozovek je z čeho brát (${uvozPary} párů)`, uvozPary >= 20,
  `nalezeno jen ${uvozPary} — čištění značek nebo hledání je rozbité`);
pravda('žádná česká uvozovka se nezavírá rovnou', uvozVadne.length === 0,
  uvozVadne.slice(0, 6).join('\n      ') + (uvozVadne.length > 6 ? `\n      … a dalších ${uvozVadne.length - 6}` : ''));
pravda('a na žádné stránce nezůstala uvozovka nepárová', uvozNepar.length === 0,
  uvozNepar.slice(0, 6).join('\n      '));

pravda(`a čísel, datumů a paragrafů je z čeho brát (${tisiceOk} / ${datumOk} / ${paragrafOk})`,
  tisiceOk >= 1000 && datumOk >= 200 && paragrafOk >= 200,
  `čísel ${tisiceOk}, datumů ${datumOk}, paragrafů ${paragrafOk}`
  + ' — na tolika stránkách to má být víc, hledání nebo čištění je rozbité');
pravda('žádné číslo se neláme uprostřed tisíců', tisiceSpatne.length === 0,
  tisiceSpatne.slice(0, 6).join('\n      ') + (tisiceSpatne.length > 6 ? `\n      … a dalších ${tisiceSpatne.length - 6}` : ''));
pravda('žádné datum se neláme mezi dnem, měsícem a rokem', datumSpatne.length === 0,
  datumSpatne.slice(0, 6).join('\n      ') + (datumSpatne.length > 6 ? `\n      … a dalších ${datumSpatne.length - 6}` : ''));
pravda('a za § ani za zkratkou čísla nestojí obyčejná mezera',
  paragrafSpatne.length === 0 && cisloSpatne.length === 0,
  [...paragrafSpatne.slice(0, 3), ...cisloSpatne.slice(0, 3)].join('\n      '));

console.log('\nSazba — zlom řádku na špatném místě a uvozovky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Sazba: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
