/* Test: stránka „Kolik stojí pozemek?" odpovídá, a ta odpověď nelže.
   ===================================================================
   Spuštění: node scripts/test-cena-podle-druhu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ VZNIKL. Stránka se ptala „Kolik stojí pozemek?" a odpovídala
   jedním číslem — mediánem zemědělské půdy (45 Kč/m²). To číslo platí
   pro jednu ze čtyř skupin. Naměřeno 2. 11. na vlastních datech webu:

     Stavební  2 923 · Zahrada 783 · Zemědělská 45 · Lesní 30 Kč/m²

   tedy 97× rozdíl. Hned pod tím stála křivka, která se za 50 dní
   pohnula o 0,4 % (z 130 řad se 29 nehnulo ani o 5 %) — nejklidnější
   věc na stránce na nejlepším místě.

   CO SE HLÍDÁ, A PROČ PRÁVĚ TO:
     1) že karta vůbec je a má aspoň tři druhy,
     2) že KAŽDÝ řádek nese své číslo i rozpětí SLOVEM. Pruh je
        ilustrace; kdyby informaci nesl jen on, nejlevnější druh
        (1 % délky) by byl nečitelný,
     3) že dráhy pruhů jsou u všech řádků STEJNĚ DLOUHÉ. Tohle je ta
        nejdůležitější kontrola: než se sloupec s číslem připnul na
        pevnou šířku, měl každý řádek dráhu jinou (471, 488 a 500 px),
        takže „sdílená stupnice" sdílená nebyla a delší pruh mohl
        znamenat menší číslo,
     4) že délky pruhů ODPOVÍDAJÍ poměru čísel. Bez toho by kontrola
        3 prošla i nad čtyřmi stejně dlouhými pruhy,
     5) že podnadpis stránky netvrdí jedinou cenu.
   =================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BASE } from './falesna-supabase-chat.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
hlasPad('Cena podle druhu', zpravy, () => chyb);

// --- STATICKY: podnadpis netvrdí jedinou cenu ------------------------
{
  const h = readFileSync(path.join(KOREN, 'cena-pozemku.html'), 'utf8');
  const m = /<p class="sub">([\s\S]*?)<\/p>/.exec(h);
  const sub = m ? m[1] : '';
  pravda('podnadpis na stránce vůbec je', !!sub, 'odstavec .sub se nenašel');
  /* Dvě čísla, ne jedno: „podle druhu 2 923 za stavební, 30 za les".
     Jedno tučné číslo v podnadpisu je přesně ta opravená vada. */
  const cisel = (sub.match(/<b>[^<]*\d[^<]*<\/b>/g) || []).length;
  pravda('a nabízí dvě krajní ceny, ne jednu „cenu pozemku"', cisel >= 2,
    `tučných čísel v podnadpisu: ${cisel} — „${sub.replace(/<[^>]+>/g, '').slice(0, 90)}"`);
}

// --- V PROHLÍŽEČI: stupnice nelže ------------------------------------
await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
for (const sirka of [390, 1280]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,
    viewport: { width: sirka, height: 1000 }, isMobile: sirka < 500, hasTouch: sirka < 500,
    locale: 'cs-CZ', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/cena-pozemku.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const v = await p.evaluate(() => [].slice.call(document.querySelectorAll('.drh-radek')).map((e) => {
    const q = (s) => e.querySelector(s);
    const sirkaZ = (s) => { const x = q(s); return x ? Math.round(x.getBoundingClientRect().width) : -1; };
    const txt = (s) => { const x = q(s); return x ? (x.textContent || '').trim() : ''; };
    return { jmeno: txt('.drh-jmeno'), cislo: txt('.drh-cislo'), pasmo: txt('.drh-pasmo'),
      draha: sirkaZ('.drh-pas'), vypln: sirkaZ('.drh-pas > i') };
  }));
  await ctx.close();

  pravda(`@${sirka}: karta má aspoň tři druhy (jinak není co porovnávat)`,
    v.length >= 3, `řádků ${v.length}`);
  if (v.length < 3) continue;

  const bezCisla = v.filter((r) => !/\d/.test(r.cislo) || !/\d/.test(r.pasmo));
  pravda(`@${sirka}: každý řádek nese číslo i rozpětí slovem, ne jen pruhem`,
    bezCisla.length === 0,
    bezCisla.map((r) => `${r.jmeno}: číslo „${r.cislo}", rozpětí „${r.pasmo}"`).join(' | '));

  const drahy = [...new Set(v.map((r) => r.draha))];
  pravda(`@${sirka}: všechny pruhy mají STEJNĚ dlouhou dráhu (sdílená stupnice)`,
    drahy.length === 1 && drahy[0] > 40,
    `naměřené dráhy: ${drahy.join(', ')} px`);

  /* Poměr délek musí sedět na poměr čísel. Měří se proti NEJVĚTŠÍMU
     řádku, protože ten drží 100 % dráhy; tolerance 2 body je na
     zaokrouhlení na celé pixely. */
  const cislaZ = v.map((r) => Number(r.cislo.replace(/[^\d]/g, '')));
  const max = Math.max(...cislaZ);
  const sedi = v.every((r, i) => {
    const cekano = (cislaZ[i] / max) * v[i].draha;
    return Math.abs(r.vypln - cekano) <= Math.max(3, v[i].draha * 0.02);
  });
  pravda(`@${sirka}: délky pruhů odpovídají poměru čísel`, sedi,
    v.map((r, i) => `${r.jmeno}: ${r.vypln} px proti očekávaným ${Math.round((cislaZ[i] / max) * r.draha)}`).join(' | '));

  /* Dvě různá čísla nesmějí vyjít na touž délku — spodní mez to kdysi
     dělala (45 i 30 Kč/m² na 5 px). */
  const nejnizsiDva = v.slice(-2);
  if (nejnizsiDva.length === 2 && nejnizsiDva[0].cislo !== nejnizsiDva[1].cislo) {
    pravda(`@${sirka}: ani dva nejlevnější druhy nemají shodnou délku`,
      nejnizsiDva[0].vypln !== nejnizsiDva[1].vypln,
      `oba ${nejnizsiDva[0].vypln} px — spodní mez je srovnala`);
  }
}
await prohlizec.close();

console.log('\nCena podle druhu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Cena podle druhu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
