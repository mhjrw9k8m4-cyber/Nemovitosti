// Test: hlavička zůstane nahoře, ať se roluje kamkoli.
//
// Spuštění: node scripts/test-hlavicka.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Na iPhonu se lepivá hlavička při rolování odlepila a odjela od horního
// okraje — nad ní pak prosvítal obsah stránky. V Chromu se to nedělo, takže
// to jde poznat jen podle příčin, ne podle příznaku. Známé příčiny jsou tři
// a všechny tři tu byly:
//
// 1) „overflow-x:hidden" na <html>. Dělá z kořene posuvný rámec a na iOS tím
//    position:sticky rozbíjí. Clipping se dá udělat přes „overflow-x:clip",
//    který nic posuvného nevytváří.
// 2) „background-attachment:fixed" na <body>. iOS Safari to neumí; při
//    rolování z toho jsou přeskoky, které si berou i lepivou hlavičku.
// 3) „backdrop-filter" (rozmazané pozadí) na lepivé hlavičce. Rozmazaná
//    vrstva se překresluje se zpožděním za zbytkem stránky, takže pod ní
//    na okamžik prosvítá obsah.
//
// 4) MÍCHANÁ CELOOBRAZOVKOVÁ VRSTVA NAD HLAVIČKOU. Zrno přes celou stránku
//    bylo position:fixed, přes celé okno, nad hlavičkou (z-index 9999) a
//    míchané s pozadím (mix-blend-mode). Kvůli míchání musí Safari každý
//    snímek počítat, co je pod tou vrstvou — tedy celou stránku i hlavičku —
//    a překreslování fixních prvků se tím rozjede. Tohle byla ta příčina,
//    kterou tři předchozí opravy minuly, protože se hledalo na hlavičce
//    samotné, a ne nad ní. Ta vrstva je dneska zrušená úplně, na všech
//    zařízeních (dřív jen na dotyku), a kontrola níž hlídá, že se
//    nevrátí: žádná celoobrazovková míchaná vrstva nad hlavičkou.
//
// A jedna příčina, která není v CSS, ale v logice (js/hlavicka.js):
// „přestaly chodit scroll události" NEZNAMENÁ „obraz stojí". Na iPhonu
// události při setrvačném dojezdu na chvíli ustanou a sbalování lišty
// Safari neudělá scroll událost vůbec — posune se jenom visualViewport.
// Hlavička se pak rozsvítila uprostřed pohybu na starém místě.
//
// Poslední bod má i pojistku navíc: hlavička je NEPRŮHLEDNÁ, a to všude,
// ne jen na dotyku. I kdyby prohlížeč překreslil pozdě, není čím prosvítat.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Hlavička', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(opt, stranka) {
  const ctx = await prohlizec.newContext(Object.assign({ bypassCSP: true,  serviceWorkers: 'block' }, opt));
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    await ctx.route(`${BASE}/${stranka}*`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  return { ctx, p };
}

const TELEFON = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const MONITOR = { viewport: { width: 1280, height: 900 } };

// --- 1) Drží nahoře při rolování ------------------------------------
for (const [jm, opt, stranka] of [['telefon', TELEFON, 'index.html'], ['monitor', MONITOR, 'index.html'],
                                  ['textová stránka', TELEFON, 'cena-pozemku.html']]) {
  const { ctx, p } = await otevri(opt, stranka);
  const mista = [];
  for (const y of [0, 150, 400, 900, 1800, 3200]) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    await p.waitForTimeout(220);
    /* A pak počkat, až hlavička DOJEDE. Přijíždí animací hlPrijezd, která
       ji na 0,42 s posune o 7 px nahoru — to je záměr popsaný v css u těch
       klíčových snímků. Měřit 220 ms po odrolování tedy znamená občas
       trefit rozjetý posun a vyčíst −7 až −4 px místo nuly. Na tomhle
       stroji animace do 220 ms doběhla a zkouška mlčela; na běžci GitHubu
       ne, a padala tam od 24. září na každém pushi. Čeká se proto na
       dojetí, ne na pevný čas — tvrzení „hlavička stojí na nule" zůstává
       stejně přísné, jen se měří v klidu. */
    await p.waitForFunction(() => {
      const h = document.getElementById('header');
      if (!h) return true;
      if (!h.getAnimations) return true;
      return h.getAnimations().every((a) => a.playState !== 'running');
    }, null, { timeout: 4000 }).catch(() => {});
    mista.push(await p.evaluate(() => {
      const h = document.getElementById('header');
      if (!h) return { chybi: true };
      const r = h.getBoundingClientRect();
      return { top: Math.round(r.top), vyska: Math.round(r.height), scroll: Math.round(window.scrollY) };
    }));
  }
  pravda(`${jm}: hlavička na stránce je`, !mista[0].chybi);
  const odlepene = mista.filter((m) => !m.chybi && m.top !== 0);
  pravda(`${jm}: hlavička zůstane přilepená nahoře`, odlepene.length === 0,
    odlepene.map((m) => `při scrollu ${m.scroll} byla na ${m.top} px`).join(', '));
  // Nesmí se ani „schovat" tím, že by měla nulovou výšku.
  pravda(`${jm}: a je pořád vidět`, mista.every((m) => m.chybi || m.vyska > 30),
    JSON.stringify(mista.map((m) => m.vyska)));
  await ctx.close();
}

// --- 2) Nic pod ní neprosvítá ----------------------------------------
// Na dotyku musí být hlavička neprůhledná. Rozmazané sklo je hezké, ale
// právě ono se na iOS překresluje pozdě.
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  const v = await p.evaluate(() => {
    const c = getComputedStyle(document.getElementById('header'));
    const m = (c.backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return { barva: c.backgroundColor, pruhlednost: m.length >= 4 ? m[3] : 1,
      rozmazani: c.backdropFilter || 'none', pozadiTela: getComputedStyle(document.body).backgroundAttachment };
  });
  pravda('telefon: hlavička je neprůhledná', v.pruhlednost >= 0.99,
    `krytí ${v.pruhlednost} (${v.barva}) — pod poloprůhlednou prosvítá obsah, když se překreslí pozdě`);
  pravda('telefon: bez rozmazaného pozadí', v.rozmazani === 'none', `backdrop-filter: ${v.rozmazani}`);
  pravda('telefon: plocha stránky není připnutá k oknu', v.pozadiTela !== 'fixed',
    'background-attachment:fixed dělá na iOS přeskoky při rolování');
  await ctx.close();
}
/* TADY SE HLÍDALO, ŽE NA MONITORU ROZMAZANÉ SKLO ZŮSTÁVÁ. Teď se hlídá
   pravý opak: hlavička má JEDNU neprůhlednou barvu na všech zařízeních.
   Dvě věci to rozhodly. Průsvitná hlavička mění barvu podle toho, co se
   pod ní právě roluje, takže se nikdy neshodne s barvou lišty prohlížeče
   (meta theme-color je jedna hodnota) — a právě ten rozdíl byl vidět jako
   šev mezi lištou a stránkou. A backdrop-filter dělá vztažný rámec pro
   position:fixed potomky, kvůli čemuž se #nav polohoval podle hlavičky,
   a ne podle okna. Neprůhledná hlavička obojí ruší. */
{
  const { ctx, p } = await otevri(MONITOR, 'index.html');
  const v = await p.evaluate(() => {
    const c = getComputedStyle(document.getElementById('header'));
    const m = (c.backgroundColor.match(/[\d.]+/g) || []).map(Number);
    return { barva: c.backgroundColor, pruhlednost: m.length >= 4 ? m[3] : 1,
      rozmazani: c.backdropFilter || 'none' };
  });
  pravda('monitor: hlavička je neprůhledná', v.pruhlednost >= 0.99,
    `krytí ${v.pruhlednost} (${v.barva}) — pod poloprůhlednou se barva mění podle obsahu a rozejde se s lištou prohlížeče`);
  pravda('monitor: bez rozmazaného pozadí', v.rozmazani === 'none',
    `backdrop-filter: ${v.rozmazani} — dělá vztažný rámec pro position:fixed potomky`);
  await ctx.close();
}

// --- 3) Známé zabijáky sticky nejsou v CSS ---------------------------
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
pravda('<html> nemá overflow-x:hidden', !/\bhtml\{[^}]*overflow-x:\s*hidden/.test(css),
  'tím se z kořene stane posuvný rámec a na iOS to rozbije position:sticky');
pravda('hlavička drží pevně u okraje (position:fixed)', /header\{[^}]*position:fixed/.test(css),
  'sticky se na iPhonu zastavovala kousek pod okrajem a nad ní prosvítal pruh stránky');
pravda('stránka si pod hlavičkou dělá místo sama', /body\{padding-top:var\(--vyska-hlavicky/.test(css),
  'hlavička je vyňatá z toku — bez odsazení by ležela přes první řádek obsahu');
/* OD 31. 10. SE HLAVIČKA NESCHOVÁVÁ. Dřív při jakémkoli pohybu
   zhasla a po zastavení se vrátila — obcházelo to to, že iPhone
   vykresluje `position:fixed` při setrvačném dojezdu o kus vedle.
   Majitel: „to úplně nahoře udělej pevné, štve mě, jak to mizí při
   hýbání." Hlídá se proto, že ve stylopisu ŽÁDNÉ takové pravidlo
   není — jinak by se chování vrátilo zadními vrátky. */
pravda('hlavička se při rolování neschovává',
  !/header\.[a-z-]*\{[^}]*opacity:0/.test(css),
  've stylopisu je pravidlo, které hlavičce nastavuje opacity:0');
/* Hlavička NESMÍ mít transform. Pevně umístěná hlavička ho nepotřebuje
   a na Safari je transform u hlavičky historicky zdroj potíží (dokud byla
   sticky, kvůli němu se zastavovala pod okrajem). */
const hlavickaBlok = css.slice(css.indexOf('header{border-bottom'), css.indexOf('header{border-bottom') + 700);
pravda('hlavička nemá transform',
  !/transform:/.test(hlavickaBlok),
  'v pravidle pro <header> je transform: ' + (hlavickaBlok.match(/transform:[^;]*/) || [''])[0]);
/* TADY SE MĚŘILO, ŽE PANEL NABÍDKY ZŮSTÁVÁ ABSOLUTE — jako fixed by se
   nepočítal podle okna, ale podle hlavičky (backdrop-filter dělá vztažný
   rámec i pro pevně polohované potomky). Panel je zrušený: nabídka je
   vodorovný pás uvnitř hlavičky, takže se nikam nepolohuje a tenhle
   problém zmizel i se svou obezličkou. Místo toho se hlídá, že si web
   pod lepivou hlavičkou nechává dost místa — to je vada, kterou pás
   doopravdy způsobil (hlavička 119 px proti rezervě 85 px) a kterou
   zachytily kontroly níž. */
pravda('rezerva pod lepivou hlavičkou je napsaná proměnnou, ne natvrdo',
  /--vyska-hlavicky/.test(css) && /body\{padding-top:var\(--vyska-hlavicky/.test(css),
  'bez proměnné se rezerva a skutečná výška rozejdou při první změně hlavičky');
/* Ořezávající rodič je na Safari past u lepivých i pevných prvků a kvůli
   bočnímu posuvu ho tu nepotřebujeme (změřeno: 282 zkoušek, 0 nálezů). */
/* ŽÁDNÁ MÍCHANÁ CELOOBRAZOVKOVÁ VRSTVA. To je ta čtvrtá příčina z úvodu
   a zároveň důvod, proč se barva hlavičky rozcházela s barvou lišty:
   mix-blend-mode:multiply ztmaví všechno pod sebou, ale lišta prohlížeče
   je jedna pevná hodnota a nic nenásobí. Hlídá se tedy obojí v jednom:
   pevná vrstva přes celé okno nesmí mít mix-blend-mode. */
{
  const smesi = [...css.matchAll(/([^{}]+)\{([^}]*mix-blend-mode[^}]*)\}/g)]
    .filter((m) => /position:\s*fixed/.test(m[2]) && /inset:\s*0|top:\s*0/.test(m[2]))
    .map((m) => m[1].trim().split('\n').pop().trim());
  pravda('nad hlavičkou není míchaná celoobrazovková vrstva', smesi.length === 0,
    'míchá se s pozadím: ' + smesi.join(', ') + ' — kvůli tomu se na iOS rozjede překreslování hlavičky a barva se rozejde s lištou prohlížeče');
}
pravda('<body> ani <html> neořezávají do stran',
  !/\bbody\{[^}]*overflow-x:\s*(clip|hidden)/.test(css) && !/\bhtml\{overflow-x:\s*(clip|hidden)/.test(css),
  'overflow-x na kořeni nebo na body dělá ořezávající rámec nad hlavičkou');

// --- 4) Hlavička na telefonu: tlačítko nabídky a nic navíc ----------
/* Tahle část prošla třemi podobami webu. Nejdřív se tu otevíral panel
   pod křížkem a měřilo se, že sedá dnem na spodní hranu okna. Pak byl
   panel zrušený a nabídka byla vodorovný pás odkazů přímo v hlavičce.
   Teď je to zase vysouvací panel — na výslovné přání majitele, protože
   v pásu byly na 390 px vidět dva odkazy z šesti.
   Co se tu měří, je proto JINÁ věc než dřív: že hlavička zůstala
   jednořádková a že je v ní čím nabídku otevřít. Co umí ten panel,
   hlídá test-menu; dvakrát totéž by znamenalo dvě místa k opravě. */
{
  const { ctx, p } = await otevri(TELEFON, 'index.html');
  await p.waitForTimeout(400);
  const v = await p.evaluate(() => {
    const n = document.getElementById('nav');
    const h = document.getElementById('header');
    const b = document.querySelector('.nav-burger');
    const hr = h.getBoundingClientRect();
    const br = b ? b.getBoundingClientRect() : null;
    const a = [...n.querySelectorAll('a')];
    return { odkazu: a.length, maBurger: !!b, burgerVHlavicce: !!(b && b.closest('header')),
      burgerS: br ? Math.round(br.width) : 0, burgerV: br ? Math.round(br.height) : 0,
      burgerX: br ? Math.round(br.left) : 0, logoX: Math.round(document.querySelector('header .logo').getBoundingClientRect().left),
      hlavVyska: Math.round(hr.height), okno_v: innerHeight,
      promenna: Math.round(parseFloat(getComputedStyle(document.documentElement)
        .getPropertyValue('--vyska-hlavicky'))) };
  });
  pravda('nabídka má v hlavičce čím se otevřít', v.maBurger && v.burgerVHlavicce,
    `hamburger: ${v.maBurger}, v hlavičce: ${v.burgerVHlavicce}`);
  pravda(`a dá se trefit prstem (${v.burgerS}×${v.burgerV})`,
    v.burgerS >= 44 && v.burgerV >= 44, `${v.burgerS}×${v.burgerV} px`);
  /* Vlevo, vedle jména. Když jsem hlavičku přestavoval, zůstalo v ní
     justify-content:space-between a jméno odletělo k pravému kraji —
     naměřeno x = 250 z 390, mezi ním a hamburgerem 186 px prázdna. */
  pravda('hamburger stojí vlevo, hned vedle jména', v.burgerX < v.logoX && v.logoX - v.burgerX < 90,
    `hamburger na x ${v.burgerX}, jméno na x ${v.logoX}`);
  pravda('a všech šest cílů i s účtem je v nabídce k dispozici', v.odkazu >= 6,
    `odkazů v nabídce: ${v.odkazu}`);
  /* Hlavička je lepivá, takže každý její pixel chybí obsahu. Bez pásu
     odkazů je jednořádková: naměřeno 65 px na 390×844 (s pásem to bylo
     119). Mez 90 px je tam, kam se nedá dostat omylem. */
  pravda(`a nepřeroste (${v.hlavVyska} px z ${v.okno_v})`, v.hlavVyska <= 90,
    `${v.hlavVyska} px — lepivá hlavička bere obsahu každý pixel`);
  /* A PROMĚNNÁ MUSÍ SEDĚT NA SKUTEČNOU VÝŠKU. Web si pod lepivou
     hlavičkou drží odstup přes --vyska-hlavicky; když jsem ji nechal
     na 85 px u hlavičky vysoké 65, byl pod hlavičkou prázdný pruh. */
  pravda(`--vyska-hlavicky (${v.promenna}) sedí na skutečnou výšku (${v.hlavVyska})`,
    Math.abs(v.promenna - v.hlavVyska) <= 2,
    `proměnná ${v.promenna} px, hlavička ${v.hlavVyska} px — rozdíl se projeví jako pruh nebo překryv`);
  await ctx.close();
}

/* --- 5) HLAVIČKA JE VIDĚT POŘÁD -------------------------------------
   Tenhle oddíl měl do 31. 10. přesně opačné zadání: ověřoval, že se
   hlavička při pohybu schová a po zastavení vrátí. Majitel to zrušil
   („štve mě, jak to mizí při hýbání"), takže se teď měří opak —
   a měří se na obou šířkách a ve třech okamžicích: za pohybu, hned
   po něm a po doběhu. Průhlednost musí být pořád 1 a horní hrana
   pořád na nule. */
for (const [jm, profil] of [['telefon', TELEFON], ['monitor', MONITOR]]) {
  const { ctx, p } = await otevri(profil, 'index.html');
  await p.waitForTimeout(600);
  const stav = () => p.evaluate(() => {
    const h = document.querySelector('header');
    const c = getComputedStyle(h), r = h.getBoundingClientRect();
    return { pruhlednost: +c.opacity, top: Math.round(r.top), pozice: c.position };
  });
  const nahore = await stav();
  const beh = [];
  for (const y of [300, 900, 1800, 2600]) {
    await p.evaluate((yy) => window.scrollTo(0, yy), y);
    await p.waitForTimeout(60);
    beh.push(await stav());
  }
  await p.waitForTimeout(900);
  const poKlidu = await stav();
  const vse = [nahore, ...beh, poKlidu];
  pravda(`${jm}: hlavička je u horního okraje i za pohybu`,
    vse.every((v) => v.top === 0), vse.map((v) => v.top).join(', ') + ' px');
  pravda(`${jm}: a nikdy nezprůhlední`,
    vse.every((v) => v.pruhlednost === 1), vse.map((v) => v.pruhlednost).join(', '));
  pravda(`${jm}: a drží se pevně (position:fixed)`,
    vse.every((v) => v.pozice === 'fixed'), vse.map((v) => v.pozice).join(', '));
  await ctx.close();
}

/* --- 3b) Místo pod hlavičkou musí sedět s její výškou ----------------
 *
 * Hlavička je vyňatá z toku a stránka si pod ni dělá místo pevným číslem
 * (85 px). Komentář v CSS dřív tvrdil, že je to naměřená hodnota — nebyla,
 * nic ji neměřilo. Číslo naštěstí sedělo, ale sedělo by jen do první
 * změny odsazení nebo písma v hlavičce, a pak by nad obsahem zůstal pruh
 * pozadí (nebo by se obsah schoval pod hlavičku). Od téhle chvíle to není
 * náhoda, ale hlídaná shoda. */
for (const [jm, opt, stranka] of [['telefon', TELEFON, 'index.html'], ['úzký telefon', { ...TELEFON, viewport: { width: 320, height: 720 } }, 'index.html'],
                                  ['monitor', MONITOR, 'index.html'], ['textová stránka', TELEFON, 'cena-pozemku.html']]) {
  const { ctx, p } = await otevri(opt, stranka);
  const v = await p.evaluate(() => ({
    vyska: Math.round(document.querySelector('header').getBoundingClientRect().height),
    odsazeni: Math.round(parseFloat(getComputedStyle(document.body).paddingTop)),
  }));
  pravda(`${jm}: místo pod hlavičkou sedí s její výškou`, Math.abs(v.vyska - v.odsazeni) <= 2,
    `hlavička ${v.vyska} px, stránka si nechává ${v.odsazeni} px — rozdíl ${v.odsazeni - v.vyska} px je pruh navíc nad obsahem`);
  await ctx.close();
}

/* --- 3c) Jméno značky je nápis, ne popisek ---------------------------
 *
 * Majitel řekl, že nápis v liště má „mít duši a být velký". Bylo to
 * 24 px / 20 px na telefonu, barva běžného textu — v liště splývalo
 * s navigací. Je z toho 28 px, prostrkání -0.03em a tmavá zeleň
 * značky.
 *
 * Tahle kontrola hlídá obojí najednou, protože to jde proti sobě:
 *   · nápis musí ZŮSTAT velký (někdo ho příště zmenší, aby se lišta
 *     „uklidnila"), a
 *   · nesmí hlavičku zvýšit (pak by pod ní zůstal pruh pozadí; to už
 *     měří 3b, ale tady se pozná PŘÍČINA — o výšce odkazu má rozhodovat
 *     dlaždice, ne řádek písma).
 * A ještě barvu: zeleň značky se dá omylem nahradit tokenem, který je
 * na bílé liště světlý. Proto se poměr jasů počítá, ne odhaduje. */
for (const [jm, opt] of [['telefon', TELEFON], ['monitor', MONITOR]]) {
  const { ctx, p } = await otevri(opt, 'index.html');
  const v = await p.evaluate(() => {
    const a = document.querySelector('header .logo');
    const m = a.querySelector('.logo-mark');
    const c = getComputedStyle(a);
    const rgb = (s) => (s.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
    const jas = (barva) => {
      const [r, g, b] = rgb(barva).map((x) => {
        const u = x / 255;
        return u <= 0.03928 ? u / 12.92 : ((u + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const pozadi = getComputedStyle(document.querySelector('header')).backgroundColor;
    const [a1, a2] = [jas(c.color), jas(pozadi)].sort((x, y) => y - x);
    return {
      velikost: parseFloat(c.fontSize),
      vaha: Number(c.fontWeight),
      proklad: parseFloat(c.letterSpacing) / parseFloat(c.fontSize),
      barva: c.color,
      barvaTextu: getComputedStyle(document.body).color,
      pomer: Math.round(((a1 + 0.05) / (a2 + 0.05)) * 10) / 10,
      vyskaOdkazu: Math.round(a.getBoundingClientRect().height),
      vyskaDlazdice: Math.round(m.getBoundingClientRect().height),
    };
  });
  pravda(`${jm}: jméno značky je velké (≥ 28 px)`, v.velikost >= 28,
    `má ${v.velikost} px — v liště je to jediný nápis, který má mluvit nahlas`);
  /* 700 je nejvyšší váha stupnice webu (scripts/test-pismo.mjs), takže
     tohle není „zvyš ji ještě", ale „neklesni pod nejtěžší řez". */
  pravda(`${jm}: a má nejvyšší váhu stupnice (700)`, v.vaha >= 700, `váha ${v.vaha}`);
  pravda(`${jm}: s prostrkáním nadpisu (≤ -0.025em)`, v.proklad <= -0.025,
    `prostrkání ${v.proklad.toFixed(3)}em — na tomhle webu dělá rozdíl mezi nadpisem a textem váha, velikost a prostrkání, ne rodina písma`);
  pravda(`${jm}: nese barvu značky, ne barvu běžného textu`, v.barva !== v.barvaTextu,
    `jméno i text stránky mají ${v.barva}`);
  pravda(`${jm}: a ta barva je na liště čitelná (≥ 4,5 : 1)`, v.pomer >= 4.5,
    `naměřeno ${v.pomer} : 1`);
  /* O výšce odkazu rozhoduje dlaždice — řádek písma se do ní musí vejít.
     Jakmile ho přeroste (větší písmo nebo line-height zpátky na 1.6),
     hlavička povyroste a pod ní zůstane pruh pozadí. */
  pravda(`${jm}: výšku odkazu drží dlaždice, ne řádek písma`,
    v.vyskaOdkazu === v.vyskaDlazdice,
    `odkaz ${v.vyskaOdkazu} px, dlaždice ${v.vyskaDlazdice} px`);
  await ctx.close();
}

/* --- 4) Nad hlavičkou nesmí ležet míchaná celoobrazovková vrstva ------
 *
 * Tohle je ta příčina, kterou tři opravy minuly: hledalo se na hlavičce,
 * jenže vinu nesla vrstva NAD ní. Test proto prochází všechno, co je
 * position:fixed přes celé okno, a hlídá dvě věci naráz: míchání s pozadím
 * a to, že taková vrstva leží nad hlavičkou. */
for (const [jm, opt] of [['telefon', TELEFON], ['monitor', MONITOR]]) {
  const { ctx, p } = await otevri(opt, 'index.html');
  const vrstvy = await p.evaluate(() => {
    const ven = [];
    const zkoumej = (el, popis) => {
      const c = getComputedStyle(el, popis || null);
      if (c.position !== 'fixed') return;
      const okno = { w: innerWidth, h: innerHeight };
      // „Přes celé okno" poznáme podle inset:0 nebo podle rozměru.
      const r = popis ? null : el.getBoundingClientRect();
      const velka = popis
        ? (c.inset === '0px' || (c.top === '0px' && c.left === '0px' && c.right === '0px' && c.bottom === '0px'))
        : (r && r.width >= okno.w - 2 && r.height >= okno.h - 2);
      if (!velka) return;
      ven.push({
        kdo: (el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (popis || '')),
        michani: c.mixBlendMode,
        z: parseInt(c.zIndex, 10) || 0,
        vidno: c.display !== 'none' && c.visibility !== 'hidden' && parseFloat(c.opacity || '1') > 0
      });
    };
    for (const el of document.querySelectorAll('html, body, body > *')) {
      zkoumej(el, null); zkoumej(el, '::before'); zkoumej(el, '::after');
    }
    const zHlavicky = parseInt(getComputedStyle(document.querySelector('header')).zIndex, 10) || 0;
    return { ven, zHlavicky };
  });
  const michane = vrstvy.ven.filter((v) => v.vidno && v.michani && v.michani !== 'normal');
  pravda(`${jm}: žádná celoobrazovková vrstva se nemíchá s pozadím`,
    jm === 'monitor' ? true : michane.length === 0,
    michane.map((v) => `${v.kdo} (${v.michani}, z-index ${v.z})`).join(', '));
  const nadHlavickou = vrstvy.ven.filter((v) => v.vidno && v.z > vrstvy.zHlavicky && v.michani && v.michani !== 'normal');
  pravda(`${jm}: a žádná taková neleží nad hlavičkou`,
    jm === 'monitor' ? true : nadHlavickou.length === 0,
    `hlavička má z-index ${vrstvy.zHlavicky}, nad ní: ` + nadHlavickou.map((v) => `${v.kdo} z-index ${v.z}`).join(', '));
  await ctx.close();
}

/* --- 6) ODEBRÁNO: sbalování lišty Safari, příjezd a „omezit pohyb" ---
   Tři oddíly (pohyb okna bez scroll události, doba příjezdu zpět
   a výjimka pro omezený pohyb) měřily chování, které 31. 10. zaniklo
   i s kódem: hlavička se už neschovává, takže se nemá odkud vracet
   a není co časovat. Co z nich zůstalo užitečné — „hlavička je vidět
   a stojí na nule, ať se děje cokoli" — je v oddílu 5 výš. */

/* --- 8) ODEBRÁNO: jméno značky dvakrát na jedné stránce --------------
 *
 * Tahle sekce porovnávala písmo „Parcelka" v hlavičce a v patičce
 * (v hlavičce bezpatkové, v patičce patkové). Už není co porovnávat:
 * patička jako rozcestík šla na přání celá pryč (commit bf1dcf195d)
 * a s ní i .foot-brand. Značka teď stojí na stránce jediné místo.
 *
 * Proč se to tu nenechává „najdi, co je k dispozici": v patičce zůstalo
 * jméno v řádku „© 2026 Parcelka", a ten je psaný strojovým
 * písmem záměrně, celý. Porovnávání s ním by padalo z důvodu, který
 * vadou není — a zkouška, která padá pro nic, přestane být brána vážně.
 * Kdyby se patička se značkou někdy vrátila, patří sem zpátky i tohle. */

/* --- 9) V LIŠTĚ NESTOJÍ NIC, CO SE NEKRESLÍ NIKDE -------------------
 *
 * PROČ TAHLE KONTROLA VZNIKLA. Mezi značkou a navigací stál na 2 311
 * stránkách odkaz `<a class="btn-primary header-cta">Přidat pozemek</a>`
 * a stylopis ho schovával DVĚMA pravidly `display:none` — jedním pro
 * široký displej a druhým uvnitř @media pro telefon. Nekreslil se tedy
 * nikde. Komentář u prvního z nich přitom tvrdil, že „na mobilu se
 * ukáže přímo v liště"; byl o pět měsíců starší než rozhodnutí dát
 * akci do šuplíku (viz oddíl 6 v scripts/test-rozvrzeni.mjs).
 * Nenahlásilo to nic: mrtvý prvek v liště nic nerozbije, jen se každému
 * návštěvníkovi každé stránky stáhne a nikdy neukáže.
 *
 * JAK SE TO MĚŘÍ. Ne čtením stylopisu — `display:none` v základu je
 * u lišty normální (hamburger na monitoru, šuplík na telefonu) a kdo
 * prvek ukáže, může být i skript. Měří se tedy VÝSLEDEK na dvou
 * šířkách: prvek, který nemá ani jeden obdélník na 390 px ANI na
 * 1280 px, se nekreslí nikde. Co se objeví teprve po klepnutí, musí
 * být ve výjimkách — s napsaným důvodem, a kontrola hlásí i výjimku,
 * která už potřeba není. */
{
  const VYJIMKY_LISTA = {
    'div.nav-stin': 'závoj pod otevřeným šuplíkem — objeví se teprve po klepnutí na hamburger, bez doteku ho na žádné šířce vidět není',
    'span.hu-in': 'nápis „Profil" v ovladači účtu — čte ho jen přihlášený, odhlášenému tam stojí „Přihlásit"; že se opravdu kreslí, měří oddíl „stav účtu je napsaný slovem" níž',
  };
  const skryteNa = async (opt) => {
    const { ctx, p } = await otevri(opt, 'index.html');
    const seznam = await p.evaluate(() => {
      const hl = document.getElementById('header');
      if (!hl) return null;
      const out = [];
      hl.querySelectorAll('*').forEach((e) => {
        /* Tvary uvnitř <svg> vlastní obdélník nemají a nic to neznamená. */
        if (e.closest('svg')) return;
        if (e.getClientRects().length) return;
        const c = (e.getAttribute('class') || '').trim();
        out.push(e.tagName.toLowerCase() + (c ? '.' + c.split(/\s+/).join('.') : '')
          + (e.id ? '#' + e.id : ''));
      });
      return out;
    });
    await ctx.close();
    return seznam;
  };
  const naTelefonu = await skryteNa(TELEFON);
  const naMonitoru = await skryteNa(MONITOR);
  pravda('lišta se našla na obou šířkách',
    naTelefonu !== null && naMonitoru !== null, 'na stránce není #header');
  /* PŘEDPOKLAD: na každé šířce se v liště něco schovává (na monitoru
     šuplík i hamburger, na telefonu zase to, co patří na široký
     displej). Kdyby se neschovávalo nic, kontrola níž by prošla
     naprázdno. */
  pravda(`je co měřit — schovaných prvků v liště: ${(naTelefonu || []).length} na telefonu, `
    + `${(naMonitoru || []).length} na monitoru`,
    (naTelefonu || []).length > 0 && (naMonitoru || []).length > 0,
    'na jedné ze šířek se neschovává nic — měří se vůbec otevřená stránka?');
  const nikde = [...new Set((naTelefonu || []).filter((x) => (naMonitoru || []).includes(x)))]
    .filter((x) => !(x in VYJIMKY_LISTA));
  pravda('nic v liště se neschovává na OBOU šířkách naráz',
    nikde.length === 0,
    nikde.join(', ') + ' — kreslí se to vůbec někde? Takhle tam viselo tlačítko .header-cta');
  /* STAV ÚČTU JE NAPSANÝ SLOVEM, NE TEČKOU.
     Majitel 30. 10.: „mělo by být jasné, zda je člověk přihlášený."
     Do té doby se stav kreslil devítipixelovou tečkou u ikony — tedy
     něčím, co řekne jen tomu, kdo to už ví. Teď ovladač nese nápis:
     odhlášený „Přihlásit", přihlášený „Profil", a k tomu jinou plochu.
     Měří se OBĚ polohy, jinak by půlka ovladače byla mrtvá značka
     (proto je `span.hu-in` výš mezi výjimkami — kreslí se až tady). */
  {
    const { ctx, p } = await otevri(TELEFON, 'index.html');
    const stav = async () => p.evaluate(() => {
      const u = document.querySelector('.hdr-ucet');
      if (!u) return null;
      const vid = (s) => { const e = u.querySelector(s); return !!(e && e.getClientRects().length); };
      const r = u.getBoundingClientRect();
      return { napis: (u.innerText || '').trim(), prihlasen: vid('.hu-in'), odhlasen: vid('.hu-out'),
        plocha: getComputedStyle(u).backgroundColor, vpravo: Math.round(innerWidth - r.right) };
    });
    const bez = await stav();
    pravda('odhlášený čte v liště „Přihlásit"',
      !!bez && bez.odhlasen && !bez.prihlasen && /Přihlásit/.test(bez.napis), JSON.stringify(bez));
    await p.evaluate(() => document.documentElement.classList.add('pk-prihlasen'));
    await p.waitForTimeout(400);
    const s2 = await stav();
    pravda('a přihlášený „Profil"',
      !!s2 && s2.prihlasen && !s2.odhlasen && /Profil/.test(s2.napis), JSON.stringify(s2));
    pravda('a pozná se to i podle plochy, nejen podle slova',
      !!s2 && !!bez && s2.plocha !== bez.plocha, `odhlášený ${bez && bez.plocha}, přihlášený ${s2 && s2.plocha}`);
    /* A STOJÍ U PRAVÉHO KRAJE. „Dej ten profil úplně doprava" (30. 10.)
       — do té doby seděl hned za značkou a vpravo zelo prázdno. */
    pravda(`ovladač účtu stojí u pravého kraje (${bez && bez.vpravo} px)`,
      !!bez && bez.vpravo >= 16 && bez.vpravo <= 32,
      'má držet okraj stránky, ne víc a ne míň');
    await ctx.close();
  }

  for (const [k, duvod] of Object.entries(VYJIMKY_LISTA)) {
    pravda(`výjimka ${k} má napsaný důvod`,
      typeof duvod === 'string' && duvod.length >= 30, 'bez důvodu tabulka tiše roste');
    pravda(`a je pořád potřeba (${k})`,
      (naTelefonu || []).includes(k) && (naMonitoru || []).includes(k),
      'prvek se na některé šířce už kreslí — výjimku smaž');
  }
}

await prohlizec.close();
console.log('\nLepivá hlavička — drží nahoře a nic pod ní neprosvítá');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Hlavička: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
