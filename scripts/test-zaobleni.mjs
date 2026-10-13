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

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Hodnota tokenu se čte ze stylopisu, ne opisuje do zkoušky: kdyby se
   --r-ovladani jednou změnilo, zkouška se má přizpůsobit, ne spadnout. */
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');

const STRANKY = ['index.html', 'cena-pozemku.html', 'hlidani.html', 'porovnani.html',
  'pridat.html', 'profil.html', 'kontakt.html'];
const SIRKY = [390, 1440];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));

let ovladani = 0;
const mimo = new Map();      // třída → naměřené zaoblení
let tokenPx = null;

for (const s of STRANKY) {
  for (const w of SIRKY) {
    const ctx = await prohlizec.newContext({ viewport: { width: w, height: 900 },
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
        const pilulka = rad >= r.height / 2 - 0.5;
        const jmeno = (typeof e.className === 'string' && e.className.trim())
          ? e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase();
        ven.push({ rad: Math.round(rad * 10) / 10, pilulka, jmeno });
      }
      return { token, ven };
    });
    if (v.token && !tokenPx) tokenPx = v.token;
    for (const e of v.ven) {
      ovladani++;
      if (e.pilulka) continue;                       // odznak nebo kulaté tlačítko
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

pravda('každý ovládací prvek má --r-ovladani, nebo je to pilulka',
  mimo.size === 0,
  [...mimo.entries()].map(([k, n]) => `${k} ×${n}`).join(', ') +
  `\n      — pravidlo je jedno zaoblení (${tokenPx} px) na všechno, čím se ovládá;` +
  ' pilulka zůstává odznakům a kulatým tlačítkům s ikonou');

console.log('\nZaoblení ovládacích prvků');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zaoblení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
