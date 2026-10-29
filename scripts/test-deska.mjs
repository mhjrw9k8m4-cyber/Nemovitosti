// Test: deska se na celém webu kreslí jedním receptem.
//
// Spuštění: node scripts/test-deska.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Zaoblení OVLADAČŮ hlídá test-zaobleni
// a tvary test-tvary — ale desky (karty, panely, okna, mapy) nehlídal
// nikdo. Otisk 18 typů stránek 29. 10. našel, jak se to bez hlídače
// rozjede: desky ve ČTYŘECH zaobleních (0, 10, 14, 20 px), rámy ve
// TŘECH silách (0,14 / 0,28 / 0,55) a stíny ve ČTYŘECH podobách
// (žádný / e1 / e2 / e3) — a míchalo se to v jedné roli na jedné
// stránce: na inzerátu stála poznámka na 10 px pod kartou s cenou
// na 14, mapa měla stín pro „zvednuté" a vedle ní karta pro „klidné".
//
// RECEPT, KTERÝ SE TU HLÍDÁ:
//   • DESKA (má vlastní plochu a rám nebo stín) = zaoblení --r-plocha;
//   • DROBNOST uvnitř desky (odznak, štítek, náhled — nižší než
//     DROBNOST_V px) smí mít --r-drobnost nebo pilulku;
//   • RÁM desky má jednu sílu: --line. Výjimky se jmenují níž a každá
//     má napsaný důvod;
//   • STÍN: na stránce --e1, nad obsahem --e3. Pro --e2 je místo jen
//     při najetí myší (zvednutí), což se tady neměří — měří se klid.
//   • NULA je v pořádku u pruhu UVNITŘ desky (legenda v mapě, panel
//     pod mapou): rodič ho ořízne, takže vlastní zaoblení by nebylo
//     vidět. Poznáme ho podle toho, že má jen border-top/bottom.
//
// Měří se VYKRESLENÁ hodnota, ne zápis ve stylopisu.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Jedna deska', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Hodnoty se čtou ze stylopisu, ne opisují: kdyby se --r-plocha jednou
   změnilo, zkouška se má přizpůsobit, ne spadnout. */
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const cti = (jm) => {
  const m = css.match(new RegExp('--' + jm + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};
const zebrik = { 'var(--r-sm)': 10, 'var(--r-md)': 14, '10px': 10, '14px': 14 };
const R_PLOCHA = zebrik[cti('r-plocha')] ?? 14;
const R_DROBNOST = zebrik[cti('r-drobnost')] ?? 10;
const DROBNOST_V = 44;   // vyšší prvek už není odznak, ale deska

/* VÝJIMKY. Píše se sem jméno a důvod — ne aby se dalo pravidlo obejít,
   ale aby se u každé dalo přečíst, proč platí. */
const JINY_RAM = new Set([
  /* Odznak „K dražbě" nese zeleň značky jako ozdobu, ne jako rám desky. */
  'deal-badge',
  /* Nápověda „vyberte kraj" sedí NAD mapou a zelený rám ji k mapě váže. */
  'kraj-hint',
]);
const MIMO = new Set([
  /* Leafletové prvky kreslí knihovna, ne náš stylopis. */
  'leaflet-popup-content-wrapper', 'leaflet-control-zoom', 'leaflet-tooltip',
]);

const STRANKY = ['index.html', 'cena-pozemku.html', 'hlidani.html', 'porovnani.html',
  'pridat.html', 'profil.html', 'kontakt.html', 'data.html', 'drazby-pozemku.html',
  'muj-inzerat.html', 'zpravy.html', 'nove-pozemky.html', 'pozemky-okres-zlin.html',
  'pozemky-jihomoravsky-kraj.html', 'inzerce.html', '404.html',
  (adresaPozemku() || {}).url || 'pozemek.html'];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') {
    return r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  }
  return r.abort();
});
const p = await ctx.newPage();
const desky = new Map();
for (const s of STRANKY) {
  await p.goto(BASE + '/' + s, { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(2000);
  const nalez = await p.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('div,section,article,aside,li,form,details,header,footer,nav,table')) {
      const rc = e.getBoundingClientRect();
      if (rc.width < 60 || rc.height < 24) continue;
      const cs = getComputedStyle(e);
      const ramy = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(cs['border' + k + 'Width']) || 0);
      const maRam = ramy.some((x) => x > 0);
      const celyRam = ramy.every((x) => x > 0);
      const maStin = cs.boxShadow && cs.boxShadow !== 'none';
      const prusvitna = cs.backgroundColor === 'rgba(0, 0, 0, 0)';
      if (!maRam && !maStin) continue;
      if (prusvitna && !maStin) {
        /* Bez vlastní plochy a bez stínu to není deska, ale linka. */
        if (!celyRam) continue;
      }
      const tridy = (e.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      out.push({
        jm: tridy.length ? tridy[0] : e.tagName.toLowerCase(),
        tridy,
        z: Math.round(parseFloat(cs.borderTopLeftRadius) || 0),
        v: Math.round(rc.height),
        celyRam, prusvitna,
        ram: maRam ? cs.borderTopColor : null,
        ramSila: ramy[0],
        stin: maStin ? cs.boxShadow : 'bez',
      });
    }
    return out;
  }).catch(() => []);
  for (const x of nalez) if (!desky.has(x.jm)) desky.set(x.jm, { ...x, kde: s });
}
await prohlizec.close();

/* Barvy tokenů se čtou tak, jak je vykreslí prohlížeč: ze stylopisu je
   to rgba(var(--text-rgb),0.14), na obrazovce rgba(16, 21, 19, 0.14). */
const sily = new Map();
for (const [, d] of desky) if (d.ram && d.celyRam) sily.set(d.ram, (sily.get(d.ram) || 0) + 1);
const nejcastejsiRam = [...sily].sort((a, b) => b[1] - a[1])[0];

pravda('je co měřit — desky na všech typech stránek',
  desky.size >= 30, `naměřeno jen ${desky.size} desek`);

/* 1) ZAOBLENÍ */
const zleZaobleni = [];
for (const [jm, d] of desky) {
  if (MIMO.has(jm)) continue;
  if (d.z === 999 || d.z >= d.v / 2) continue;                 // pilulka
  if (!d.celyRam && d.z === 0) continue;                       // pruh uvnitř desky
  if (d.v <= DROBNOST_V && d.z === R_DROBNOST) continue;       // drobnost
  if (d.z === R_PLOCHA) continue;
  zleZaobleni.push(`${jm} ${d.z} px (vysoká ${d.v}, ${d.kde})`);
}
pravda(`každá deska má zaoblení ${R_PLOCHA} px (drobnost do ${DROBNOST_V} px smí ${R_DROBNOST})`,
  zleZaobleni.length === 0, zleZaobleni.join('\n      '));

/* 2) RÁM */
const zleRam = [];
for (const [jm, d] of desky) {
  if (MIMO.has(jm) || !d.celyRam) continue;
  if (d.tridy.some((t) => JINY_RAM.has(t))) continue;
  if (d.ram === nejcastejsiRam[0]) continue;
  zleRam.push(`${jm} má rám ${d.ram} místo ${nejcastejsiRam[0]} (${d.kde})`);
}
pravda(`rám desky má jednu sílu (${nejcastejsiRam[0]}, nese ji ${nejcastejsiRam[1]} desek)`,
  zleRam.length === 0, zleRam.join('\n      '));

/* 3) STÍN. Měří se jen to, že se nemíchají DVA klidové stíny: na
   stránce jeden, nad obsahem druhý. Který je který, se pozná podle
   rozostření — čím výš prvek plave, tím je stín větší. */
const stiny = new Map();
for (const [, d] of desky) if (d.stin !== 'bez') stiny.set(d.stin, (stiny.get(d.stin) || 0) + 1);
pravda('klidové stíny jsou nejvýš dva (deska na stránce a deska nad obsahem)',
  stiny.size <= 2, [...stiny].map(([s, n]) => `${n}× ${s.slice(0, 60)}`).join('\n      '));

console.log('\nJedna deska: zaoblení, rám a stín na celém webu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jedna deska: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
