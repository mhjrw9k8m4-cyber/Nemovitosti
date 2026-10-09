/* Test: tečky se dají obarvit podle ceny za m² — a legenda tomu odpovídá.
   ==================================================================
   Spuštění: node scripts/test-barva-ceny.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Mapa barví tečky podle DRUHU příležitosti. To je správný výchozí stav —
   první otázka je „co to je". Druhá ale zní „kde je to levné", a na tu
   barva podle druhu neodpovídá vůbec: zelená tečka za 8 Kč/m² a zelená
   za 2 400 Kč/m² vypadají stejně.

   CO SE MĚŘÍ:
     · že se barva opravdu MĚNÍ s cenou, a to ve správném pořadí —
       levnější pozemek nesmí vyjít tmavší než dražší;
     · že nabídka BEZ ceny za metr zůstane šedá. Dohadovat se nesmí:
       tvářit se, že je levná, by byla lež;
     · že se s režimem mění i LEGENDA. Kdyby zůstala u druhů, popisovala
       by něco, co na mapě není — a to je horší než nemít legendu;
     · a že se dá vrátit zpátky.
   ================================================================== */
import { chromium } from 'playwright-core';
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
function hotovo() {
  console.log('\nObarvení teček podle ceny');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Obarvení podle ceny: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(3000);

  const mame = await p.evaluate(() => !!(window.PK_BARVY && window.PK_CENY));
  pravda('přepínač obarvení je na stránce', mame, 'window.PK_BARVY chybí');
  if (!mame) hotovo();
  pravda('mapa má tlačítko „Podle ceny"', await p.locator('#map-barva').count() === 1);
  pravda('výchozí režim je podle druhu (první otázka je „co to je")',
    await p.evaluate(() => window.PK_BARVY.rezim()) === 'druh');

  const legendaDruh = await p.evaluate(() => document.getElementById('map-legend').textContent);
  pravda('a legenda mluví o druzích', /Prodej|Dražba|Exekuce/i.test(legendaDruh), legendaDruh.slice(0, 80));

  await p.evaluate(() => window.PK_BARVY.prepni('cena'));
  await p.waitForTimeout(1500);
  pravda('po přepnutí je režim „cena"', await p.evaluate(() => window.PK_BARVY.rezim()) === 'cena');
  const kolik = await p.evaluate(() => window.PK_BARVY.stupnice());
  pravda(`stupnice stojí na dost cenách (${kolik})`, kolik >= 100,
    `jen ${kolik} — barva by nic nerozlišila`);

  /* Barva musí růst s cenou. Bere se ke každé nabídce její cena za metr
     (tímtéž výpočtem, jaký používá web) a vykreslená barva tečky. */
  const vzorek = await p.evaluate(() => {
    const zm = window.PK_CENY.zaMetr;
    const ven = [];
    const data = window.PK_DATA_SUROVA || null;
    /* Tečky se berou přes úchyt — pole DATA není venku dostupné. */
    for (let i = 0; i < 1500; i += 1) {
      const barva = window.PK_BARVY.barvaTecky(i);
      if (!barva) break;
      ven.push({ i, barva });
    }
    return ven;
  });
  pravda(`barvy teček se přečetly (${vzorek.length})`, vzorek.length > 200, `${vzorek.length}`);

  const sede = vzorek.filter((x) => /#8A9A92/i.test(x.barva)).length;
  const barevne = vzorek.length - sede;
  pravda(`část teček je obarvená podle ceny (${barevne})`, barevne > 100, `${barevne}`);
  pravda(`a část je šedá, protože cenu za metr nemá (${sede})`, sede > 0,
    'ani jedna šedá — buď mají cenu všechny, nebo se neznámo dohaduje');

  /* Pořadí: levnější nesmí vyjít „dražší" barvou. Stupnice je fialová
     a s cenou TMAVNE — klesají všechny tři složky (198,178,222 → 72,38,110),
     takže modrá je dál poctivý ukazatel pořadí, jen se jí neříká „modřejší",
     ale „světlejší". */
  const poradi = await p.evaluate(() => {
    const zm = window.PK_CENY.zaMetr;
    const dvojice = [];
    for (let i = 0; i < 1500; i++) {
      const b = window.PK_BARVY.barvaTecky(i);
      if (!b) break;
      if (!/^rgb\(/.test(b)) continue;
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(b);
      if (!m) continue;
      dvojice.push({ modra: +m[3], cervena: +m[1] });
    }
    return dvojice;
  });
  pravda(`barev ve stupnici je dost na porovnání (${poradi.length})`, poradi.length > 100, `${poradi.length}`);
  const ruznych = new Set(poradi.map((x) => x.modra)).size;
  pravda(`stupnice opravdu rozlišuje (${ruznych} různých odstínů)`, ruznych > 20,
    `jen ${ruznych} — barva by byla skoro jednolitá`);
  const spatne = poradi.filter((x) => x.cervena + x.modra < 100 || x.cervena + x.modra > 600).length;
  pravda('žádná barva nevyšla mimo stupnici', spatne === 0, `${spatne} mimo`);

  /* A TEĎ TO HLAVNÍ: levnější pozemek musí být modřejší než dražší.
     Pestrá stupnice sama o sobě nic neznamená — kdyby se barva přiřadila
     náhodně, předchozí kontroly by prošly všechny. */
  const dvojiceCen = await p.evaluate(() => {
    const ven = [];
    for (let i = 0; i < 2200; i++) {
      const t = window.PK_BARVY.tecka(i);
      if (!t) break;
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(t.barva || '');
      if (!m || t.zaM2 == null || !isFinite(t.zaM2) || t.zaM2 <= 0) continue;
      ven.push({ cena: t.zaM2, modra: +m[3] });
    }
    return ven;
  });
  pravda(`dvojic cena+barva je dost (${dvojiceCen.length})`, dvojiceCen.length > 200, `${dvojiceCen.length}`);
  let obracene = 0, paru = 0;
  for (let i = 0; i < dvojiceCen.length; i += 7) {
    for (let j = i + 1; j < dvojiceCen.length; j += 11) {
      const a2 = dvojiceCen[i], b2 = dvojiceCen[j];
      if (a2.cena === b2.cena) continue;
      paru++;
      const levnejsi = a2.cena < b2.cena ? a2 : b2;
      const drazsi = a2.cena < b2.cena ? b2 : a2;
      /* Složky v téhle stupnici s cenou KLESAJÍ (fialová tmavne). */
      if (levnejsi.modra < drazsi.modra) obracene++;
    }
  }
  pravda(`porovnalo se dost dvojic pozemků (${paru})`, paru > 1000, `${paru}`);
  pravda('levnější pozemek je vždycky světlejší než dražší', obracene === 0,
    `${obracene} z ${paru} dvojic má barvu obráceně — barva by lhala`);

  /* ===== A TEĎ TO, CO JE NA PLÁTNĚ =====================================
     Všechno výš si barvu nechá DOPOČÍTAT z dotStyle — tedy to, co by vyjít
     mělo. Jenže tečky se kreslí do plátna, a resizeDots dlouho přepisoval
     jen krytí, tloušťku a obrys, výplň ne. Přepínač tím pádem přebarvil
     legendu a na mapě se nezměnilo nic: naměřeno 13 530 modrých pixelů
     v obou režimech, bajt po bajtu stejně. Dopočet byl přitom celou dobu
     správný, takže tenhle test procházel.
     Proto se teď čtou PIXELY. Po přepnutí nesmí na mapě zbýt modrá
     „na prodej" ani oranžová „dražba" — barvy druhů v cenovém režimu
     neznamenají nic a jejich přítomnost je přesně ten příznak, že se
     výplň nepřekreslila. */
  const vzorekPlatna = () => p.evaluate(() => {
    const c = [...document.querySelectorAll('canvas')].find((x) => x.width > 200 && x.height > 200);
    if (!c) return null;
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let modre = 0, oranzove = 0, fialove = 0, barevne = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 140) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) continue;   // šeď podkladu
      barevne++;
      if (b > r + 30 && b > g + 20 && g > r) modre++;
      else if (b > r + 20 && g < r && g < b) fialove++;
      else if (r > b + 40 && r > g + 20) oranzove++;
    }
    return { barevne, modre, oranzove, fialove };
  });
  await p.evaluate(() => window.PK_BARVY.prepni('druh'));
  await p.waitForTimeout(900);
  const pD = await vzorekPlatna();
  await p.evaluate(() => window.PK_BARVY.prepni('cena'));
  await p.waitForTimeout(900);
  const pC = await vzorekPlatna();
  pravda('na plátně vůbec jsou barevné tečky', !!pD && pD.barevne > 2000,
    pD ? `barevných pixelů jen ${pD.barevne}` : 'plátno se nenašlo');
  pravda('v režimu „druh" na mapě převažuje modrá „na prodej"',
    !!pD && pD.modre > pD.fialove, pD ? JSON.stringify(pD) : '—');
  pravda('po přepnutí na cenu se mapa OPRAVDU přebarví (ne jen legenda)',
    !!pC && pC.fialove > pC.modre * 10,
    pC ? `${JSON.stringify(pC)} — výplň teček se nepřekreslila` : '—');
  pravda('a barvy druhů z mapy v cenovém režimu zmizí',
    !!pC && pC.modre + pC.oranzove < pC.barevne * 0.05,
    pC ? JSON.stringify(pC) : '—');

  const legendaCena = await p.evaluate(() => document.getElementById('map-legend').textContent);
  pravda('legenda se přepnula na cenu', /levné/.test(legendaCena) && /drahé/.test(legendaCena),
    legendaCena.slice(0, 90));
  pravda('a říká, co znamená šedá', /neznám/i.test(legendaCena), legendaCena.slice(0, 120));
  pravda('a nemluví už o druzích (to by popisovalo něco, co na mapě není)',
    !/Dražba|Exekuce/i.test(legendaCena), legendaCena.slice(0, 120));

  await p.evaluate(() => window.PK_BARVY.prepni('druh'));
  await p.waitForTimeout(1200);
  const zpet = await p.evaluate(() => document.getElementById('map-legend').textContent);
  pravda('zpátky na druhy se legenda vrátí', /Prodej|Dražba/i.test(zpet), zpet.slice(0, 80));

  pravda('a nic z toho nespadlo do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
