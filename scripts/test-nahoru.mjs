/* Test: dá se z dlouhé stránky vrátit nahoru?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-nahoru.mjs
 *
 * PROČ TAHLE ZKOUŠKA EXISTUJE. Tlačítko „nahoru" bylo napsané v HTML
 * jediné stránky z 2 105 — v index.html. Přitom na telefonu (390×844)
 * měří drazby-pozemku-nabidky 18 700 px (22 obrazovek), okresní výpis
 * Prahy-východ 11 086 px (13), cena-pozemku 10 287 px (12). Kdo dojel
 * na konec, neměl čím se vrátit: hlavička je pevná, ale při pohybu
 * zhasíná, a obsahový rozcestník rádců se na telefonu neukazuje vůbec.
 * Nic nespadlo a nic nevypadalo rozbitě — proto to tak dlouho vydrželo
 * a proto to má mít zkoušku, ne jen záznam v commitu.
 *
 * Hlídá se obojí: že se tlačítko na dlouhé stránce objeví, A ŽE SE NA
 * KRÁTKÉ NEOBJEVÍ. Plovoucí knoflík na stránce, kde je konec na dosah,
 * je smetí — a tenhle web má zaplavenost jako hlavní stížnost.
 *
 * DVA STEJNÉ VZORKY NEZNAMENAJÍ KLID. Web má html{scroll-behavior:smooth},
 * takže scrollTo animuje a na začátku i na konci jede pomalu. Dva vzorky
 * po 60 ms vyjdou stejné, i když se stránka pořád hýbe. Když jsem to
 * takhle měřil, zkouška hlásila „po kliknutí y=1082" a chyba byla v ní,
 * ne v tlačítku. Čeká se proto na šest shodných vzorků a nejméně 700 ms.
 *
 * CO TAHLE ZKOUŠKA NEUHLÍDÁ — ať se na ni nespoléhá víc, než snese.
 * Zkoušel jsem čtyři sabotáže js/hlavicka.js. Tři zčervenaly (vypnutý
 * ohled na patičku 8 kontrol, nepřesunutý kurzor 16, nedopsané tlačítko
 * 14). ČTVRTÁ NE: snížení prahu délky na nulu zkouška nepoznala. Není
 * slepá — ten stav se z téhle strany nedá vyrobit. Na krátké stránce je
 * totiž po 500 px posunu vždycky v obraze patička, a ta tlačítko schová
 * i bez prahu. Nejblíž je kontakt.html: patička začíná na 1 258 px a
 * schovávat se začíná od 1 284 px, takže chybí dvacet šest pixelů.
 * Práh délky tedy dnes výsledek nikdy nemění, ale mrtvý není: stačila by
 * stránka dlouhá 2,6 obrazovky s nižší patičkou a rozhodoval by on.
 * Zkouška proto tvrdí to, co je vidět („na krátké se neukáže"), ne to,
 * které ze dvou pravidel to zařídilo.
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');

/* Dlouhé: výpis dražeb, okresní výpis, rádce, úvod. Krátké: aplikační
   stránky, kde se nic nevypisuje. Čísla v komentáři jsou naměřená na
   390×844; zkouška si délku ověřuje sama, aby nestála na mém odhadu. */
const DLOUHE = ['drazby-pozemku-nabidky.html', 'pozemky-okres-benesov.html',
  'cena-pozemku.html', 'index.html'];
const KRATKE = ['hlidani.html', 'zpravy.html', 'kontakt.html'];
const PRAH_OBRAZOVEK = 3;   // stejný práh jako v js/hlavicka.js

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const KLID = `(async () => {
  const t0 = Date.now(); let posl = null, shod = 0;
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 60));
    const y = Math.round(window.pageYOffset);
    shod = (y === posl) ? shod + 1 : 0; posl = y;
    if (shod >= 6 && Date.now() - t0 > 700) break;
  }
  return posl;
})()`;

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

function stav(p) {
  return p.evaluate(() => {
    const e = document.getElementById('to-top');
    if (!e) return null;
    const r = e.getBoundingClientRect(), st = getComputedStyle(e);
    const kdo = document.elementFromPoint(Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2));
    return { show: e.classList.contains('show'), w: Math.round(r.width), h: Math.round(r.height),
      kryti: Number(st.opacity), udalosti: st.pointerEvents,
      navrchu: kdo === e || e.contains(kdo), popis: e.getAttribute('aria-label') || '' };
  });
}

for (const [W, H] of [[390, 844], [1280, 900]]) {
  const ctx = await prohlizec.newContext({ viewport: { width: W, height: H },
    deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700 });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
      const f = path.join(LEAFLET, path.basename(u.pathname));
      if (existsSync(f)) return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });

  for (const s of DLOUHE.concat(KRATKE)) {
    const dlouha = DLOUHE.indexOf(s) !== -1;
    const p = await ctx.newPage();
    const nactena = await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' })
      .then((r) => r && r.ok()).catch(() => false);
    if (!nactena) { pravda(`${W}px ${s} se načetla`, false, 'stránka nedojela'); await p.close(); continue; }
    /* index.html drží po načtení 1,8 s vršek (obrana proti obnově polohy
       na iOS, viz skript v jeho hlavičce) — do té doby by se posun vrátil. */
    await p.waitForTimeout(s === 'index.html' ? 2600 : 1400);

    const vyska = await p.evaluate(() => document.documentElement.scrollHeight);
    const obrazovek = vyska / H;
    /* Pojistka proti průchodu na prázdnu: kdyby stránka přestala mít obsah,
       tvrzení „krátká nemá tlačítko" by procházelo samo a tvrzení o dlouhé
       by padalo z jiného důvodu, než se zkouší. */
    pravda(`${W}px ${s} je ${dlouha ? 'delší' : 'kratší'} než ${PRAH_OBRAZOVEK} obrazovky`,
      dlouha ? obrazovek > PRAH_OBRAZOVEK : obrazovek < PRAH_OBRAZOVEK,
      `naměřeno ${Math.round(vyska)} px = ${obrazovek.toFixed(1)} obrazovek`);

    const nahore = await stav(p);
    pravda(`${W}px ${s}: tlačítko „nahoru" na stránce je`, nahore !== null, 'prvek #to-top chybí');
    if (nahore === null) { await p.close(); continue; }
    pravda(`${W}px ${s}: úplně nahoře se neukazuje`, nahore.show === false,
      'svítí, i když je vršek na dosah');
    pravda(`${W}px ${s}: má popis pro odečítač`, /nahoru/i.test(nahore.popis), `aria-label „${nahore.popis}"`);

    /* Krátká stránka se o 900 px posunout nedá — dojede na svůj konec.
       Když jsem tu žádal 900 px i od nich, zkouška zčervenala na tom, že
       hlidani.html má dohromady 1 513 px; chyba byla ve zkoušce. */
    const maxPosun = Math.max(0, vyska - H);
    const cilPosunu = Math.min(900, maxPosun);
    await p.evaluate(() => window.scrollTo(0, 900));
    const y1 = await p.evaluate(KLID);
    pravda(`${W}px ${s}: posun o ${Math.round(cilPosunu)} px se opravdu stal`,
      y1 >= cilPosunu - 40, `skončilo na ${y1}, dál než na ${Math.round(maxPosun)} to nejde`);
    const po = await stav(p);
    if (dlouha) {
      pravda(`${W}px ${s}: po posunu se tlačítko ukáže`, po.show === true, JSON.stringify(po));
      pravda(`${W}px ${s}: je vidět a jde na něj klepnout`,
        po.kryti > 0.9 && po.udalosti === 'auto' && po.navrchu, JSON.stringify(po));
      pravda(`${W}px ${s}: je aspoň 44×44 px`, po.w >= 44 && po.h >= 44, `${po.w}×${po.h}`);
    } else {
      pravda(`${W}px ${s}: na krátké stránce se neukáže ani po posunu`,
        po.show === false, JSON.stringify(po));
      pravda(`${W}px ${s}: a nejde na něj klepnout`,
        po.udalosti === 'none' && po.navrchu === false, JSON.stringify(po));
    }

    if (dlouha) {
      /* U PATIČKY TLAČÍTKO ZŮSTÁVÁ — a tahle zkouška dřív vyžadovala opak.
         Stálo tu „u patičky uhne: kdo je na konci, chce její odkazy".
         Jenže to druhé se nikdy neověřilo: změřeno na třech typech
         stránek ve třech šířkách, tlačítko nepřekrývalo ANI JEDEN odkaz
         patičky v devíti případech z devíti — patička má odkazy ve
         sloupcích vlevo a pravý dolní roh volný. Zato cena byla
         skutečná: tlačítko mizelo přesně na konci stránky dlouhé
         4 000 až 17 000 px, tedy tam, kde ho člověk potřebuje nejvíc,
         a zpátky nahoru se odtud nedalo dostat jinak než palcem přes
         celou stránku.
         Hlídá se proto to, co ta původní úvaha chtěla, jen přímo:
         tlačítko je vidět A ZÁROVEŇ nepřekrývá nic, na co se dá
         v patičce klepnout. Kdyby patička někdy narostla doprava,
         spadne tahle kontrola — a to je správně, protože to je ta
         chvíle, kdy začne vadit. */
      await p.evaluate(() => window.scrollTo(0, 1e7));
      const yK = await p.evaluate(KLID);
      const konec = await stav(p);
      const patka = await p.evaluate(() => {
        const f = document.querySelector('footer');
        return f ? Math.round(f.getBoundingClientRect().top) : null;
      });
      pravda(`${W}px ${s}: na konci je patička v obraze`, patka !== null && patka < H - 60,
        `patička začíná na ${patka}, okno ${H}`);
      pravda(`${W}px ${s}: na konci stránky je tlačítko pořád vidět`,
        konec.show === true && konec.kryti > 0.9 && konec.navrchu,
        `y=${yK}, ${JSON.stringify(konec)}`);
      const prekryv = await p.evaluate(() => {
        const b = document.querySelector('#to-top');
        const f = document.querySelector('footer');
        if (!b || !f) return { chybi: true };
        const rb = b.getBoundingClientRect();
        const kolize = [];
        f.querySelectorAll('a, button, input, [role="button"]').forEach((e) => {
          const r = e.getBoundingClientRect();
          if (!r.width || !r.height) return;
          if (r.left < rb.right && r.right > rb.left && r.top < rb.bottom && r.bottom > rb.top) {
            kolize.push((e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 30));
          }
        });
        return { kolize: kolize, odkazu: f.querySelectorAll('a, button').length };
      });
      pravda(`${W}px ${s}: a nepřekrývá nic, na co se dá v patičce klepnout`,
        !prekryv.chybi && prekryv.kolize.length === 0,
        `překrývá: ${(prekryv.kolize || []).join(', ')} (z ${prekryv.odkazu} prvků patičky)`);

      /* Klepnutí myší: vrátí stránku nahoru a kurzor nikam neodskočí. */
      await p.evaluate(() => window.scrollTo(0, 1600));
      await p.evaluate(KLID);
      await p.click('#to-top');
      const yM = await p.evaluate(KLID);
      pravda(`${W}px ${s}: klepnutí vrátí stránku na začátek`, yM === 0, `skončilo na ${yM}`);
      const kurzorM = await p.evaluate(() => {
        const a = document.activeElement;
        const sl = document.querySelector('.skip-link');
        return { je: a ? (String(a.className).split(' ')[0] || a.tagName) : null,
          preskok: sl ? Math.round(sl.getBoundingClientRect().width) : null };
      });
      pravda(`${W}px ${s}: myší se přeskakovací odkaz nevytáhne`,
        kurzorM.je !== 'skip-link', JSON.stringify(kurzorM));

      /* Klávesou: kurzor putuje s obrazem na přeskakovací odkaz, který se
         zaostřením sám ukáže — jinak by člověk zůstal v pořadí tabulátoru
         dole u patičky, odkud právě odjel. */
      await p.evaluate(() => window.scrollTo(0, 1600));
      await p.evaluate(KLID);
      await p.evaluate(() => document.getElementById('to-top').focus());
      await p.keyboard.press('Enter');
      const yK2 = await p.evaluate(KLID);
      const kurzorK = await p.evaluate(() => {
        const a = document.activeElement;
        const sl = document.querySelector('.skip-link');
        const m = document.querySelector('main');
        return { je: a ? (String(a.className).split(' ')[0] || a.tagName) : null,
          sirka: a ? Math.round(a.getBoundingClientRect().width) : null,
          preskokSirka: sl ? Math.round(sl.getBoundingClientRect().width) : null,
          /* ROZHODUJE STYL, NE ŠÍŘKA. getComputedStyle(…).outlineWidth
             vrací u nepoužitého rámečku výchozí „medium", a kolik to je,
             si každá verze prohlížeče počítá po svém: Chromium 141
             spočítá 0px, novější 3px. Test tím měsíce měřil verzi
             prohlížeče, ne web — v CI padal pokaždé, lokálně nikdy.
             Jestli je rámeček VIDĚT, říká outline-style: „none" znamená,
             že se nekreslí, ať je šířka jakákoli. */
          mainObrysStyl: m ? getComputedStyle(m).outlineStyle : null,
          mainObrys: m ? getComputedStyle(m).outlineWidth : null };
      });
      pravda(`${W}px ${s}: Enter taky vrátí na začátek`, yK2 === 0, `skončilo na ${yK2}`);
      pravda(`${W}px ${s}: klávesou kurzor skočí na přeskakovací odkaz`,
        kurzorK.je === 'skip-link', JSON.stringify(kurzorK));
      pravda(`${W}px ${s}: a ten je po zaostření vidět`,
        kurzorK.preskokSirka !== null && kurzorK.preskokSirka > 80, JSON.stringify(kurzorK));
      /* Kurzor nesmí jít na <main>: má id="obsah" a globální pravidlo
         `:focus-visible{outline:2px}` by obtáhlo rámečkem celý obsah. */
      pravda(`${W}px ${s}: obsah stránky nedostal rámeček přes celou šířku`,
        kurzorK.mainObrysStyl === 'none' || kurzorK.mainObrysStyl === null,
        `outline-style <main> „${kurzorK.mainObrysStyl}", šířka ${kurzorK.mainObrys}`);
    }
    await p.close();
  }
  await ctx.close();
}

await prohlizec.close();
console.log('\nTlačítko „nahoru" na dlouhých stránkách');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  /* Do anotace v CI se dostane jen tenhle jediný řádek. Dokud na něm
     stál pouhý počet, nedalo se z něj poznat vůbec nic: osm kontrol
     padalo několik dní po sobě a z e-mailu šlo zjistit jen to, že jich
     bylo osm. Teď nese první padlou kontrolu i s naměřenými čísly. */
  const prvni = zpravy.find((z) => z.indexOf('✕') !== -1) || '';
  console.log('::error::Tlačítko nahoru: ' + chyb + ' kontrol neprošlo. První: '
    + prvni.replace(/\s+/g, ' ').replace(/^\s*✕\s*/, '').slice(0, 240));
  process.exit(1);
}
process.exit(0);
