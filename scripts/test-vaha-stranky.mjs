#!/usr/bin/env node
/* SKRIPT, KTERÝ NA STRÁNCE NEMÁ NA CO SÁHNOUT
   ==================================================================
   Spuštění: node scripts/test-vaha-stranky.mjs   (nepotřebuje prohlížeč)

   Třináct článkových stránek (kupní smlouva, hypotéka, územní plán, …)
   si bralo js/pridat.js — formulář pro vložení inzerátu. Ze 47 prvků,
   na které ten skript sahá, na nich byl JEDEN: #toast, a ten se zvenčí
   volat nedá, protože modul nic nevyváží. Naměřeno 7 % vykonaných bajtů
   z 57 kB a 16,7 kB po gzipu ke stažení na každé z nich. Nikdo si toho
   nevšiml, protože se tím nic nerozbilo — jen se to stahovalo.

   PROČ SE NEMĚŘÍ POKRYTÍ BAJTŮ, KDYŽ UŽ HO UMÍM ZMĚŘIT. Zkusil jsem to
   a mez na pokrytí je špatný nástroj: js/auth.js má na každé stránce
   12 %, protože se rozběhne až při přihlášení, a js/exif.js 10 %, až
   když někdo přiloží fotku. Z 150 párů skript×stránka nad 5 kB by jich
   mez pod 20 % označila 59 — a většina z nich funguje správně. Nízké
   pokrytí při načtení znamená „čeká", ne „nemá co dělat".

   CO SE TEDY MĚŘÍ. Jestli má skript na stránce VŮBEC NA CO SÁHNOUT:
   posbírají se prvky, které v kódu hledá (getElementById, #id, .trida,
   [data-neco]) a hledají se ve statickém HTML. Tím se rozliší
   „připravený a čeká" od „nemá tu co dělat".

   MEZ JE NAMĚŘENÁ, NE VYMYŠLENÁ — a napoprvé jsem ji měl špatně.
   Napsal jsem pravidlo „musí najít aspoň jeden prvek" a sabotáž ho
   prošla: js/pridat.js totiž jeden prvek najde (#toast), takže zpátky
   na článku o kupní smlouvě by hlídač mlčel. Rozhoduje tedy PODÍL.
   Naměřené podíly u párů, které na svém místě jsou:
     20 %  js/graf-cen.js na cena-pozemku.html  (staví si prvky sám)
     33 %  js/porovnani.js na data.html i porovnani.html
     65 %  js/main.js na index.html
     75 %  a výš  zbytek (46 párů)
   a vyhozený js/pridat.js na článku: 2 % (1 ze 48).
   Mez 10 % tedy leží dvakrát pod nejnižším správným případem a pětkrát
   nad tím vadným. Pod MIN_ZACHYTKU prvků se nesoudí vůbec — z jednoho
   nebo dvou čísel se podíl odvodit nedá.

   DVĚ PASTI, KTERÉ TO MUSÍ UMÍT:
     1. Skript si prvky může VYRÁBĚT SÁM. js/graf-cen.js hledá
        .gc-bublina, .gc-kriz a svg — a všechno to staví do
        [data-graf-cen]. Proto se sbírají i zachytky na data-atributech;
        kdyby to nestačilo, je tu seznam VYJIMKY s napsaným důvodem.
     2. Generovanou stránku NEPOZNÁŠ PODLE JMÉNA. `pozemek-od-obce.html`
        je ručně psaný rádce a při prvním měření mi kvůli vzoru
        `^pozemek-` z hlídače vypadl — přitom byl na tom stejně jako
        ostatní články. Rozlišuje se tedy podle obsahu, touž úvahou
        jako ve scripts/test-predloha.mjs: kopie šablony pozemku nesou
        třídu pz-media.
   ================================================================== */
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
function hotovo() {
  console.log('\nVáha stránky — skripty, které nemají na co sáhnout');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Váha stránky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Výjimky se zapisují s DŮVODEM, ne jen jménem. Prázdný důvod je nález:
   výjimka bez vysvětlení je jen vypnutá kontrola. */
const VYJIMKY = {
  /* PŘEDLOHY NEJSOU STRÁNKY. pozemek.html a predloha.html se nikomu
     neservírují: první je šablona, ze které generátor staví 2 264
     stránek pozemků (prvky s id si do ní dosazuje on, takže ve zdroji
     jich je 3 ze 47 = 6 %), druhá je vzorník vzhledu. Soudit je touž
     mezí jako stránky by znamenalo měřit šablonu podle toho, co v ní
     ještě není. Hlídat je MÁ scripts/test-predloha.mjs, a ten to dělá
     tím, že je srovnává s hotovou stránkou. */
  'js/pozemek.js na pozemek.html': 'šablona generátoru stránek pozemku — prvky do ní dosazuje generátor, ne zdroj',
};

/* Pod třemi zachytky se nesoudí. Skript, který sahá na jeden prvek,
   může mít dobrý důvod ho nemít (odvozuje si ho z adresy, čeká na
   zprávu odjinud) a z jednoho čísla se podíl odvodit nedá. */
const MIN_ZACHYTKU = 3;
/* Mez podílu — odůvodnění v hlavičce. */
const MEZ_PODILU = 10;

function bezKomentaru(t) {
  return t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

/* Zachytky se sbírají Z KÓDU, ne z próz o něm — v komentářích tohohle
   repozitáře stojí jména tříd jako příklady a hlídač by na ně sedl. */
function zachytky(cesta) {
  const k = bezKomentaru(fs.readFileSync(cesta, 'utf8'));
  const S = new Set();
  for (const m of k.matchAll(/getElementById\(\s*'([\w-]+)'/g)) S.add('#' + m[1]);
  for (const m of k.matchAll(/getElementsByClassName\(\s*'([\w-]+)'/g)) S.add('.' + m[1]);
  for (const m of k.matchAll(/querySelector(?:All)?\(\s*'([^']+)'/g)) {
    const s = m[1];
    for (const t of s.matchAll(/#([\w-]+)/g)) S.add('#' + t[1]);
    for (const t of s.matchAll(/\[(data-[\w-]+)/g)) S.add('[' + t[1] + ']');
    if (/^\.[\w-]+$/.test(s)) S.add(s);
  }
  return [...S];
}

function najde(html, z) {
  if (z[0] === '#') return html.includes('id="' + z.slice(1) + '"');
  if (z[0] === '[') return html.includes(z.slice(1, -1));
  return new RegExp('class="[^"]*\\b' + z.slice(1) + '\\b').test(html);
}

/* ---------- ručně psané stránky ---------- */
const RUCNI = (f) => f.endsWith('.html')
  && !f.startsWith('pozemky-okres-') && !f.endsWith('-kraj.html');
const stranky = fs.readdirSync(KOREN).filter(RUCNI).sort().filter((f) => {
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
  return f === 'pozemek.html' || !h.includes('pz-media');   // kopie šablony pozemku ne
});
pravda(`ručně psané stránky se našly (${stranky.length})`, stranky.length >= 20,
  'nalezeno ' + stranky.length + ' — rozlišení generovaných stránek se rozešlo s tím, co generátory píšou');
if (stranky.length < 20) hotovo();

const nalezy = [];
let paru = 0, zachytkuCelkem = 0;
for (const s of stranky) {
  const html = fs.readFileSync(path.join(KOREN, s), 'utf8');
  const skripty = [...new Set([...html.matchAll(/src="js\/min\/([\w-]+)\.js/g)].map((m) => m[1]))];
  for (const jmeno of skripty) {
    const zdroj = path.join(KOREN, 'js', jmeno + '.js');
    if (!fs.existsSync(zdroj)) continue;        // minifikát bez zdroje hlídá test-minifikace
    const z = zachytky(zdroj);
    if (z.length < MIN_ZACHYTKU) continue;
    paru++; zachytkuCelkem += z.length;
    const najdeno = z.filter((x) => najde(html, x)).length;
    const podil = Math.round(najdeno * 100 / z.length);
    if (podil >= MEZ_PODILU) continue;
    const klic = `js/${jmeno}.js na ${s}`;
    if (VYJIMKY[klic] && VYJIMKY[klic].length > 10) continue;
    const bajtu = fs.statSync(zdroj).size;
    nalezy.push(`${klic}: ${podil} % (${najdeno} z ${z.length} prvků), ${bajtu} B zdroje`);
  }
}

/* NEZMĚŘILO-LI SE NIC, JE TO VADA, NE KLID. Kdyby se rozešlo hledání
   skriptů v HTML (jiný tvar cesty, jiná složka), hlídač by beze slova
   zezelenal — a to je přesně ten druh selhání, který se nepozná. */
pravda(`měřeno párů skript×stránka (${paru}) a je co měřit`, paru >= 30,
  'posouzeno jen ' + paru + ' párů — hledání skriptů v HTML se rozešlo se skutečností');
pravda(`zachytků se z kódu posbíralo dost (${zachytkuCelkem})`, zachytkuCelkem >= 100,
  'jen ' + zachytkuCelkem + ' — sběr zachytků přestal kódu rozumět');

pravda(`každý skript najde na své stránce aspoň ${MEZ_PODILU} % svých prvků`,
  nalezy.length === 0,
  nalezy.slice(0, 6).join('\n      ')
  + (nalezy.length > 6 ? `\n      …a dalších ${nalezy.length - 6}` : '')
  + '\n      — buď ten skript na stránce nemá co dělat (zahodit ho z ní), '
  + 'nebo si prvky vyrábí sám a patří do VYJIMKY s napsaným důvodem');

/* A ŽE VÝJIMKY NEJSOU JEN VYPNUTÉ KONTROLY. */
const bezDuvodu = Object.entries(VYJIMKY).filter(([, d]) => !d || d.length <= 10);
pravda(`výjimky mají napsaný důvod (${Object.keys(VYJIMKY).length} výjimek)`,
  bezDuvodu.length === 0, bezDuvodu.map(([k]) => k).join(', '));

/* A ŽE MEZ ZŮSTALA MEZÍ. Sabotáž „nastav MEZ_PODILU na nulu" prošla —
   při nule je podmínka `podil >= MEZ` splněná vždycky a hlídač mlčí.
   Rozsah se tedy hlídá taky: 5 % je ještě nad naměřenou vadou (2 %),
   20 % už by označilo js/graf-cen.js, který si prvky staví sám. */
pravda(`mez podílu zůstala v naměřeném rozsahu (${MEZ_PODILU} %)`,
  MEZ_PODILU >= 5 && MEZ_PODILU <= 20,
  'mez je ' + MEZ_PODILU + ' % — pod 5 % hlídač nic nenajde (vada měla 2 %), '
  + 'nad 20 % začne hlásit skripty, které si prvky vyrábějí samy');

hotovo();
