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
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Obarvení podle ceny', zpravy);
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
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
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
    /* Relativní jas podle ITU-R BT.709 — totéž, co používá výpočet
       kontrastu. Funkce musí být UVNITŘ evaluate: běží v prohlížeči,
       ne v Node. */
    const jasZRGB = (r, g, b) => {
      const l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
      return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
    };
    const ven = [];
    for (let i = 0; i < 2200; i++) {
      const t = window.PK_BARVY.tecka(i);
      if (!t) break;
      const m = /rgb\((\d+),(\d+),(\d+)\)/.exec(t.barva || '');
      if (!m || t.zaM2 == null || !isFinite(t.zaM2) || t.zaM2 <= 0) continue;
      /* JAS, NE MODRÝ KANÁL. Dokud byla stupnice fialová, znamenalo
         „světlejší" prakticky „modřejší" a stačilo číst m[3]. Od
         chvíle, kdy stupnice jde ze zelené přes šedou do vínové, je
         modrý kanál uprostřed VYŠŠÍ než na levném konci (135 → 163)
         a kontrola by hlásila 6 851 obrácených dvojic na stupnici,
         která je ve skutečnosti v pořádku. Relativní jas (ITU-R
         BT.709) platí pro jakoukoli paletu — i pro tu fialovou. */
      ven.push({ cena: t.zaM2, jas: jasZRGB(+m[1], +m[2], +m[3]) });
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
      /* Jas s cenou KLESÁ: levné je světlé, drahé tmavé. */
      if (levnejsi.jas < drazsi.jas) obracene++;
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
    /* BARVY DRUHŮ SE POROVNÁVAJÍ S JEJICH SKUTEČNÝMI HODNOTAMI, ne
       pravidlem na kanály. „r > b+40 && r > g+20" označilo za
       „oranžovou dražbu" i vínovou rgb(120,18,30), tedy drahý konec
       cenové stupnice — kontrola pak hlásila, že barvy druhů z mapy
       nezmizely, i když tam žádná nebyla. Rozhoduje vzdálenost
       v RGB: do 45 je to ta barva, dál už ne. */
    /* Hodnoty se ČTOU ZE STYLOPISU, nepíšou se sem. Napsal jsem je sem
       jednou od oka a vyšlo, že „na mapě není ani jedna modrá tečka" —
       skutečná --c-sale je #4361B8, ne rgb(74,144,190). */
    const tok = (n, zal) => {
      const v = getComputedStyle(document.documentElement).getPropertyValue(n).trim() || zal;
      const m = /^#?([0-9a-f]{6})$/i.exec(v);
      if (!m) return zal;
      const h = m[1];
      return [parseInt(h.slice(0,2),16), parseInt(h.slice(2,4),16), parseInt(h.slice(4,6),16)];
    };
    const DRUHY = { modra: tok('--c-sale', [67,97,184]), oranzova: tok('--c-drazba', [204,107,51]),
      tmavoruda: tok('--c-exekuce', [140,47,30]) };
    const bliz = (r,g,b,c) => Math.sqrt((r-c[0])**2+(g-c[1])**2+(b-c[2])**2) < 45;
    let modre = 0, oranzove = 0, jine = 0, barevne = 0;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 140) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (Math.abs(r - g) < 12 && Math.abs(g - b) < 12) continue;   // šeď podkladu
      barevne++;
      if (bliz(r,g,b,DRUHY.modra)) modre++;
      else if (bliz(r,g,b,DRUHY.oranzova) || bliz(r,g,b,DRUHY.tmavoruda)) oranzove++;
      else jine++;
    }
    return { barevne, modre, oranzove, jine };
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
    !!pD && pD.modre > pD.jine, pD ? JSON.stringify(pD) : '—');
  /* Nezávisle na tom, JAKÁ paleta se zrovna používá: po přepnutí musí
     na mapě převážit barvy, které nejsou barvami druhů. Dřív tu stálo
     „fialové > modré × 10", což byla přímo definice tehdejší palety —
     a po změně stupnice na zelenou→vínovou by to neprošlo nikdy. */
  pravda('po přepnutí na cenu se mapa OPRAVDU přebarví (ne jen legenda)',
    !!pC && pC.jine > pC.modre * 10,
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

  /* --- OBA KONCE STUPNICE SVÍTÍ STEJNĚ -----------------------------
   * Majitel 2. 11.: „podle ceny proč svítí zelená méně a červená
   * hodně, mají svítit stejně."
   * Změřeno v Lab: zeleň měla sytost C*=28, karmín C*=58 — drahé
   * pozemky křičely a levné se ztrácely, přestože nesou TÝŽ druh
   * informace, jen obráceně. Tahle kontrola měří oba konce z toho,
   * co doopravdy vyšlo z barvaCeny(), ne ze zápisu zarážek.
   */
  {
    const konce = await p.evaluate(() => {
      const B = window.PK_BARVY;
      return B && B.barva ? [B.barva(0), B.barva(1)] : null;
    });
    pravda('stupnice umí vydat svůj levný i drahý konec', !!konce, 'PK_BARVY.barva chybí');
    if (konce) {
      /* Sytost (C* v Lab) říká, „jak moc je barva barevná". Světlost
         se schválně NEPOROVNÁVÁ: ta má klesat, a hlídá to kontrola
         „levnější je vždycky světlejší" výš. */
      const lab = (css) => {
        const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(css) || [];
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        const R = lin(+m[1]), G = lin(+m[2]), Bq = lin(+m[3]);
        let X = (R * 0.4124 + G * 0.3576 + Bq * 0.1805) / 0.95047;
        let Y = R * 0.2126 + G * 0.7152 + Bq * 0.0722;
        let Z = (R * 0.0193 + G * 0.1192 + Bq * 0.9505) / 1.08883;
        const h = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
        X = h(X); Y = h(Y); Z = h(Z);
        const a = 500 * (X - Y), b2 = 200 * (Y - Z);
        return { L: 116 * Y - 16, C: Math.sqrt(a * a + b2 * b2),
          h: ((Math.atan2(b2, a) * 180 / Math.PI) + 360) % 360 };
      };
      const z = lab(konce[0]), d = lab(konce[1]);
      /* Pojistka: kdyby oba konce vyšly šedé, rozdíl by byl nulový
         a kontrola by prošla nad stupnicí, která nerozlišuje nic. */
      pravda('oba konce jsou opravdu barevné (ne šedé)', z.C > 30 && d.C > 30,
        `levný C*=${z.C.toFixed(0)}, drahý C*=${d.C.toFixed(0)}`);
      pravda('a svítí stejně — sytost obou konců se neliší o víc než 8',
        Math.abs(z.C - d.C) <= 8,
        `levný C*=${z.C.toFixed(0)}, drahý C*=${d.C.toFixed(0)}, rozdíl ${Math.abs(z.C - d.C).toFixed(0)}`);
    }
  }

  /* --- BUBLINY SHLUKŮ SE V CENOVÉM REŽIMU ŘÍDÍ CENOU ---------------
   * Majitel: „když rozkliknu podle ceny, neočekávám, že tam zůstanou
   * bubliny [podle druhu], ale sladí se to dle ceny."
   * Byla to tichá vada: tečky se přebarvily, ale patnáct největších
   * bublin zůstalo modrých „na prodej" — a právě ty jsou v
   * celostátním pohledu nejvíc vidět, takže režim vypadal rozbitě.
   * Kontroly výš to minuly, protože čtou PLÁTNO (tečky kreslí canvas),
   * kdežto bublina je HTML značka vedle plátna.
   */
  {
    await p.evaluate(() => window.PK_BARVY.prepni('druh'));
    await p.waitForTimeout(1500);
    const cti = () => p.evaluate(() => [...document.querySelectorAll('.pk-shluk')]
      .map((e) => e.style.getPropertyValue('--sh').trim()).filter(Boolean));
    const podleDruhu = await cti();
    pravda(`na mapě jsou bubliny shluků (${podleDruhu.length})`, podleDruhu.length >= 5,
      `nalezeno ${podleDruhu.length}`);
    await p.evaluate(() => window.PK_BARVY.prepni('cena'));
    await p.waitForTimeout(1800);
    const podleCeny = await cti();
    if (podleDruhu.length >= 5 && podleCeny.length >= 5) {
      const spolecne = podleCeny.filter((b) => podleDruhu.indexOf(b) >= 0);
      pravda('po přepnutí na cenu se bubliny opravdu přebarví',
        spolecne.length === 0, `beze změny zůstalo ${spolecne.length} z ${podleCeny.length}`);
      /* A ne všechny na jednu barvu: to by znamenalo, že se počítá
         něco, co u všech shluků vychází stejně. */
      pravda('a nemají všechny tutéž barvu (cena se mezi kraji liší)',
        new Set(podleCeny).size >= 3, `různých barev ${new Set(podleCeny).size}`);
      /* V bublině stojí BÍLÉ ČÍSLO. Tohle je důvod, proč nemůže vzít
         barvu tečky rovnou: levný konec stupnice má s bílou kontrast
         1,6. */
      const jas = (css) => {
        const m = /rgb\((\d+),\s*(\d+),\s*(\d+)\)/.exec(css);
        if (!m) return null;
        const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * lin(+m[1]) + 0.7152 * lin(+m[2]) + 0.0722 * lin(+m[3]);
      };
      const slabe = podleCeny.map((b) => ({ b, k: jas(b) == null ? 99 : 1.05 / (jas(b) + 0.05) }))
        .filter((x) => x.k < 4.5);
      pravda('a bílé číslo je na nich čitelné (kontrast aspoň 4,5)',
        slabe.length === 0,
        slabe.slice(0, 3).map((x) => `${x.b} má ${x.k.toFixed(2)}`).join('; '));
    }
    await p.evaluate(() => window.PK_BARVY.prepni('druh'));
    await p.waitForTimeout(1200);
  }

  pravda('a nic z toho nespadlo do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
