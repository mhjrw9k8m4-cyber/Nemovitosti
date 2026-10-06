// Měření kontrastu textu podle WCAG 2.1.
//
// Spuštění: node scripts/test-kontrast.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Kontrast není věc vkusu — je to číslo. Norma žádá poměr jasu aspoň
// 4,5 : 1 u běžného textu a 3 : 1 u velkého (nad 24 px, nebo nad 18,66 px
// tučně). Pod tím se text na mobilu na slunci prostě nepřečte a web
// působí vybledle.
//
// Skript projde stránky, u každého textu dohledá skutečné pozadí (i přes
// průhledné vrstvy) a spočítá poměr. Hlásí jen to, co normou neprojde.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
// Místní kopie Leafletu — viz poznámka u ctx.route níž.
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const STRANKY = ['index.html', 'cena-pozemku.html', 'pozemky-okres-tabor.html',
  'upozorneni.html', 'zpravy.html', 'hlidani.html', 'pridat.html', 'kontakt.html',
  // Rádcovské a právní stránky mají od téhle chvíle tmavý úvod. Dokud tu
  // nebyly, nikdo neměřil text na tmavé desce mimo hlavní stránku.
  'hypoteka-na-pozemek.html', 'podminky.html'];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const MERENI = `(() => {
  const lum = (r, g, b) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const parse = (s) => {
    const m = /rgba?\\(([^)]+)\\)/.exec(s || '');
    if (!m) return null;
    const p = m[1].split(',').map((x) => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const smichej = (pop, spod) => ({
    r: pop.r * pop.a + spod.r * (1 - pop.a),
    g: pop.g * pop.a + spod.g * (1 - pop.a),
    b: pop.b * pop.a + spod.b * (1 - pop.a), a: 1
  });
  // Barevné zarážky přechodu. Přechod je PRÁVĚ to místo, kde kontrast
  // selže, protože text leží na několika barvách najednou.
  // POZOR: tohle je uvnitř šablonového řetězce, takže lomítko v regulárním
  // výrazu musí být ZDVOJENÉ. Jinak ho JavaScript spolkne, výraz hledá
  // nesmysl, parseFloat vrátí NaN — a „NaN < 4,5" je vždy nepravda, takže
  // test mlčí a tváří se, že je všechno v pořádku. Přesně to se tu stalo.
  const zarazky = (obrazek) => {
    const nalezene = [];
    for (const m of String(obrazek).matchAll(/rgba?\\(([^)]+)\\)/g)) {
      const c = m[1].split(',').map((x) => parseFloat(x));
      if (c.slice(0, 3).some((x) => !isFinite(x))) continue;
      nalezene.push({ r: c[0], g: c[1], b: c[2], a: c.length > 3 ? c[3] : 1 });
    }
    return nalezene;
  };

  // Skutečný podklad pod textem — SEZNAM možností, ne jedna barva:
  //   - u přechodu leží text na několika barvách,
  //   - průsvitné vrstvy (barevný mesh nad plochou) se podloží tím, co je
  //     pod nimi. Dřív se prvek s průsvitným přechodem přeskočil — a to je
  //     přesně úvodní plocha webu, tedy to nejviditelnější místo.
  const pozadi = (el) => {
    const zavoje = [];
    let zaklad = null, e = el;
    while (e && !zaklad) {
      const st = getComputedStyle(e);
      if (st.backgroundImage !== 'none') {
        const obr = String(st.backgroundImage);
        // Přechod, který někde přechází do průhledna, holý podklad odhalí.
        // Přechod ze samých krycích barev ho nikde vidět nenechá.
        const dira = /transparent|rgba\([^)]*,\s*0(\.0+)?\s*\)/.test(obr);
        const z = zarazky(obr);
        if (!z.length && obr.indexOf('url(') >= 0) return null;
        const plne = z.filter((c) => c.a >= 0.99);
        if (plne.length) zaklad = plne;
        else z.filter((c) => c.a > 0.02).forEach((c) => zavoje.push({ c: c, kryje: !dira && c.a >= 0.5 }));
      }
      if (!zaklad) {
        const c = parse(st.backgroundColor);
        // Barva pozadí kryje celý prvek — tady žádná díra vzniknout nemůže.
        if (c && c.a >= 0.99) zaklad = [c];
        else if (c && c.a > 0.02) zavoje.push({ c: c, kryje: c.a >= 0.5 });
      }
      e = e.parentElement;
    }
    if (!zaklad) zaklad = [{ r: 255, g: 255, b: 255, a: 1 }];
    // Možné podklady. Závoj, který kryje celou plochu (tmavý odznak na fotce,
    // tmavý přechod přes úvodní obraz), je nad textem VŽDY — nesmí se z výpočtu
    // vynechat, jinak by test hlásil barvu, která na stránce nikde není.
    // Závoj s průhledným místem (mesh, jemný lesk) vynechat lze; zkoušíme
    // proto všechny kombinace těch nekrycích. Bez závojů zůstane holý podklad.
    const nekryci = zavoje.map((z, i) => (z.kryje ? -1 : i)).filter((i) => i >= 0).slice(0, 4);
    const kombinaci = 1 << nekryci.length;
    const kandidati = [];
    for (const b of zaklad) {
      for (let maska = 0; maska < kombinaci; maska++) {
        const vybrane = zavoje.filter((z, i) => {
          if (z.kryje) return true;
          const p = nekryci.indexOf(i);
          return p < 0 ? true : !!(maska & (1 << p));
        });
        let v = b;
        for (let i = vybrane.length - 1; i >= 0; i--) v = smichej(vybrane[i].c, v);
        kandidati.push(v);
      }
    }
    return kandidati;
  };

  const out = [];
  /* Počítá se i to, KOLIK prvků se vůbec změřilo. Bez toho by „0 prvků
     neprošlo" znamenalo totéž jako „stránka se nenačetla a nebylo co
     měřit" — a tahle zkouška by mlčela právě tehdy, kdy je potřeba
     nejvíc. Viz guard na konci souboru. */
  let zmereno = 0;
  const videt = (el) => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && parseFloat(s.opacity) > 0.05 && r.width > 0 && r.height > 0;
  };
  document.querySelectorAll('body *').forEach((el) => {
    const vlastni = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
    if (!vlastni || !videt(el)) return;
    const s = getComputedStyle(el);
    const fg = parse(s.color); if (!fg) return;
    const podklady = pozadi(el); if (!podklady || !podklady.length) return;
    // Nejhorší z možných podkladů — u přechodu rozhoduje ten, na kterém je
    // text nejhůř čitelný, ne průměr.
    let pomer = Infinity, bg = podklady[0];
    for (const kandidat of podklady) {
      const f = fg.a < 1 ? smichej(fg, kandidat) : fg;
      const L1 = lum(f.r, f.g, f.b), L2 = lum(kandidat.r, kandidat.g, kandidat.b);
      const p = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
      if (p < pomer) { pomer = p; bg = kandidat; }
    }
    const px = parseFloat(s.fontSize), tucne = (parseInt(s.fontWeight, 10) || 400) >= 700;
    const velky = px >= 24 || (px >= 18.66 && tucne);
    const mez = velky ? 3 : 4.5;
    zmereno++;
    if (pomer < mez) out.push({
      text: (el.textContent || '').trim().slice(0, 42),
      trida: (el.className && typeof el.className === 'string' ? el.className.trim().split(/\\s+/)[0] : el.tagName.toLowerCase()),
      barva: s.color, pozadi: 'rgb(' + [bg.r, bg.g, bg.b].map(Math.round).join(',') + ')',
      pomer: Math.round(pomer * 100) / 100, mez, px: Math.round(px)
    });
  });
  return { zmereno: zmereno, nalezy: out };
})()`;

/* OBA REŽIMY, A NA DOTYKOVÉM ZAŘÍZENÍ.
   Dřív se měřilo jen takhle: 390 px, světlý režim, bez dotyku. Tmavý
   režim měl vlastní zkoušku (test-tmavy-rezim.mjs), ale ta běží na
   monitoru 1280 px. Ta jediná kombinace, ve které lidé web nejčastěji
   vidí — telefon v tmavém režimu — se tedy neměřila vůbec.

   Naměřeno, když se zapnula: 39 prvků pod normou, nejhorší 1,55 : 1.
   Mezi nimi hlavička, která na dotykovém zařízení zůstala krémová
   (vypíná se na ní rozmazání pozadí a barva tam stála natvrdo), zatímco
   nápis „Parcelka" a přepínač menu se obarvily světle: 1,05 : 1, tedy
   prakticky neviditelné. Na tom je vidět, proč nestačí měřit režimy
   odděleně — vada byla v PRŮSEČÍKU dvou pravidel, ne v jednom z nich.

   hasTouch zapíná @media (hover:none), což je na telefonu skoro vždycky
   pravda; isMobile k tomu přidá dotykové události a správné měřítko. */
/* JEDEN REŽIM. Web míval i tmavý a tahle zkouška měřila oba; tmavý je
   celý pryč, takže se měří jen to, co web doopravdy má. Pole tu zůstává
   kvůli tvaru cyklu níž — a kdyby někdy přibyl druhý motiv, přidá se
   sem jeden řádek. */
const REZIMY = [
  { jmeno: 'světlý', volba: null },
];
const vse = [];
let zmerenoCelkem = 0;
for (const REZIM of REZIMY)
for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 },
    hasTouch: true, isMobile: true });
  if (REZIM.volba) {
    await ctx.addInitScript((v) => { try { localStorage.setItem('pk_rezim_v1', v); } catch (e) { /* ok */ } }, REZIM.volba);
  }
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';`
      + 'window.PK_MAIL_ZAPNUTO=true;' }));
  /* PŘIHLÁŠENÝ. Bez toho se na Upozorněních, Zprávách a Hlídání měřila
     jen výzva „přihlaste se" — tedy pár řádků místo celé stránky.
     Totéž se ukázalo u dotykových terčů: odhlášený běh tam přehlédl tři
     terče pod normou. */
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
  });
  // Bez Leafletu se skript mapy ukončí dřív, než vykreslí SEZNAM NABÍDEK —
  // a test pak měří jen horní část stránky, aniž by o tom věděl. Přesně to
  // se stalo: lokálně (kde na unpkg.com není přístup) hlásil „všechno
  // projde", zatímco na serveru padal na barvách v kartách.
  // Je-li po ruce místní kopie, podstrčíme ji; jinak jde požadavek ven.
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const soubor = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(soubor)) return r.abort();
      return r.fulfill({ status: 200, contentType: soubor.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: readFileSync(soubor) });
    });
    // Podpis (integrity) místní kopii nesedí, prohlížeč by ji zahodil.
    await ctx.route(`${BASE}/${s}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1600);
  // Sekce, které se odkrývají při scrollování, jsou do té doby průhledné
  // a měření je přeskakovalo — test tím kontroloval jen horní část stránky.
  // Odkryjeme je natvrdo; jinak by „0 chyb" znamenalo jen „0 chyb nahoře".
  await p.addStyleTag({ content: '.reveal,.reveal.in{opacity:1!important;transform:none!important;visibility:visible!important}' });
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(700);
  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(400);
  const vysledek = await p.evaluate(MERENI);
  zmerenoCelkem += vysledek.zmereno;
  vysledek.nalezy.forEach((n) => vse.push(Object.assign({ stranka: s + ' (' + REZIM.jmeno + ')' }, n)));

  /* MĚŘÍ SE JEN STAV, VE KTERÉM STRÁNKA PRÁVĚ JE — a to je málo.
   *
   * Čipy nad výpisem („Vše / Prodej / Dražba / Exekuce / Obec") mají
   * zapnutý vždycky jen jeden, ve výchozím stavu „Vše". Ostatní čtyři se
   * do stavu .active během měření nikdy nedostaly, takže se jejich barvy
   * neměřily vůbec. A právě tam kontrast nevycházel: bílý text na
   * světlejším konci přechodu dával 1,95 až 3,71 : 1 u VŠECH PĚTI, tedy
   * hluboko pod normou 4,5. Měsíce to nikdo neviděl, protože test
   * poctivě měřil jediný čip, který byl zapnutý.
   *
   * Proto se na ně teď klepne a změří se v tom stavu, v jakém je člověk
   * opravdu uvidí. */
  /* JEN NA VIDITELNÉ. Čip kategorie, pod kterou nejsou žádné nabídky, se
     schválně vůbec nezobrazuje (má rozměr 0×0) — dnes je to „Obec"
     a „Přímo od majitele". Klikat na ně znamená čekat na vypršení limitu
     a měřit barvy, které nikdo neuvidí. */
  const cipy = (await p.$$('.filter-chip[data-type]').catch(() => []));
  for (let i = 0; i < cipy.length; i++) {
    const vidu = await cipy[i].evaluate((e) => {
      const r = e.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    }).catch(() => false);
    if (!vidu) continue;
    await cipy[i].click({ timeout: 3000 }).catch(() => {});
    await p.waitForTimeout(180);
    const vCipu = (await p.evaluate(MERENI).catch(() => ({ nalezy: [] }))).nalezy || [];
    vCipu.filter((n) => /filter-chip/.test(n.trida || ''))
      .forEach((n) => vse.push(Object.assign({ stranka: s + ' (' + REZIM.jmeno + ', zapnutý čip)' }, n)));
  }
  await ctx.close();
}
await prohlizec.close();

// Sloučíme podle třídy a barvy — jeden problém se opakuje na stovkách prvků.
const podle = new Map();
for (const n of vse) {
  const k = n.trida + '|' + n.barva + '|' + n.pozadi + '|' + n.px;
  const z = podle.get(k) || Object.assign({}, n, { kolik: 0, stranky: new Set() });
  z.kolik++; z.stranky.add(n.stranka);
  if (n.pomer < z.pomer) z.pomer = n.pomer;
  podle.set(k, z);
}
const seznam = [...podle.values()].sort((a, b) => a.pomer - b.pomer);

console.log(`\nKontrast textu (WCAG AA): změřeno ${zmerenoCelkem} prvků, ${vse.length} neprošlo, ${seznam.length} různých případů\n`);

/* „VŠECHNO PROJDE" MUSÍ ZNAMENAT, ŽE SE OPRAVDU MĚŘILO.
   Tahle zkouška nic netvrdí o objemu — jen vypíše, co neprošlo. Když se
   tedy stránky nenačtou (spadlý server, nedostupný Leaflet, změněné
   adresy), vyjde z ní „Všechno projde" a vypadá to jako dobrá zpráva.
   Narazil jsem na to při hledání jedné vady: zkouška jednou padala
   a podruhé procházela a první, co jsem musel udělat, bylo odlišit
   „nic neprošlo" od „nebylo co měřit". Teď to odlišuje sama.
   Mez je naměřená, ne odhadnutá — viz číslo níž. */
/* Naměřeno na deseti stránkách ve dvou režimech: 3 048 prvků s vlastním
   textem. Mez je necelá polovina — zachytí nenačtené stránky a přitom
   nepadne na tom, že se v datech ubere nebo přibere pár nabídek (výpis
   na úvodu je navíc natvrdo omezený na osm položek, takže objem na
   datech skoro nezávisí). */
const MIN_ZMERENO = 1500;
if (zmerenoCelkem < MIN_ZMERENO) {
  console.error(`\n::error::Kontrast: změřilo se jen ${zmerenoCelkem} prvků, čekáno aspoň ${MIN_ZMERENO}. `
    + 'Stránky se nenačetly — „všechno projde" by tady nic neznamenalo.');
  process.exit(1);
}
for (const z of seznam.slice(0, 25)) {
  console.log(`  ${String(z.pomer).padStart(5)} : 1  (nutné ${z.mez})  ${String(z.px).padStart(2)}px  .${z.trida}`);
  console.log(`          ${z.barva} na ${z.pozadi} · ${z.kolik}× · ${[...z.stranky].slice(0, 3).join(', ')}`);
  console.log(`          „${z.text}"`);
}
if (!seznam.length) { console.log('  Všechno projde.\n'); process.exit(0); }
if (seznam.length > 25) console.log(`  …a dalších ${seznam.length - 25} případů.`);
console.error(`\n::error::Kontrast: ${vse.length} prvků nesplňuje WCAG AA. ` +
  'Opravte barvy v css/styles.css (textové varianty mají příponu -ink).');
process.exit(1);
