// Test: čím se ovládá, má jedno zaoblení.
//
// Spuštění: node scripts/test-zaobleni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Při vizuální předělávce webu jsem změřil
// zaoblení všech tlačítek, polí a rozbalovačů na šesti stránkách ve dvou
// šířkách. Vyšla ČTYŘI různá: 6 px (kontaktní formulář), 10 px (hledání
// nad mapou, řazení, souhrn filtrů, záložky přihlášení), 14 px (hlavní
// tlačítko, přihlašovací pole, „Pozemky v okolí") a pilulka.
//
// Jednotlivě si toho nikdo nevšimne. Vedle sebe v jedné řadě ano: nad
// mapou stálo pole hledání na 10 px, hned vedle „Pozemky v okolí" na 14
// a za ním souhrn filtrů zase na 10. To je ten pocit „je to skoro
// hotové", který se nedá ukázat prstem.
//
// PRAVIDLO, KTERÉ SE TU HLÍDÁ:
//   • co se OVLÁDÁ (tlačítko, pole, rozbalovač), má --r-ovladani;
//   • PILULKA zůstává odznakům (zapínatelný filtr) a kulatým tlačítkům
//     s ikonou — tam netvrdí, že je to pole;
//   • NULA je v pořádku u prvků bez vlastní plochy a bez okraje:
//     zaoblení ničeho není vidět, takže není co sjednocovat.
// Měří se VYKRESLENÁ hodnota, ne zápis v stylopisu: zajímá nás, co člověk
// vidí, a přes média a přebití se zápis a výsledek běžně rozcházejí.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Zaoblení', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Hodnota tokenu se čte ze stylopisu, ne opisuje do zkoušky: kdyby se
   --r-ovladani jednou změnilo, zkouška se má přizpůsobit, ne spadnout. */
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');

/* A STRÁNKA POZEMKU — nejčastější druh stránky na webu (2 159 kusů)
   tu dlouho nebyl, takže se na ní pravidlo o zaoblení nevymáhalo.
   Stálo to dva tiché nálezy: „Kopírovat"/„Navigovat" pod mapou
   a tlačítko zvětšení mapy měly --r-sm (10 px), kdežto všechno kolem
   --r-ovladani (14). Adresa se bere z dat, ne napevno: natvrdo
   zapsaná nabídka se jednou ztratí a zkouška by měřila prázdno. */
const STRANKY = ['index.html', 'cena-pozemku.html', 'hlidani.html', 'porovnani.html',
  'pridat.html', 'moje-data.html', 'kontakt.html',
  (adresaPozemku() || {}).url || 'pozemek.html'];

/* PILULKY, KTERÉ ODZNAKEM JSOU, ale nedají se tak poznat ze značky.
   Píše se sem jméno třídy a důvod — ne proto, aby se dalo pravidlo
   obejít, ale aby se u každé výjimky dalo přečíst, proč platí. */
const PILULKY = new Set([
  /* Záložka na kartě. Přepíná uložení a mění si slovo („Uložit" /
     „Uloženo") i popisek pro odečítač; aria-pressed schválně nemá,
     protože se u ní mění přístupný NÁZEV, a obojí najednou by
     odečítač přečetl dvakrát. */
  'opp-fav',
  /* Totéž pro skrytí nabídky: „Skrýt" / „Vrátit". */
  'opp-skryt',
  /* Filtrační odznak nad výpisem; zapnutý nese .active, vypnutý nic —
     a měří se i ten vypnutý. */
  'filter-chip',
  /* <summary> „Jak to funguje" na přidání pozemku. Rozbalovátko není
     tlačítko ani pole: netvrdí, že se do něj píše, a pilulka u něj
     čte jako odznak sekce. */
  'add-jak-sum',
]);
const SIRKY = [390, 1440];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));

let ovladani = 0;
const mimo = new Map();      // třída → naměřené zaoblení
let tokenPx = null;

for (const s of STRANKY) {
  for (const w of SIRKY) {
    const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: w, height: 900 },
      hasTouch: w < 800, isMobile: w < 800 });
    const p = await ctx.newPage();
    try { await p.goto(`${BASE}/${s}`, { waitUntil: 'load' }); }
    catch (e) { await ctx.close(); continue; }
    await p.waitForTimeout(1500);
    const v = await p.evaluate(() => {
      const kor = getComputedStyle(document.documentElement);
      const token = parseFloat(kor.getPropertyValue('--r-ovladani')) ||
        parseFloat(getComputedStyle(document.body).getPropertyValue('--r-ovladani'));
      const ven = [];
      const vyber = 'button, input[type=text], input[type=search], input[type=number], input[type=email], input[type=password], select, textarea, summary';
      for (const e of document.querySelectorAll(vyber)) {
        const r = e.getBoundingClientRect();
        if (r.width < 24 || r.height < 20) continue;      // schované a drobky
        const c = getComputedStyle(e);
        if (c.visibility === 'hidden' || c.display === 'none' || c.opacity === '0') continue;
        /* BEZ VLASTNÍ PLOCHY A BEZ OKRAJE NENÍ CO ZAOBLIT. Takový prvek
           se do počtu nebere — jinak by zkouška nutila psát zaoblení
           tam, kde není vidět. Podbarvení při stisku (:active) se sem
           nedostane, a to je v pořádku: hlídá se klidový stav. */
        const maPlochu = c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.backgroundColor !== 'transparent';
        const maOkraj = parseFloat(c.borderTopWidth) > 0 && c.borderTopStyle !== 'none';
        if (!maPlochu && !maOkraj) continue;
        const rad = parseFloat(c.borderTopLeftRadius) || 0;
        /* PŮLKA SLOŽENÉHO OVLADAČE ZAOBLENÍ MÍT NESMÍ.
           Přepínač Seznam/Mapa je jeden ovladač rozdělený vlasovou
           čarou na dvě půlky: zaoblení nese OBAL a ořezává jím obsah
           (overflow:hidden), takže vnitřní tlačítka musí mít nulu —
           se čtrnáctkou by se zapnutá zelená půlka zakulatila i na
           vnitřní straně a od dělicí čáry by ji oddělil bílý půlměsíc.
           Vidět je tedy zaoblení obalu, a to pravidlo splňuje. Výjimka
           je úzká schválně: nula projde JEN tehdy, když rodič má
           --r-ovladani a zároveň ořezává. Bez té druhé podmínky by
           stačilo cokoli zabalit do zakulaceného divu. */
        const ro = e.parentElement ? getComputedStyle(e.parentElement) : null;
        if (rad === 0 && ro && ro.overflow === 'hidden'
          && Math.abs((parseFloat(ro.borderTopLeftRadius) || 0) - (token || 14)) < 0.51) continue;
        const pilulka = rad >= r.height / 2 - 0.5;
        const jmeno = (typeof e.className === 'string' && e.className.trim())
          ? e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase();
        /* Je ten prvek ODZNAK? Rozhoduje chování, ne vzhled: přepínač
           se pozná podle aria-pressed / aria-checked / role=switch,
           nebo podle toho, že si nese třídu zapnutého stavu. */
        const prepinac = e.hasAttribute('aria-pressed') || e.hasAttribute('aria-checked')
          || e.getAttribute('role') === 'switch'
          || /(^|\s)(on|active)(\s|$)/.test(String(e.className || ''));
        const kulate = Math.abs(r.width - r.height) <= 4;
        ven.push({ rad: Math.round(rad * 10) / 10, pilulka, jmeno, prepinac, kulate });
      }
      return { token, ven };
    });
    if (v.token && !tokenPx) tokenPx = v.token;
    for (const e of v.ven) {
      ovladani++;
      if (e.pilulka) {
        /* PILULKA NENÍ VOLNÁ VSTUPENKA. Dokud se tu psalo jen
           `if (e.pilulka) continue;`, prošel jako pilulka COKOLI —
           a přesně tím proklouzla akční tlačítka nad výpisem:
           „Procházet po jednom" a „Stáhnout výběr" stály plnou
           pilulkou přímo pod „Uložené" a řazením, která mají
           --r-ovladani. V jedné sestavě tedy byly dva tvary; majitel
           to poslal na snímku. Pravidlo v hlavičce téhle zkoušky
           přitom říká, komu pilulka patří — jen se vymáhala polovina.
           Teď se vymáhá celé: pilulku smí mít odznak (přepínač),
           kulaté tlačítko s ikonou, nebo prvek ze seznamu níž. */
        if (e.prepinac || e.kulate || PILULKY.has(e.jmeno)) continue;
        const kp = `${e.jmeno} (pilulka, ale není odznak)`;
        mimo.set(kp, (mimo.get(kp) || 0) + 1);
        continue;
      }
      if (Math.abs(e.rad - (v.token || 14)) < 0.51) continue;
      const k = `${e.jmeno} (${e.rad} px)`;
      mimo.set(k, (mimo.get(k) || 0) + 1);
    }
    await ctx.close();
  }
}
await prohlizec.close();

/* Nejdřív předpoklady: kdyby se nenašlo, co měřit, zkouška by prošla
   prázdná a tvářila se, že web je v pořádku. */
pravda(`token --r-ovladani je v stylopisu`, /--r-ovladani:/.test(css),
  'bez něj nemá pravidlo o co se opřít');
pravda(`vykreslená hodnota tokenu se načetla (${tokenPx} px)`, tokenPx > 0,
  'ze stránky se --r-ovladani nepodařilo přečíst');
pravda(`je co měřit — ovládacích prvků s vlastní plochou: ${ovladani}`,
  ovladani >= 60, `jen ${ovladani} na ${STRANKY.length} stránkách`);

pravda('každý ovládací prvek má --r-ovladani, nebo je odznak s pilulkou',
  mimo.size === 0,
  [...mimo.entries()].map(([k, n]) => `${k} ×${n}`).join(', ') +
  `\n      — pravidlo je jedno zaoblení (${tokenPx} px) na všechno, čím se ovládá;` +
  ' pilulka zůstává odznakům a kulatým tlačítkům s ikonou');

console.log('\nZaoblení ovládacích prvků');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zaoblení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
