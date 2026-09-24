// Test: rozvržení, které se rozpadá jen v určitém rozmezí šířek — a popisky
// stránek pro vyhledávače.
//
// Spuštění: node scripts/test-rozvrzeni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Čtyři věci, které tu nikdo jiný nehlídá, protože nic nespadne:
//
// 1) HLAVIČKA SE ROZPADALA MEZI 881 A 1040 px. Tlačítko s menu naskakovalo
//    až pod 880, ale plná navigace se na jeden řádek vešla až kolem 1040.
//    V tom pásmu se „Ceny pozemků" a „Můj profil" zalomily na dva řádky
//    a logo se dotklo prvního odkazu, takže v liště stálo „ParcelkaMapa".
//    Žádná stránka přitom nejela do strany, takže to neodhalila ani
//    kontrola přetékání — rozvrh se nerozbil, jen zošklivěl.
//
// 2) PROUŽEK S ŽIVÝMI ÚDAJI VYTÉKAL Z RODIČE. Hlavička je svislý flex, který
//    zarovnává potomky na začátek, takže si proužek bral šířku svého OBSAHU:
//    557 px uvnitř 350px sloupce, tedy 187 px mimo obrazovku. Jeho vlastní
//    posuvník neměl co posouvat a poslední údaj se nedal přečíst.
//
// 3) „NAHORU" SEDĚLO NA OBSAHU. Na mobilu to byla pilulka se jménem přes
//    110 px široká a plavala nad seznamem — přímo na řádku s cenou za metr.
//
// 4) TITULKY DELŠÍ NEŽ VÝPIS GOOGLU. Osmnáct stránek mělo titulek přes
//    65 znaků a osmnáct popisek přes 165 — ve výsledcích z nich zbyl cár.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

// Tentýž server jako ostatní testy: servíruje statické soubory na 8310.
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = new URL('..', import.meta.url).pathname;
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// --- 4) Popisky pro vyhledávače — bez prohlížeče ---------------------
{
  const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  const dlouheT = [], dlouheD = [], bezT = [];
  for (const s of stranky) {
    const h = readFileSync(path.join(KOREN, s), 'utf8');
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
    const d = (h.match(/<meta\s+name="description"\s+content="([^"]*)"/) || [])[1];
    if (!t) bezT.push(s);
    else if (t.length > 65) dlouheT.push(`${s} (${t.length})`);
    // Popisek nemají stránky, které do vyhledávače nepatří (noindex).
    if (d && d.length > 165) dlouheD.push(`${s} (${d.length})`);
    if (!d && !/noindex/.test(h)) bezT.push(s + ' — bez popisku, a přitom se indexuje');
  }
  pravda('každá stránka má titulek', bezT.length === 0, bezT.join(', '));
  pravda('žádný titulek se ve výpisu Googlu neusekne',
    dlouheT.length === 0, `přes 65 znaků: ${dlouheT.slice(0, 6).join(', ')}${dlouheT.length > 6 ? ` … a dalších ${dlouheT.length - 6}` : ''}`);
  pravda('ani žádný popisek', dlouheD.length === 0,
    `přes 165 znaků: ${dlouheD.slice(0, 6).join(', ')}${dlouheD.length > 6 ? ` … a dalších ${dlouheD.length - 6}` : ''}`);
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
// --- Bez prohlížeče: co je vidět v samotném HTML ----------------------
{
  const stranky = readdirSync(KOREN).filter((f) => f.endsWith('.html'));

  /* ZÁKAZ PŘIBLIŽOVÁNÍ. Kdo na drobné písmo nevidí, má jedinou možnost:
     roztáhnout stránku prsty. „user-scalable=no" mu ji bere. Skok, kvůli
     kterému to kdysi vzniklo (iOS přiblíží pole s písmem pod 16 px), se
     řeší velikostí písma, ne zákazem. */
  const zakazujiZoom = stranky.filter((f) => {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    const m = /<meta\s+name="viewport"[^>]*content="([^"]*)"/.exec(h);
    return m && /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(?!\d)/.test(m[1]);
  });
  pravda('žádná stránka nezakazuje přiblížení', zakazujiZoom.length === 0,
    zakazujiZoom.join(', '));

  /* SYROVÉ DATUM. „dražba 2026-10-21" je zápis pro stroje. Česky se píše
     21. 10. 2026. */
  const sIso = [];
  for (const f of stranky) {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    // Jen viditelný text, ne JSON-LD, atributy ani skripty.
    const telo = h.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ');
    const m = telo.match(/\b20\d\d-\d\d-\d\d\b/);
    if (m) sIso.push(`${f} („${m[0]}")`);
  }
  pravda('nikde v textu nestojí datum ve tvaru pro stroje', sIso.length === 0,
    sIso.slice(0, 5).join(', '));

  /* ČÍSLA V HTML. Dokud je doplňoval až skript, viděl člověk při načtení
     „1900+" a u krajů pomlčky — a vyhledávač, který skript nespouští,
     viděl totéž. Navíc „1900+" nesedělo s živým počtem. */
  const idx = readFileSync(path.join(KOREN, 'index.html'), 'utf8');
  const hrdina = /<b id="hero-n-count">([^<]*)<\/b>/.exec(idx);
  pravda('počet pozemků je přímo v HTML, ne až ze skriptu',
    !!(hrdina && /^\d[\d\s\u00a0]*$/.test(hrdina[1].trim())),
    `v HTML stojí „${hrdina ? hrdina[1] : '(nic)'}"`);
  const pomlcky = [...idx.matchAll(/<span class="kj-c mono" data-kraj="[^"]+">([^<]*)<\/span>/g)]
    .filter((m) => !/\d/.test(m[1]) && !/žádné/.test(m[1]));
  pravda('ani u krajů nejsou místo čísel pomlčky', pomlcky.length === 0,
    `${pomlcky.length} krajů bez čísla`);

  /* SLIB Z ČASTÝCH DOTAZŮ. „U každé lokality vidíte, kdy proběhla poslední
     aktualizace" — musí to být čím podepřít. */
  const slibuje = /kdy proběhla poslední aktualizace/.test(idx);
  if (slibuje) {
    const bezRazitka = ['pozemky-okres-kolin.html', 'pozemky-stredocesky-kraj.html', 'drazby-pozemku-nabidky.html']
      .filter((f) => stranky.includes(f) && !/naposledy zkontrolovány/.test(readFileSync(path.join(KOREN, f), 'utf8')));
    pravda('krajské a okresní stránky říkají, kdy se zdroje kontrolovaly',
      bezRazitka.length === 0, bezRazitka.join(', '));
  }

  /* NÁHLED PRO SDÍLENÍ. Všechny stránky měly tentýž obrázek, takže krajská
     stránka poslaná do zprávy vypadala jako kterákoli jiná — z náhledu
     nebylo poznat, o jaký kraj jde. (Favicon zůstává společný schválně:
     ikona webu je jedna, to není chyba.) */
  {
    const chybi = [], sdilene = [];
    for (const f of stranky) {
      const m = /^pozemky-okres-(.+)\.html$/.exec(f) || /^pozemky-(.+)-kraj\.html$/.exec(f);
      if (!m) continue;
      const h = readFileSync(path.join(KOREN, f), 'utf8');
      const og = (/<meta property="og:image" content="([^"]*)"/.exec(h) || [])[1] || '';
      if (!/\/assets\/og\//.test(og)) { sdilene.push(f); continue; }
      const soubor = og.split('/assets/og/')[1];
      if (!existsSync(path.join(KOREN, 'assets', 'og', soubor))) chybi.push(`${f} → ${soubor}`);
    }
    pravda('krajské a okresní stránky mají vlastní náhled pro sdílení',
      sdilene.length === 0,
      `${sdilene.length} stránek má pořád společný obrázek: ${sdilene.slice(0, 4).join(', ')}`);
    // Odkaz na obrázek, který neexistuje, je horší než obecný obrázek.
    pravda('a každý odkazovaný náhled opravdu existuje', chybi.length === 0, chybi.slice(0, 4).join(', '));
  }

  /* ODKAZ VEN. Musí se poznat, že vede mimo web — i poslechem. */
  const okres = readFileSync(path.join(KOREN, 'pozemky-okres-kolin.html'), 'utf8');
  const zdroje = [...okres.matchAll(/<a class="okr-src"[^>]*>([\s\S]*?)<\/a>/g)];
  pravda('na okresní stránce jsou odkazy na zdroj', zdroje.length > 0);
  if (zdroje.length) {
    pravda('a je u nich poznat, že vedou pryč z webu',
      zdroje.every((m) => /ext-ikona/.test(m[1]) && /visually-hidden/.test(m[1])),
      'odkaz bez značky: ' + (zdroje.find((m) => !/ext-ikona/.test(m[1])) || [])[0]);
  }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

/** Stránka o dané šířce, bez cizích zdrojů. */
async function otevri(soubor, sirka, vyska) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: vyska },
    isMobile: sirka < 700, hasTouch: sirka < 700, locale: 'cs-CZ', permissions: [] });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    // Bez Leafletu se skript na hlavní stránce nedostane až k proužku
    // s údaji, takže by kontrola mlčela o prázdné stránce.
    if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
      const f = path.join(LEAFLET, path.basename(u.pathname));
      if (existsSync(f)) return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  if (LEAFLET) {
    await ctx.route(`${BASE}/${soubor}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${soubor}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  return { ctx, p };
}

// --- 1) Hlavička drží na každé šířce ---------------------------------
{
  const spatne = [];
  // Krok po 20 px přes celé sporné pásmo i kus nad ním.
  for (const w of [360, 700, 860, 881, 900, 940, 980, 1020, 1040, 1041, 1100, 1280, 1440]) {
    const { ctx, p } = await otevri('drazby-pozemku.html', w, 700);
    const v = await p.evaluate(() => {
      const nav = document.getElementById('nav');
      const logo = document.querySelector('.logo');
      const burger = document.querySelector('.nav-toggle');
      const vidno = (e) => { const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
      const menuVidno = vidno(burger);
      const odkazy = [...nav.querySelectorAll('a')].filter(vidno);
      if (menuVidno || !odkazy.length) return { menuVidno, radku: 1, mezera: 999, sirsi: [] };
      // Kolik různých řádků odkazy zabírají a jaká je mezera za logem.
      const radku = new Set(odkazy.map((a) => Math.round(a.getBoundingClientRect().top))).size;
      const mezera = Math.round(odkazy[0].getBoundingClientRect().left - logo.getBoundingClientRect().right);
      // Odkaz, který se sám zalomil na dva řádky (kromě tlačítka s výplní).
      const sirsi = odkazy.filter((a) => {
        if (a.classList.contains('btn-primary') || a.classList.contains('header-cta')) return false;
        const r = a.getBoundingClientRect();
        return r.height > parseFloat(getComputedStyle(a).lineHeight) * 1.6;
      }).map((a) => a.textContent.trim());
      return { menuVidno, radku, mezera, sirsi };
    });
    if (!v.menuVidno) {
      if (v.sirsi.length) spatne.push(`${w} px: zalomil se odkaz ${v.sirsi.join(', ')}`);
      // Logo a první odkaz se nesmí dotýkat — jinak z toho je „ParcelkaMapa".
      else if (v.mezera < 20) spatne.push(`${w} px: mezi logem a navigací je jen ${v.mezera} px`);
    }
    await ctx.close();
  }
  pravda('hlavička se nerozpadá na žádné šířce', spatne.length === 0, spatne.join('\n      '));
}

// --- 2) Proužek s údaji se vejde do rodiče ---------------------------
{
  /* Měří se na 700 px, ne na telefonu: na displeji do 560 px je proužek
     schovaný schválně (drží hledání pod obzorem, viz bod 7 níž), takže
     by tu nebylo co poměřovat. Vytékal ale i na širších displejích. */
  const { ctx, p } = await otevri('index.html', 700, 900);
  await p.waitForTimeout(2600);
  const v = await p.evaluate(() => {
    const e = document.getElementById('hero-live');
    if (!e || e.hidden || getComputedStyle(e).display === 'none') return null;
    const r = e.getBoundingClientRect(), rr = e.parentElement.getBoundingClientRect();
    return { sirka: Math.round(r.width), rodic: Math.round(rr.width),
      vpravo: Math.round(r.right), okno: innerWidth,
      pretekaObsah: e.scrollWidth > e.clientWidth + 1,
      posuv: getComputedStyle(e).overflowX };
  });
  pravda('proužek s údaji v úvodu je vidět', !!v, 'element #hero-live chybí nebo zůstal schovaný');
  if (v) {
    // Tohle je jádro: proužek si bral šířku obsahu, ne sloupce.
    pravda('proužek se vejde do svého sloupce', v.sirka <= v.rodic + 1,
      `proužek je ${v.sirka} px v ${v.rodic}px sloupci — vytéká o ${v.sirka - v.rodic} px`);
    pravda('a nepřesahuje obrazovku', v.vpravo <= v.okno + 1,
      `pravý okraj je na ${v.vpravo} px, obrazovka končí na ${v.okno}`);
    /* Co se do šířky nevejde, musí jít posunout. Když se vejde všechno,
       není co posouvat — a to je taky v pořádku; chyba je jen případ
       „obsah přetéká a posunout to nejde", kdy se poslední údaj nedá
       přečíst ani nijak dostat na obrazovku. */
    pravda('co se do proužku nevejde, jde posunout do strany',
      !v.pretekaObsah || /auto|scroll/.test(v.posuv),
      `obsah přetéká (${v.sirka} px rámeček), ale overflow-x je „${v.posuv}" — poslední údaj je nedostupný`);
  }
  await ctx.close();
}

{
  /* Proužek s živými údaji byl na malých telefonech schovaný, aby se
     hledání dostalo výš. Jenže schovat text neznamená získat místo: po
     něm i po nadstavci zbyla v tmavém pruhu prázdná díra 51 px vysoká —
     nad hledáním nezůstalo nic, jen prázdno. To je horší než řádek textu:
     nic neříká a místo bere stejně. Text je proto zpátky a místo se
     ušetřilo na odsazeních. */
  const { ctx, p } = await otevri('index.html', 360, 640);
  await p.waitForTimeout(2200);
  const v = await p.evaluate(() => {
    const vidno = (id) => { const e = document.getElementById(id) || document.querySelector(id);
      return !!(e && !e.hidden && getComputedStyle(e).display !== 'none' && e.getClientRects().length); };
    const stat = document.querySelector('.hero-stats');
    const panel = document.querySelector('.map-controls-panel') || document.querySelector('.map-app');
    const mezera = (stat && panel) ? Math.round(panel.getBoundingClientRect().top - stat.getBoundingClientRect().bottom) : null;
    /* Dřív se tu hlídalo, že nad nadpisem stojí nadstavec. Ten je pryč —
       říkal potřetí totéž co nadpis a řádek pod ním. Smysl kontroly ale
       trvá: nad nadpisem nesmí zůstat prázdný pruh. Měří se proto rovnou
       ta mezera, ne přítomnost jednoho konkrétního řádku. */
    const h1 = document.querySelector('.hero-map .hero-head h1');
    const pas = document.querySelector('.hero-map .hero-band') || document.querySelector('.hero-map');
    const nadNadpisem = (h1 && pas)
      ? Math.round(h1.getBoundingClientRect().top - pas.getBoundingClientRect().top) : null;
    return { prouzek: vidno('hero-live'), nadNadpisem, mezera };
  });
  pravda('proužek s živými údaji je na telefonu vidět', v.prouzek,
    'po schovaném proužku zbyde v úvodu prázdné místo — a to neřekne nic');
  pravda('nad nadpisem nezůstal prázdný pruh', v.nadNadpisem !== null && v.nadNadpisem <= 60,
    `nad nadpisem je ${v.nadNadpisem} px prázdna — na telefonu je to ukradený kus obrazovky`);
  await ctx.close();
}

// --- 3) „Nahoru" nesedí na obsahu ------------------------------------
{
  const { ctx, p } = await otevri('index.html', 390, 844);
  await p.waitForTimeout(2600);
  await p.evaluate(() => scrollTo(0, 1400));
  await p.waitForTimeout(900);
  const v = await p.evaluate(() => {
    const b = document.getElementById('to-top');
    if (!b || !b.classList.contains('show')) return null;
    const r = b.getBoundingClientRect();
    // Který text karty leží pod tlačítkem?
    const pod = [];
    for (const e of document.querySelectorAll('.opp-item *')) {
      if (e.children.length || !e.textContent.trim()) continue;
      const t = e.getBoundingClientRect();
      if (t.right > r.left && t.left < r.right && t.bottom > r.top && t.top < r.bottom) {
        pod.push(e.textContent.trim().slice(0, 24));
      }
    }
    return { sirka: Math.round(r.width), pod };
  });
  pravda('tlačítko „Nahoru" je po odrolování vidět', !!v, 'nenaskočilo');
  if (v) {
    pravda('a nezakrývá text v kartách', v.pod.length === 0,
      `sedí na: ${v.pod.join(' | ')} — tlačítko je ${v.sirka} px široké`);
  }
  await ctx.close();
}

// --- 5) Okna se otevírají přes celou obrazovku ------------------------
/* Okno bylo karta uprostřed ztmavené stránky: nahoře i dole prosvítal web,
   takže bylo pořád vidět, že za tím něco je. Na telefonu je proto okno celá
   obrazovka. Na velkém displeji karta zůstává (odstavec roztažený na metr
   a půl se nečte), ale pozadí musí být neprůhledné — web za ním nevykukuje. */
for (const [w, h, telefon] of [[390, 844, true], [1280, 860, false]]) {
  const { ctx, p } = await otevri('index.html', w, h);
  await p.waitForTimeout(1600);
  const otevrelo = await p.evaluate(() => {
    const t = document.querySelector('[data-info]');
    if (!t) return false;
    t.click();
    return true;
  });
  await p.waitForTimeout(700);
  const v = await p.evaluate(() => {
    const m = document.getElementById('info-modal');
    const c = m && m.querySelector('.modal-card');
    const b = m && m.querySelector('.modal-backdrop');
    if (!c || !b) return null;
    const r = c.getBoundingClientRect();
    const poz = getComputedStyle(b).backgroundColor;
    // Průhlednost poznáme podle čtvrté složky rgba(...).
    const m4 = poz.match(/rgba?\(([^)]+)\)/);
    const slozky = m4 ? m4[1].split(',').map((x) => parseFloat(x)) : [];
    return {
      sirka: Math.round(r.width), vyska: Math.round(r.height),
      okno: `${innerWidth}×${innerHeight}`,
      pruhledne: slozky.length > 3 && slozky[3] < 0.999,
      pozadi: poz,
    };
  });
  pravda(`okno se otevřelo (${w} px)`, otevrelo && !!v, 'na stránce není nic s data-info');
  if (v) {
    if (telefon) {
      pravda('na telefonu okno zabírá celou obrazovku',
        v.sirka >= w - 1 && v.vyska >= h - 1,
        `karta ${v.sirka}×${v.vyska} v okně ${v.okno} — pod ní i nad ní prosvítá web`);
    } else {
      pravda('na velkém displeji zůstává karta čitelně široká',
        v.sirka > 320 && v.sirka < w * 0.8, `karta je ${v.sirka} px široká`);
    }
    pravda(`za oknem není vidět web (${w} px)`, v.pruhledne === false,
      `pozadí je ${v.pozadi} — průsvitné, takže stránka za ním prosvítá`);
  }
  await ctx.close();
}

// --- 6) Menu: čtyři „moje" položky pod jednou -------------------------
/* V liště stály vedle sebe Upozornění, Zprávy, Hlídání a Můj profil.
   Všechny patří jednomu účtu, ale zabíraly čtyři místa a vypadaly jako
   čtyři různé části webu. */
{
  const { ctx, p } = await otevri('kontakt.html', 1440, 900);
  const v = await p.evaluate(() => {
    const vidno = (e) => { if (!e) return false; const s = getComputedStyle(e);
      return s.display !== 'none' && s.visibility !== 'hidden' && e.getClientRects().length > 0; };
    const det = document.querySelector('.nav-moje');
    return {
      skupina: !!det,
      otevrena: det ? det.open : null,
      polozekVListe: [...document.querySelectorAll('#nav > a, #nav > details')].filter(vidno).length,
      odkazyUvnitr: [...document.querySelectorAll('.nav-moje-panel a')].map((a) => a.textContent.trim()),
      vidnoZavrene: [...document.querySelectorAll('.nav-moje-panel a')].filter(vidno).length,
      ucetNahore: !!document.querySelector('#nav > a#nav-ucet'),
    };
  });
  pravda('osobní položky jsou pod jednou skupinou', v.skupina, 'skupina .nav-moje v liště chybí');
  /* Ve skupině jsou tři: upozornění, zprávy, hlídání — samá činnost.
     Účet z ní odešel nahoru jako samostatný první řádek, protože byl
     schovaný až čtvrtý a nešlo z nabídky poznat, jestli je člověk
     přihlášený. Že je nahoře a nese stav, hlídá test-data.mjs. */
  pravda('a jsou v ní všechny tři',
    v.odkazyUvnitr.length === 3 && /Upozorn/.test(v.odkazyUvnitr.join(' ')) && /Hlídání/.test(v.odkazyUvnitr.join(' ')),
    v.odkazyUvnitr.join(' | '));
  pravda('účet je mimo ni, nahoře a se stavem', v.ucetNahore,
    'v liště chybí #nav-ucet jako samostatná položka');
  pravda('v liště tím ubylo položek', v.polozekVListe <= 6, `v liště je ${v.polozekVListe} položek`);
  pravda('zavřená nabídka nevisí pod lištou', v.vidnoZavrene === 0,
    `zavřeno, ale vidět je ${v.vidnoZavrene} odkazů`);
  // Rozbalit se musí dát. (Chybějící skupina má skončit poctivým ✕
  // u kontroly výš, ne pádem celého testu.)
  await p.click('#nav-moje-sum', { timeout: 4000 }).catch(() => {});
  await p.waitForTimeout(400);
  const po = await p.evaluate(() => [...document.querySelectorAll('.nav-moje-panel a')]
    .filter((e) => e.getClientRects().length > 0).length);
  pravda('po klepnutí se rozbalí', po === 3, `vidět je ${po} ze tří`);
  await ctx.close();
}
{
  // Na telefonu je menu samo o sobě seznam pod sebou, takže zanořovat
  // skupinu do rozbalovátka by bylo klepnutí navíc pro nic.
  const { ctx, p } = await otevri('kontakt.html', 390, 844);
  await p.click('.nav-toggle').catch(() => {});
  await p.waitForTimeout(600);
  const n = await p.evaluate(() => [...document.querySelectorAll('.nav-moje-panel a')]
    .filter((e) => { const s = getComputedStyle(e);
      return s.display !== 'none' && e.getClientRects().length > 0; }).length);
  pravda('ve vysouvacím menu jsou osobní položky rovnou vidět', n === 3,
    `vidět je ${n} ze tří — ve výsuvném menu se nemá nic rozbalovat`);
  await ctx.close();
}

// --- 7) Úvod na telefonu nedrží hledání pod obzorem -------------------
/* Na displeji 320×568 bylo pole „Hledat obec" až v 72 % výšky obrazovky.
   Člověk, který přišel hledat pozemek, se k hledání dostal jako
   k poslednímu. */
for (const [w, h] of [[320, 568], [375, 667], [390, 844]]) {
  const { ctx, p } = await otevri('index.html', w, h);
  await p.waitForTimeout(2200);
  const v = await p.evaluate(() => {
    const e = document.getElementById('map-search');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { horni: Math.round(r.top + scrollY), okno: innerHeight };
  });
  pravda(`hledání je na stránce (${w}×${h})`, !!v, 'pole #map-search chybí');
  if (v) {
    const podil = Math.round(100 * v.horni / v.okno);
    /* Strop je 60 %, ne 56 %: v úvodu je zpátky nadstavec i proužek
       s živými údaji (schovat je znamenalo nechat tam prázdnou díru).
       Naměřeno s nimi: 320×568 → 58 %, 375×667 → 50 %, 390×844 → 40 %.
       Kdyby někdo přidal do úvodu další řádek, tahle mez to zachytí. */
    pravda(`hledání je v horních 60 % obrazovky (${w}×${h})`, podil <= 60,
      `pole začíná v ${podil} % výšky (${v.horni} z ${v.okno} px) — před ním je moc úvodu`);
  }
  await ctx.close();
}

// --- 8) Dražba po termínu: zmizí, a je napsáno proč -------------------
/* Nedalo se poznat, co se stane s dražbou, která proběhla. Seznam ji jen
   odsunul dolů a odznak „proběhlo" si člověk musel najít sám; na stránce
   pozemku se blok s termínem prostě vynechal, takže tam o tom nepadlo
   slovo. Prošlá dražba už není příležitost — dražit se nedá.

   V ostrých datech žádná prošlá není (robot bere jen aktivní), takže se
   tu podstrkují vlastní: jinak by kontrola mlčela a tvářila se spokojeně. */
{
  const dnes = new Date();
  const posun = (dni) => { const d = new Date(dnes); d.setDate(d.getDate() + dni);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
  const data = { updated: posun(0), opportunities: [
    { place: 'Budoucí', okres: 'Kolín', type: 'drazba', parcel: '1/1', druh: 'orná půda',
      area: 2000, price: 300000, lat: 50.02, lng: 15.20, extra: 'dražba ' + posun(20) },
    { place: 'Prošlá', okres: 'Kolín', type: 'drazba', parcel: '2/2', druh: 'orná půda',
      area: 2000, price: 300000, lat: 50.04, lng: 15.22, extra: 'dražba ' + posun(-9) },
    { place: 'Prodej', okres: 'Kolín', type: 'sale', parcel: '3/3', druh: 'orná půda',
      area: 2000, price: 300000, lat: 50.06, lng: 15.24, extra: 'inzerát' },
  ] };
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ', permissions: [] });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1') return r.continue();
    if (LEAFLET && /unpkg\.com\/leaflet@/.test(r.request().url())) {
      const f = path.join(LEAFLET, path.basename(u.pathname));
      if (existsSync(f)) return r.fulfill({ status: 200,
        contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    }
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
    return r.abort();
  });
  await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(data) }));
  await ctx.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: '[]' }));
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(3600);
  const cti = () => p.evaluate(() => ({
    obce: [...document.querySelectorAll('.opp-item')].map((e) => (e.querySelector('.opp-place') || e).textContent.trim().slice(0, 30)),
    karet: document.querySelectorAll('.opp-item').length,
    tlacitko: (document.querySelector('#mc-prosle') || {}).textContent || '',
    vse: (() => { const b = document.querySelector('.filter-chip[data-type="all"] .chip-n');
      return b ? +b.textContent.replace(/[^\d]/g, '') : null; })(),
  }));
  const pred = await cti();
  pravda('dražba po termínu se do výpisu nedostane',
    pred.karet === 2 && !pred.obce.join(' ').includes('Prošlá'),
    `ve výpisu je ${pred.karet} karet: ${pred.obce.join(', ')}`);
  pravda('a nepočítá se ani do čísel u kategorií', pred.vse === 2, `„Vše" hlásí ${pred.vse}`);
  // Tohle je to jádro: nemá tiše zmizet, má být napsané, že zmizela.
  pravda('nad seznamem je napsané, kolik jich je stranou',
    /po termínu \(1\)/.test(pred.tlacitko), `tlačítko hlásí „${pred.tlacitko.trim()}"`);
  if (pred.tlacitko) {
    await p.click('#mc-prosle');
    await p.waitForTimeout(900);
    const po = await cti();
    pravda('a dají se zobrazit', po.karet === 3 && po.obce.join(' ').includes('Prošlá'),
      `po klepnutí je ve výpisu ${po.karet} karet: ${po.obce.join(', ')}`);
    pravda('a zase schovat', /Schovat/.test(po.tlacitko), `tlačítko hlásí „${po.tlacitko.trim()}"`);
  }
  await ctx.close();
}

await prohlizec.close();
console.log('\nRozvržení a popisky stránek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Rozvržení: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
