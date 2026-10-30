/* Test: dá se z dlouhé stránky vrátit nahoru?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-nahoru.mjs
 *
 * PROČ TAHLE ZKOUŠKA EXISTUJE. Tlačítko „nahoru" bylo napsané v HTML
 * jediné stránky z 2 105 — v index.html. Přitom na telefonu (390×844)
 * měří drazby-pozemku-nabidky 18 700 px (22 obrazovek), okresní výpis
 * Prahy-východ 11 086 px (13), krajský výpis přes deset. Kdo dojel
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
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { domUtichlo } from './zkouska-pripraveno.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');

/* Dlouhé: výpis dražeb, okresní výpis, rádce, úvod. Krátké: aplikační
   stránky, kde se nic nevypisuje. Čísla v komentáři jsou naměřená na
   390×844; zkouška si délku ověřuje sama, aby nestála na mém odhadu. */
/* Stránka cen tu bývala (10 287 px, 12 obrazovek). Dva dlouhé seznamy
   na ní nahradil vyhledávač, takže má 2 666 px — tedy 3,16 obrazovky
   proti prahu 3. Jako příklad „dlouhé stránky" by stála na hraně
   a zkouška by se lámala podle délky jedné věty; nahradila ji krajská
   stránka, která seznam okresů pořád má.

   A 29. 10. SE NA TÉŽE HRANĚ OCITLA I TA KRAJSKÁ. Sjednocení odsazení
   desek (20 → 16 px, §213) stránky zkrátilo a Středočeský kraj spadl
   na 2 695 px = 2,99 obrazovky — o pět pixelů pod práh. Naměřeno:

     1280 px: Středočeský 2 695 (2,99), Jihomoravský 2 688 (2,99),
              okres Benešov 4 131 (4,59), data 4 992 (5,55)
      390 px: Středočeský 7 570 (8,97) — na telefonu je dlouhá dost

   Práh 3 je pravidlo aplikace (js/hlavicka.js), takže se nesnižuje;
   vyměnil se vzorek. Jako „dlouhá" stojí teď data.html: 5,55 obrazovky
   na počítači a 11,57 na telefonu, tedy s rezervou na obou šířkách,
   a je to jiný typ stránky než zbylé tři (dlouhý text místo výpisu).

   POZNÁMKA K WEBU, ne ke zkoušce: na krajské stránce se tím pádem
   tlačítko „nahoru" na počítači neukáže. Je to důsledek sjednocení,
   ne vada — stránka na dvě a tři čtvrtě obrazovky se projde bez něj. */
const DLOUHE = ['drazby-pozemku-nabidky.html', 'pozemky-okres-benesov.html',
  'data.html', 'index.html'];
const KRATKE = ['hlidani.html', 'zpravy.html', 'kontakt.html'];
const PRAH_OBRAZOVEK = 3;   // stejný práh jako v js/hlavicka.js

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Tlačítko nahoru', zpravy);
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

/* ČEKÁ SE NA STAV, NE NA HODINKY. Knoflík se objevuje a mizí
   přechodem (§154), takže pevné čekání měří jednou hotový stav a jednou
   půlku přechodu — v CI se naměřilo krytí 0,92, tedy přesně prostředek.
   Vrací první stav, který podmínce odpovídá, a když nepřijde, ten
   poslední — ať má hláška co ukázat. */
async function dokud(p, podminka, strop = 2500) {
  const do_ = Date.now() + strop;
  let s = await stav(p);
  while (Date.now() < do_) {
    if (s && podminka(s)) return s;
    await p.waitForTimeout(100);
    s = await stav(p);
  }
  return s;
}

for (const [W, H] of [[390, 844], [1280, 900]]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: W, height: H },
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
      await p.evaluate(KLID);
      /* DRUHÝ SKOK NA KONEC, A MÁ TO DŮVOD. Na krajských a okresních
         stránkách se graf cenové hladiny kreslí, až když se k němu
         někdo doroluje (js/graf-cen.js) — a od chvíle, kdy jde výpis
         nabídek nahoru a graf pod něj, se dokresluje právě na konci
         stránky. Stránka tím po prvním skoku vyroste o jeho výšku
         a „konec" je zase o kus dál: naměřeno, patička zůstala
         227 px pod spodní hranou okna. Člověk, který roluje postupně,
         na to nenarazí; skok na konec ano. */
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

/* --- Knoflík nesmí ležet na hlavní akci stránky -----------------
   Našlo se FOTKOU z iPhonu, ne zkouškou: plovoucí kolečko „nahoru"
   sedělo přes pravý konec tlačítka „Uložit" na stránce pozemku.
   Naměřeno na 390 px: kolečko x 330–376, řádek akcí končí na 370 —
   překryv 40 px, a klepnutí do něj vyvolá rolování místo uložení.
   Knoflík proto ustupuje: dokud je řádek s hlavní akcí v pásu u spodní
   hrany, kde knoflík stojí, nekreslí se. Měří se obojí — že ustoupil,
   i že se jinde vrátí (jinak by stačilo ho zrušit). */
{
  const ctxP = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const KOREN = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const POZEMEK = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
  const p = await ctxP.newPage();
  await p.goto(`${BASE}/${POZEMEK}`, { waitUntil: 'domcontentloaded' });
  /* STRÁNKA POZEMKU SE DOKRESLUJE Z JS, TAKŽE SE ČEKÁ NA TICHO, NE NA
     HODINKY. Do 30. 10. tu stálo waitForTimeout(2200) a v CI (běh 811)
     to shodilo kontrolu ústupu: naměřilo se {"show":true,"kryti":0.92}.
     Posun se totiž počítá z polohy řádku akcí — a když se mezitím nad
     něj vloží další obsah (graf, mapa), řádek se posune dolů, v pásu u
     spodní hrany už není, knoflík SPRÁVNĚ zůstane vidět a zkouška hlásí
     vadu webu, která tam není. Na mém stroji to prošlo 198 kontrol bez
     chyby, protože se stihlo dokreslit dřív. */
  await domUtichlo(p, 400);
  const posun = (kam) => p.evaluate((k) => {
    const a = document.querySelector('.pz-akce-hlavni');
    if (!a) return false;
    const r = a.getBoundingClientRect();
    window.scrollTo(0, r.top + window.pageYOffset - (k === 'dno' ? (innerHeight - r.height - 40) : 220));
    return true;
  }, kam);
  /* V jakém pásu řádek akcí po posunu OPRAVDU leží. Pás knoflíku je
     24 až 70 px nade dnem okna (js/hlavicka.js), takže tohle je přesně
     ta podmínka, na kterou web reaguje — a zkouška ji musí umět ověřit,
     ne jen předpokládat. */
  const vPasu = () => p.evaluate(() => {
    const a = document.querySelector('.pz-akce-hlavni');
    if (!a) return null;
    const r = a.getBoundingClientRect();
    return r.top < innerHeight - 24 && r.bottom > innerHeight - 70;
  });
  const jeAkce = await posun('dno');
  // PŘEDPOKLAD: bez řádku akcí by se neporovnávalo nic
  pravda(`stránka pozemku ${POZEMEK} má řádek s hlavní akcí`, jeAkce === true,
    '.pz-akce-hlavni na stránce není');
  if (jeAkce) {
    /* Kdyby se stránka protáhla ještě po posunu, posune se znovu —
       jinak by se měřil jiný stav, než o kterém zkouška mluví. */
    for (let i = 0; i < 3 && !(await vPasu()); i++) { await posun('dno'); await p.waitForTimeout(400); }
    pravda('řádek s hlavní akcí se posunem opravdu dostal do pásu knoflíku',
      (await vPasu()) === true, 'posun se nepovedl — kontrola níž by neměřila ústup');
    const uDna = await dokud(p, (s) => s.show === false, 2500);
    pravda('tlačítko nahoru ustoupí, když je hlavní akce u spodní hrany',
      uDna && uDna.show === false && uDna.udalosti === 'none', JSON.stringify(uDna));
    await posun('nahore');
    const jinde = await dokud(p, (s) => s.show === true, 2500);
    pravda('a jinde na téže stránce se vrátí', jinde && jinde.show === true
      && jinde.udalosti === 'auto', JSON.stringify(jinde));
  }

  /* A U SPODNÍ HRANY NESTOJÍ ŽÁDNÁ PŘIPNUTÁ LIŠTA.
     Do 30. 10. tam byla karta s cenou a tlačítkem (#pz-lista). Majitel
     ji nechal zrušit: „pořád tam dole bliká ta kravina ‚K dražbě'" —
     objevovala se a mizela podle toho, jestli je vidět cena nahoře, na
     iPhonu k tomu poskakovala s lištami Safari a ležela přes obsah.
     Hlídá se to měřením, ne hledáním třídy: cokoli PŘIPNUTÉHO u spodní
     hrany přes půl šířky je zpátky táž vada, ať se to jmenuje jakkoli.
     Kulatý návrat nahoru je z toho vyjmutý — ten tam patří a je malý. */
  const dole = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('body *').forEach((e) => {
      const cs = getComputedStyle(e);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') return;
      if (cs.display === 'none' || cs.visibility === 'hidden' || !e.getClientRects().length) return;
      if (e.id === 'to-top' || e.closest('#to-top')) return;
      const r = e.getBoundingClientRect();
      if (r.bottom < innerHeight - 120 || r.width < innerWidth / 2) return;
      out.push((e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.className ? '.' + String(e.className).trim().split(/\s+/).join('.') : ''))
        + ' ' + Math.round(r.width) + '×' + Math.round(r.height));
    });
    return [...new Set(out)];
  });
  pravda('u spodní hrany nestojí připnutá lišta', dole.length === 0,
    'našlo se: ' + dole.join(', ') + ' — spodní lišta je od 30. 10. zrušená');

  /* POJISTKA PROTI PŘEHNANÉMU USTUPOVÁNÍ. Knoflík uhýbá hlavní akci
     (výš) a je lákavé to zobecnit na „ustup každému ovladači pod
     sebou". Zkusil jsem to 27. 10. — ptát se po doznění posunu
     prohlížeče, co pod kolečkem leží (elementsFromPoint v pěti
     bodech). Na stránce pozemku to sedlo: kolečko přestalo ležet na
     tlačítku „Navigovat" v kartě se souřadnicemi. Jenže na výpisu
     dražeb má tlačítko „Uložit" každá karta, takže kolečko zmizelo
     i tam, kde ho tahle zkouška vyžaduje — a zmizet nesmí, protože
     ta stránka má 18 700 px a bez něj se z jejího konce nahoru
     nedostane nikdo. Zobecnění je proto ZAHOZENÉ (viz §176) a tahle
     kontrola drží, aby se nevrátilo oklikou: na dvaceti polohách
     okresní stránky musí být knoflík vidět aspoň ve třech
     čtvrtinách. */
  const pv = await ctxP.newPage();
  await pv.goto(`${BASE}/pozemky-okres-benesov.html`, { waitUntil: 'load' });
  await pv.waitForTimeout(2000);
  let videt = 0, poloh = 0;
  for (let y = 900; y <= 4700; y += 200) {
    /* `behavior:'instant'` schválně: stylopis má plynulé rolování
       a po obyčejném scrollTo by stránka ještě stála na místě. */
    await pv.evaluate((yy) => window.scrollTo({ top: yy, behavior: 'instant' }), y);
    await pv.waitForTimeout(260);
    const doslo = await pv.evaluate((yy) => Math.round(window.pageYOffset) >= yy - 5, y);
    if (!doslo) break;
    poloh++;
    if (await pv.evaluate(() => getComputedStyle(document.querySelector('.to-top')).opacity === '1')) videt++;
  }
  // PŘEDPOKLAD: bez projitých poloh by kontrola níž prošla naprázdno
  pravda('na výpisu se prošlo aspoň deset poloh', poloh >= 10, `poloh ${poloh}`);
  pravda('a tlačítko je na výpisu vidět aspoň ve třech čtvrtinách z nich',
    poloh >= 10 && videt >= poloh * 0.75, `vidět ${videt} z ${poloh}`);
  await pv.close();
  await ctxP.close();
}

/* --- A na úzkém monitoru nesmí ležet na výpisu ------------------
   Táž vada o patro výš: pilulka „↑ Nahoru" je 110 px široká a stojí
   24 px od hrany okna, kdežto text má 1136 px (strop 1200 minus
   okraj stránky). Dokud je okno užší než 1412 px, postranní pruh na
   pilulku nestačí a ta sedí na výpisu — naměřeno 27. 10. na okresní
   stránce: na 1100 px zakrývala dvě místa s textem a kartu, na
   1280 px jedno místo a kartu, na 1400 px kartu o 2 px.

   Od 1440 px výš se pilulka vedle obsahu vejde a zůstává i se jménem
   (pruh 152 px, rezerva 18). Pod tím je z ní kolečko 46 px, jehož
   odsazení se počítá z šířky pruhu. Pod 640 px už je obsah přes celou
   obrazovku a uhnout se nedá (tam platí ustupování výš podle hlavní
   akce).

   PRUH SE MĚŘÍ PROTI TLAČÍTKU, NE PROTI JEHO ŠÍŘCE. Tahle zkouška
   tu nejdřív žádala jen `pruh ≥ šířka + 4` a na odsazení od hrany
   zapomněla. Na 1400 px tím prošla s pruhem 132 a pilulkou 110,
   ačkoli pilulka stojí 24 px od hrany a 134 px se do 132 nevejde:
   zkouška hlásila překryv a zároveň tvrdila, že se tlačítko vedle
   obsahu vejde. Ptá se proto na to, co rozhoduje — vejde-li se do
   pruhu vůbec tvar tlačítka, musí platit, že nic nezakrývá; teprve
   když je pruh užší než tlačítko samo, je překryv nevyhnutelný
   a jediné, co se dá žádat, je tisk k hraně. */
{
  const ctxM = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 1100, height: 900 }, locale: 'cs-CZ' });
  const pm = await ctxM.newPage();
  const VYPIS = 'pozemky-okres-benesov.html';
  /* 1240 px je tu z měření, ne z kulatosti: právě tam leželo kolečko
     s odsazením `50% − 594px` na kartě i na ceně, zatímco na 1100,
     1280 a 1440 px prošlo. Dokud se měřily jen ty tři šířky, nemělo
     to co zčervenat. Tabulka naměřená 27. 10. (zakrývá / nezakrývá,
     staré odsazení proti novému):
       1180  32 px pruh   zakrývá oboje (pruh < kolečko, nevyhnutelné)
       1240  52 px pruh   staré zakrývá, nové nic
       1260  62 px pruh   staré zakrývá, nové nic
       1276  70 px pruh   obě nic
       1440 152 px pruh   pilulka, obě nic
     1400 px je v seznamu z druhého důvodu: na něm se lámala hranice
     mezi kolečkem a pilulkou. S pilulkou tam pruh 132 px na 110 + 24
     nestačí a kryje kartu o 2 px — šířka 1400 tedy drží, že se
     pilulka pouští až od 1440. */
  for (const W of [1100, 1240, 1280, 1400, 1440]) {
    await pm.setViewportSize({ width: W, height: 900 });
    await pm.goto(`${BASE}/${VYPIS}`, { waitUntil: 'load' });
    await pm.waitForTimeout(1400);
    await pm.evaluate(() => window.scrollTo(0, 1800));
    await pm.waitForTimeout(700);
    const v = await pm.evaluate(() => {
      const t = document.querySelector('.to-top');
      if (!t) return null;
      const r = t.getBoundingClientRect();
      const kryte = [];
      document.querySelectorAll('.okr-cena, .okr-src, .okr-place, .okr-meta, .okr-item').forEach((e) => {
        const g = e.getBoundingClientRect();
        if (g.right > r.left && g.left < r.right && g.bottom > r.top && g.top < r.bottom)
          kryte.push(String(e.className).split(' ')[0]);
      });
      const W2 = document.documentElement.clientWidth;
      const karty = [...document.querySelectorAll('.okr-item')]
        .map((e) => W2 - e.getBoundingClientRect().right);
      return { vidno: getComputedStyle(t).opacity, sirka: Math.round(r.width),
        zprava: Math.round(W2 - r.right),
        /* pruh = kolik zbývá vpravo od nejpravější karty výpisu */
        pruh: karty.length ? Math.round(Math.min(...karty)) : 0,
        polozek: document.querySelectorAll('.okr-item').length, kryte: [...new Set(kryte)] };
    });
    // PŘEDPOKLAD: bez vykresleného výpisu a svítícího tlačítka by kontrola prošla naprázdno
    pravda(`${W}px: výpis i tlačítko jsou na obrazovce`,
      !!v && v.vidno === '1' && v.polozek > 5, JSON.stringify(v));
    if (v) {
      /* MÁ VŮBEC KAM UHNOUT? Text má 1 136 px, ale v užším okně se
         o strop neopře a drží se okraje stránky (32 px). Pruh pak
         měří 32 px a kolečko 46 — v takovém okně se vedle výpisu
         nevejde nic a jediné, co se dá žádat, je aby se tisklo
         k hraně. Naměřeno 27. 10. (po §175, kdy výpis přišel o vnější
         kartu a rozšířil se o 20 px): na 1 100 px pruh 32 px, na
         1 280 px 72 px, na 1 400 px 132 px, na 1 440 px 152 px. */
      const vejdeSe = v.pruh >= v.sirka;
      if (vejdeSe) {
        pravda(`${W}px: tlačítko nahoru neleží na výpisu`, v.kryte.length === 0,
          'zakrývá: ' + v.kryte.join(', '));
      } else {
        pravda(`${W}px: v úzkém okně se tlačítko aspoň tiskne k hraně`,
          v.zprava <= 8, `pruh ${v.pruh} px, tlačítko ${v.sirka} px, od hrany ${v.zprava} px`);
      }
      pravda(`${W}px: a má tvar, který se vedle obsahu vejde`,
        W >= 1440 ? v.sirka > 90 : v.sirka <= 50, `šířka ${v.sirka} px`);
    }
  }
  await ctxM.close();
}

await prohlizec.close();
console.log('\nTlačítko „nahoru" na dlouhých stránkách');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  /* Do anotace v CI se dostane jen tenhle jediný řádek. Dokud na něm
     stál pouhý počet, nedalo se z něj poznat vůbec nic: osm kontrol
     padalo několik dní po sobě a z e-mailu šlo zjistit jen to, že jich
     bylo osm. Jmenovat padlé kontroly umí scripts/chyby-hlaska.mjs
     pro všechny zkoušky stejně; tady to kdysi stálo zvlášť. */
  console.log('::error::Tlačítko nahoru: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
