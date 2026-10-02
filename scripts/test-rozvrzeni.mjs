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
/* ---- Dvě dlaždice s týmž číslem ------------------------------------
   V okrese, kde jsou všechny nabídky jednoho druhu, stály vedle sebe
   „28 pozemků" a „28 na prodej". Druhá neříká nic, co by v té první
   nebylo — a v podnadpisu nad tím stojí „28× na prodej" ještě jednou.
   Čte se to jako dva různé údaje, dokud si člověk nevšimne, že je to
   totéž číslo. Kontrola je statická, aby prošla všech 77 stránek. */
{
  const KOREN = new URL('..', import.meta.url);
  const soubory = readdirSync(KOREN).filter((f) => /^pozemky-(okres-|[a-z-]+-kraj)/.test(f));
  const spatne = [];
  let prohlednuto = 0;
  for (const f of soubory) {
    const h = readFileSync(new URL(f, KOREN), 'utf8');
    const usek = h.slice(h.indexOf('<div class="okr-stats">'));
    const dlazdice = [...usek.slice(0, usek.indexOf('</div>\n      </div>') + 6)
      .matchAll(/<b>([\d\s\u00a0]+)<\/b><span>([^<]+)<\/span>/g)]
      .map((m) => ({ n: Number(m[1].replace(/[\s\u00a0]/g, '')), co: m[2] }));
    if (dlazdice.length < 2) continue;
    prohlednuto++;
    const celkem = dlazdice[0].n;
    const stejne = dlazdice.slice(1).filter((d) => d.n === celkem && !/okres/.test(d.co));
    if (stejne.length) spatne.push(`${f}: „${celkem} ${dlazdice[0].co}" a „${stejne[0].n} ${stejne[0].co}"`);
  }
  pravda('bylo co prohlížet', prohlednuto >= 10, `stránek s rozpadem: ${prohlednuto}`);
  pravda('žádná stránka neukazuje dvě dlaždice s týmž číslem', spatne.length === 0,
    spatne.slice(0, 3).join('; ') + (spatne.length > 3 ? ` … a dalších ${spatne.length - 3}` : ''));
}

/* ---- Oddělovač nesmí viset na konci řádku --------------------------
   Název obce ve výpisu nabídek dostával z CSS oddělovač „ · " za sebe.
   V přehledu cen to dává smysl (odznaky okresů stojí v řadě vedle
   sebe), ve výpisu ale za názvem následuje nový řádek s údaji — tečka
   tedy visela na konci řádku bez ničeho. Na všech 77 okresních
   stránkách, u každé nabídky. Nic se nerozbije, jen to vypadá jako
   nedodělané. */
{
  const { ctx, p } = await otevri('pozemky-okres-kolin.html', 430, 932);
  await p.waitForTimeout(900);
  const v = await p.evaluate(() => {
    const radek = document.querySelector('.okr-item .okr-place');
    const odznak = document.querySelector('.okr-stat .okr-place');
    const za = (el) => el ? getComputedStyle(el, '::after').content : 'nic';
    return { vypis: za(radek), odznak: za(odznak), radku: document.querySelectorAll('.okr-item').length };
  });
  pravda('výpis nabídek se na okresní stránce našel', v.radku > 0, `řádků ${v.radku}`);
  pravda('za názvem obce ve výpisu nevisí oddělovač',
    !/·/.test(String(v.vypis)), `za názvem se vykresluje ${v.vypis}`);
  /* A tam, kam oddělovač patří, zůstat musí — jinak by se z odznaků
     okresů v přehledu cen stala jedna slepená řada. */
  if (v.odznak !== 'nic') {
    pravda('ale u odznaků v přehledu cen zůstává', /·/.test(String(v.odznak)), String(v.odznak));
  }
  await ctx.close();
}

/* ---- Popisky u živých údajů se nesmí lámat ------------------------
   Tři kartičky pod nadpisem mají popisek ve sloupci pevné šířky, aby
   hodnoty stály v jedné ose. Když se do něj nejdelší popisek nevejde,
   zalomí se na dva řádky — ta karta je pak o patnáct bodů vyšší než
   zbylé dvě a řada vypadá roztřepeně. Širší sloupec tedy místo
   neubírá, naopak. */
for (const [w, h] of [[390, 844], [360, 780], [430, 932]]) {
  const { ctx, p } = await otevri('index.html', w, h);
  await p.waitForTimeout(1800);
  const karty = await p.evaluate(() => [...document.querySelectorAll('.hh-fakta .hl-fact')].map((f) => {
    const k = f.querySelector('.hl-k');
    if (!k || getComputedStyle(k).display === 'none') return null;
    const r = k.getBoundingClientRect();
    const radek = parseFloat(getComputedStyle(k).lineHeight) || 14;
    return { text: k.textContent.trim(), radku: Math.round(r.height / radek),
      vyska: Math.round(f.getBoundingClientRect().height) };
  }).filter(Boolean));
  if (karty.length) {
    const lamane = karty.filter((k) => k.radku > 1).map((k) => `„${k.text}"`);
    pravda(`${w} px: popisek u živých údajů se vejde na řádek`, lamane.length === 0,
      `láme se: ${lamane.join(', ')}`);
    const vysky = [...new Set(karty.map((k) => k.vyska))];
    pravda(`${w} px: a všechny tři kartičky jsou stejně vysoké`, vysky.length === 1,
      `výšky ${vysky.join(', ')} px`);
  }
  await ctx.close();
}

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

/* --- OVLÁDÁNÍ SE MUSÍ DÁT TREFIT PRSTEM ------------------------------
 *
 * Web si mez 44 px klade sám: hlídá ji zkouška u rozbalovátka na stránce
 * pozemku i na „Přidat pozemek". Na úvodní stránce — tedy tam, kde se
 * klepe nejvíc — ji ale půlka ovládání nesplňovala: přepínač Seznam/Mapa
 * 36 px, „Uložené" 36 px, výběr řazení 36 px, tři živé údaje 35 px,
 * hlavní tlačítko v hlavičce 41 px. Nikdo si toho nevšiml, protože se to
 * nikde neměřilo.
 * Prochází se VŠECHNO, co jde klepnout, ne jen ten seznam — jinak by
 * kontrola platila na dnešek a na nic dalšího. Co mez mít nemůže, je
 * vyjmenované i s důvodem; kdo přidá další výjimku, musí důvod napsat. */
{
  const { ctx, p } = await otevri('index.html', 390, 844);
  await p.waitForTimeout(2600);
  /* PRUH „NAPOSLEDY PROHLÉDNUTÉ" DO TOHO PATŘÍ TAKY. Jeho odznaky měly
     31 px a nikdo si toho nevšiml, protože se pruh nikdy neukázal:
     zapisovala do něj jediná funkce a k té se nedalo dostat. Ukáže se od
     dvou uložených pozemků, tak se dva uloží a stránka načte znovu. */
  const dvaKlice = (() => {
    const d = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
    return d.filter((x) => typeof x.lat === 'number' && typeof x.lng === 'number' && x.price > 0)
      .slice(0, 2)
      .map((x) => [x.place || '', x.parcel || '', x.okres || '', x.lat.toFixed(3), x.lng.toFixed(3)].join('|'));
  })();
  await p.evaluate((k) => { try { localStorage.setItem('pk_recent_v1', JSON.stringify(k)); } catch (e) {} }, dvaKlice);
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  pravda('pruh „Naposledy prohlédnuté" se v měření objevil (jinak se jeho odznaky nezměří)',
    await p.evaluate(() => !document.getElementById('recent-strip').hidden),
    'pruh se neukázal — kontrola níž by o jeho odznacích nic neřekla');
  /* ROZBALIT, CO JE SBALENÉ. Filtry druhu a sítí („Orná půda",
     „Elektřina") sedí ve sbalené sekci a měření je přeskakovalo, protože
     zavřený blok nemá rozměr. Lidé si ho ale otevřou — a měly tam 38 px. */
  const rozbaleno = await p.evaluate(() => {
    const d = [...document.querySelectorAll('details')];
    d.forEach((x) => { x.open = true; });
    return d.length;
  });
  pravda('sbalené sekce se daly rozbalit (jinak by se jejich ovládání neměřilo)',
    rozbaleno > 0, 'na stránce není ani jeden sbalovací blok');
  await p.waitForTimeout(700);
  const male = await p.evaluate(() => {
    const VYJIMKY = {
      'skip-link': 'ukáže se jen při ovládání klávesnicí, prstem se na něj nedá narazit',
      'logo': 'odkaz domů v hlavičce je 118 px široký; vyšší hlavička by ubrala místo nad hledáním',
      'opp-fav': 'kolečko na náhledu karty — dvě 44px kolečka nad sebou by náhled zakryla',
      'opp-skryt': 'totéž, sedí hned pod ním',
      'linklike': 'podtržené slovo uvnitř věty („Už jste inzerát přidal?"), ne tlačítko — 44 px by z věty udělalo schod',
    };
    const ven = [];
    document.querySelectorAll('a[href], button, summary, select, label.chip-check').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (e.closest('details:not([open])')) return;
      if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
      const st = getComputedStyle(e);
      // Odkaz v běžném textu mez mít nemusí (a mít ani nemůže — je to slovo ve větě).
      if (e.tagName === 'A' && st.display === 'inline') return;
      const duvod = Object.keys(VYJIMKY).find((k) => e.classList.contains(k));
      if (duvod) return;
      if (r.height >= 44) return;
      ven.push({ co: e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0],
        text: (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 24),
        v: Math.round(r.height) });
    });
    const uniq = [];
    for (const m of ven) if (!uniq.some((u) => u.co === m.co)) uniq.push(m);
    return uniq;
  });
  pravda(`ovládání na úvodní stránce se dá trefit prstem (44 px)`, male.length === 0,
    male.map((m) => `${m.co} „${m.text}" ${m.v} px`).join(' | '));
  await ctx.close();
}

/* --- 6b) A TÝŽ METR NA ZBYTEK WEBU -----------------------------------
 *
 * Mez 44 px se měřila JEN na úvodní stránce, takže na ostatních o ní
 * nikdo nevěděl. Změřeno na 390×844: hlídání mělo tlačítka 40 px,
 * upozornění 39, odhlášení v profilu 34, drobečková cesta 27, jméno
 * kraje v rozcestníku 24, odkaz zpět na stránce pozemku 22 a ovládání
 * mapy 31–36 px — a to jsou prvky, kterými se mapa na telefonu jedině
 * ovládá. Stránky za přihlášením se musí otevřít přihlášené, jinak by
 * se měřila jen přihlašovací karta.
 */
{
  const DATA_H = { updated: '2026-01-01', opportunities: [
    { place: 'Kolín', okres: 'Kolín', type: 'sale', parcel: '1/1', druh: 'orná půda',
      area: 1200, price: 400000, lat: 50.02, lng: 15.20, extra: 'inzerát', site: ['elektrina'] },
  ] };
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ', permissions: [] });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(DATA_H) }));
  await ctx.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: '[]' }));
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel', user: { id: '11111111-1111-4111-8111-111111111111' } }));
  });
  const p2 = await ctx.newPage();
  const STRANKY = ['hlidani.html', 'upozorneni.html', 'zpravy.html', 'muj-inzerat.html',
    'pridat.html', 'pozemek.html?ll=50.02,15.20', 'pozemky-podle-okresu.html',
    'kontakt.html', 'cena-pozemku.html'];
  const nalezy = [];
  const nalezyKlavesnice = [];
  for (const stranka of STRANKY) {
    await p2.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
    await p2.waitForTimeout(2500);
    // Sbalené sekce se rozbalí — zavřený blok nemá rozměr a měření by ho minulo.
    await p2.evaluate(() => { document.querySelectorAll('details').forEach((x) => { x.open = true; }); });
    await p2.waitForTimeout(500);
    const male = await p2.evaluate(() => {
      const VYJIMKY = ['skip-link', 'logo', 'opp-fav', 'opp-skryt', 'linklike'];
      const ven = [];
      document.querySelectorAll('a[href], button, summary, select, label.chip-check').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (e.closest('details:not([open])')) return;
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
        if (e.tagName === 'A' && getComputedStyle(e).display === 'inline') return;
        if (VYJIMKY.some((k) => e.classList.contains(k))) return;
        if (r.height >= 44) return;
        ven.push(e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]
          + ' „' + (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 20)
          + '" ' + Math.round(r.height) + ' px');
      });
      return [...new Set(ven)];
    });
    male.forEach((m) => nalezy.push(`${stranka}: ${m}`));

    /* A CO JDE KLEPNOUT, MUSÍ JÍT I KLÁVESNICÍ. Volby „Musí mít"
       u hlídání (Elektřina, Voda, …) byly obyčejné <span> s obsluhou
       klepnutí: myší ano, klávesnicí nijak, a čtečka je četla jako holý
       text bez stavu — přitom je to půlka toho, co hlídání umí. Hledá se
       to podle kurzoru: co má tvar ruky, na to člověk klepne. */
    const bezKlavesnice = await p2.evaluate(() => {
      const FOKUS = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
      const ven = [];
      document.querySelectorAll('*').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) return;
        if (!e.offsetParent) return;
        if (getComputedStyle(e).cursor !== 'pointer') return;
        if (e.matches(FOKUS) || e.closest(FOKUS)) return;
        if (e.querySelector(FOKUS)) return;
        /* Popisek s „for" ovládá pole, které zaměřit jde — na ten se
           klávesnicí dostat netřeba, stačí na jeho pole. */
        const l = e.tagName === 'LABEL' ? e : e.closest('label[for]');
        if (l && l.getAttribute('for')) {
          const cil = document.getElementById(l.getAttribute('for'));
          if (cil && cil.matches(FOKUS)) return;
        }
        ven.push(e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]
          + ' „' + (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 18) + '"');
      });
      return [...new Set(ven)];
    });
    bezKlavesnice.forEach((m) => nalezyKlavesnice.push(`${stranka}: ${m}`));
  }
  /* Ať kontrola není prázdná: na těch stránkách musí něco měřitelného
     vůbec být. Kdyby se neotevřely (třeba kvůli přihlášení), našlo by se
     nula prvků a kontrola níž by mlčela. */
  const merenych = await p2.evaluate(() => document.querySelectorAll('a[href], button').length);
  pravda('poslední z procházených stránek má co měřit', merenych > 3,
    `měřitelných prvků: ${merenych}`);
  pravda(`ovládání se dá trefit prstem i mimo úvodní stránku (${STRANKY.length} stránek)`,
    nalezy.length === 0, nalezy.slice(0, 8).join(' | '));
  pravda(`a co jde klepnout, jde i klávesnicí (${STRANKY.length} stránek)`,
    nalezyKlavesnice.length === 0, nalezyKlavesnice.slice(0, 8).join(' | '));
  await ctx.close();
}

/* --- 6b2) NAŠEPTÁVAČ U HLEDÁNÍ --------------------------------------
 *
 * Objeví se až při psaní, takže ho měření stránky minulo — a je to
 * hlavní způsob, jak si na telefonu vybrat obec. Řádky měly 38 px;
 * netrefený řádek tu znamená jinou vesnici, ne jen nepřesnost.
 */
{
  const { ctx, p: p5 } = await otevri('index.html', 390, 844);
  await p5.waitForTimeout(3000);
  await p5.fill('#map-search', 'Kol');
  await p5.waitForTimeout(1200);
  const v = await p5.evaluate(() => {
    const n = document.getElementById('map-search-navrhy');
    if (!n || n.hidden) return null;
    const polozky = [...n.querySelectorAll('li')];
    return { pocet: polozky.length,
      male: polozky.map((e) => ({ t: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
        v: Math.round(e.getBoundingClientRect().height) })).filter((x) => x.v < 44) };
  });
  pravda('našeptávač se po napsání obce otevřel (jinak zkouška nic neměří)',
    !!v && v.pocet > 0, v ? `návrhů: ${v.pocet}` : 'seznam návrhů se neukázal');
  if (v) {
    pravda('a jeho řádky se dají trefit prstem (44 px)', v.male.length === 0,
      v.male.map((x) => `„${x.t}" ${x.v} px`).join(' | '));
  }
  await ctx.close();
}

/* --- 6b3) FORMULÁŘ „NOVÉ HLÍDÁNÍ" ------------------------------------
 *
 * Volby „Musí mít" (Elektřina, Voda, …) byly obyčejné <span> s obsluhou
 * klepnutí: myší ano, klávesnicí nijak, a čtečka je četla jako holý text
 * bez stavu — přitom je to půlka toho, co hlídání umí.
 *
 * Formulář je ve druhé záložce, takže ho procházení stránek nevidí: kdo
 * má uložené hlídání, tomu se otevře seznam. Zkouška proto na tu záložku
 * napřed klepne — jinak měří skrytý panel, což se mi taky stalo a prošlo
 * to i se sabotáží.
 */
{
  /* Vlastní okno: hlidani.html ukáže bez přihlášení přihlašovací kartu,
     ne formulář — a kontrola by měřila ji. */
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ', permissions: [] });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel', user: { id: '11111111-1111-4111-8111-111111111111' } }));
  });
  const p6 = await ctx.newPage();
  await p6.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
  await p6.waitForTimeout(2600);
  await p6.evaluate(() => {
    const t = document.querySelector('.hl-tab[data-zalozka="nove"]');
    if (t) t.click();
  });
  await p6.waitForTimeout(900);
  const v = await p6.evaluate(() => {
    const FOKUS = 'a[href], button, input, select, textarea, summary, [tabindex]:not([tabindex="-1"])';
    const chipy = [...document.querySelectorAll('.hl-chip')].filter((e) => e.offsetParent);
    const bezKlaves = chipy.filter((e) => !e.matches(FOKUS) && !e.closest(FOKUS));
    const male = chipy.filter((e) => e.getBoundingClientRect().height < 44)
      .map((e) => (e.textContent || '').trim().slice(0, 14) + ' ' + Math.round(e.getBoundingClientRect().height) + ' px');
    const bezStavu = chipy.filter((e) => !e.hasAttribute('aria-pressed'));
    return { pocet: chipy.length, bezKlaves: bezKlaves.length, male, bezStavu: bezStavu.length };
  });
  pravda('formulář „Nové hlídání" se otevřel a volby „Musí mít" jsou vidět',
    v.pocet >= 5, `voleb: ${v.pocet} — bez nich kontroly níž nic neměří`);
  pravda('a dají se zapnout klávesnicí, ne jen myší', v.bezKlaves === 0,
    `${v.bezKlaves} z ${v.pocet} voleb se nedá zaměřit`);
  pravda('a čtečka u nich pozná, jestli jsou zapnuté', v.bezStavu === 0,
    `${v.bezStavu} z ${v.pocet} voleb nemá aria-pressed`);
  pravda('a dají se trefit prstem (44 px)', v.male.length === 0, v.male.join(' | '));
  await ctx.close();
}

/* --- 6c) VÝBĚR OKOLÍ SE OVLÁDÁ JEDINĚ PRSTEM -------------------------
 *
 * Dialog „Pozemky v okolí" se otevře až po klepnutí, takže ho měření
 * stránky minulo — a přitom v něm bylo pod mírou úplně všechno:
 * přepínače okruhu 37 px, křížek 38, zoom mapy 30×30. Zrovna na jeho
 * ovládání přišly stížnosti.
 *
 * Zvětšit se přitom musí ŠTÍTEK, ne jen nápis v něm: klikací je
 * průhledné políčko natažené přes štítek, takže výška nápisu s ním nehne.
 */
{
  const { ctx, p: p3 } = await otevri('index.html', 390, 844);
  await p3.waitForTimeout(3200);
  const jeTlacitko = await p3.evaluate(() => !!document.querySelector('.map-near-btn'));
  pravda('tlačítko „Pozemky v okolí" na úvodní stránce je', jeTlacitko,
    'bez něj se výběr okolí neotevře a kontrola níž nic nezměří');
  if (jeTlacitko) {
    await p3.click('.map-near-btn');
    await p3.waitForTimeout(1800);
    const male = await p3.evaluate(() => {
      const ov = document.querySelector('.vm-ov');
      if (!ov) return null;
      const ven = [];
      ov.querySelectorAll('a[href], button, label, input, summary').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return;
        if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
        if (r.height >= 44) return;
        ven.push(e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]
          + ' „' + (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 16)
          + '" ' + Math.round(r.width) + 'x' + Math.round(r.height));
      });
      return { pocet: ov.querySelectorAll('a[href], button, label, input').length, male: [...new Set(ven)] };
    });
    pravda('výběr okolí se otevřel a má co měřit', !!male && male.pocet > 3,
      male ? `ovládacích prvků: ${male.pocet}` : 'dialog .vm-ov se neotevřel');
    if (male) {
      pravda('a všechno se v něm dá trefit prstem (44 px)', male.male.length === 0,
        male.male.join(' | '));
    }
  }
  await ctx.close();
}

/* --- 6d) MAPA NA STRÁNCE POZEMKU SE STAVÍ AŽ NA DOHLED ---------------
 *
 * Proto ji měření stránky nevidělo: v okamžiku, kdy se měřilo, tam
 * mapa ještě nebyla. Změřeno po doscrollování: přepínač podkladu 31 px,
 * vrstev 34, zvětšení 36, zoom 30×30 a posuvník průhlednosti vrstvy
 * 16 px — do šestnácti pixelů se prstem netrefí nikdo, a je to jediný
 * způsob, jak si prohlédnout, co je pod úřední vrstvou.
 */
{
  /* Skutečný pozemek z dat, ne vymyšlené souřadnice: bez nálezu se
     stránka vůbec nevykreslí a mapa nevznikne — kontrola by pak měřila
     prázdno (což se mi taky povedlo, než to pojistka ukázala). */
  const vzorek = (JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || [])
    .find((x) => typeof x.lat === 'number' && typeof x.lng === 'number' && x.price > 0);
  const klicVzorku = [vzorek.place || '', vzorek.parcel || '', vzorek.okres || '',
    vzorek.lat.toFixed(3), vzorek.lng.toFixed(3)].join('|');
  const { ctx, p: p4 } = await otevri(
    `pozemek.html?p=${encodeURIComponent(klicVzorku)}&ll=${vzorek.lat},${vzorek.lng}`, 390, 844);
  await p4.waitForTimeout(2000);
  await p4.locator('#pzm').scrollIntoViewIfNeeded().catch(() => {});
  await p4.waitForTimeout(4000);
  const v = await p4.evaluate(() => {
    const ven = [];
    document.querySelectorAll('.pzm a[href], .pzm button, .pzm label, .pzm input, .leaflet-control a').forEach((e) => {
      const r = e.getBoundingClientRect();
      if (r.width < 4 || r.height < 4) return;
      if (!e.offsetParent && getComputedStyle(e).position !== 'fixed') return;
      /* Uvedení autorů mapové knihovny je povinná drobnost v rohu, ne
         ovládání — na tu se neklepe a zvětšovat ji nemá smysl. */
      if (e.closest('.leaflet-control-attribution')) return;
      /* Štítek u posuvníku je jen slovo; chytá se samotný posuvník. */
      if (e.tagName === 'LABEL' && e.querySelector('input')) return;
      if (r.height >= 44) return;
      ven.push(e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ')[0]
        + ' „' + (e.textContent || e.getAttribute('aria-label') || '').replace(/\s+/g, ' ').trim().slice(0, 16)
        + '" ' + Math.round(r.height) + ' px');
    });
    return { vsech: document.querySelectorAll('.pzm a[href], .pzm button, .pzm input').length, male: [...new Set(ven)] };
  });
  pravda('mapa na stránce pozemku se postavila a má co měřit', v.vsech > 3,
    `ovládacích prvků v mapě: ${v.vsech}`);
  pravda('a její ovládání se dá trefit prstem (44 px)', v.male.length === 0,
    v.male.join(' | '));

  /* HLAVIČKA JE NAHOŘE, TAK AŤ JE NAHOŘE I NA PLÁTNĚ. Měla z-index 1000 —
     jenže přesně tolik si dává Leaflet na ovládání mapy (.leaflet-top
     i .leaflet-bottom), a při shodě rozhoduje pořadí v dokumentu: mapa
     je níž, takže vyhrála a zoom se kreslil přes logo. Měří se to
     jediným pravdivým způsobem: co je na daném bodě opravdu navrchu.

     Projíždí se DVĚ polohy — mapa horním i dolním okrajem pod hlavičkou.
     Ovládání mapy sedí v rozích a při jedné poloze se hlavičky dotýkají
     jen ty horní, při druhé jen ty dolní; s jedinou polohou by zkouška
     po přesunu zoomu do jiného rohu tiše přestala měřit cokoli. */
  let potkalo = 0;
  const cizi = [];
  for (const kam of ['horni', 'dolni']) {
    await p4.evaluate((k) => {
      /* Mapa, ne celý panel: #pzm nese pod mapou ještě přepínače vrstev
         a posuvník průhlednosti, takže podle jeho spodního okraje by
         mapa skončila nad oknem a s hlavičkou by se nepotkala. */
      const m = document.querySelector('#pzm .leaflet-container') || document.getElementById('pzm');
      if (!m) return;
      const r = m.getBoundingClientRect();
      window.scrollBy(0, k === 'horni' ? r.top - 20 : r.bottom - 60);
    }, kam);
    /* Při rolování hlavička zhasíná (a s ní ztrácí i pointer-events),
       takže dokud se nevrátí, ukazoval by elementFromPoint mapu i na
       zdravém webu. Měří se až rozsvícená hlavička. */
    await p4.waitForFunction(
      () => !document.querySelector('header').classList.contains('hl-zhasnuta'),
      null, { timeout: 5000 }).catch(() => {});
    await p4.waitForTimeout(500);
    const v2 = await p4.evaluate((k) => {
      const hl = document.querySelector('header');
      if (!hl) return { ovl: 0, cizi: [] };
      const h = hl.getBoundingClientRect();
      /* Kolik ovládacích prvků mapy do pruhu hlavičky vůbec zasahuje —
         bez nich není co překrývat a kontrola by prošla i rozbitá. */
      let ovl = 0;
      document.querySelectorAll('.leaflet-control').forEach((e) => {
        const r = e.getBoundingClientRect();
        if (r.width > 0 && r.top < h.bottom && r.bottom > h.top) ovl++;
      });
      const ven = [];
      for (let x = 6; x < h.width; x += 18) {
        for (let y = Math.round(h.top) + 4; y < h.bottom - 2; y += 8) {
          const e = document.elementFromPoint(x, y);
          if (!e || hl.contains(e)) continue;
          ven.push(k + ': ' + e.tagName.toLowerCase() + '.'
            + String(e.className || '').split(' ')[0] + ' na [' + x + ',' + Math.round(y) + ']');
        }
      }
      return { ovl, cizi: [...new Set(ven)] };
    }, kam);
    potkalo += v2.ovl;
    cizi.push(...v2.cizi);
  }
  pravda('ovládání mapy se s hlavičkou opravdu potkalo (jinak zkouška nic neměří)',
    potkalo > 0, 'v žádné z obou poloh nezasahoval do pruhu hlavičky ani jeden prvek mapy');
  pravda('a nic se přes hlavičku nekreslí', cizi.length === 0,
    `navrchu je místo hlavičky: ${cizi.slice(0, 5).join(', ')}`);
  await ctx.close();
}

/* --- 6e) OZDOBA NESMÍ LÉZT POD PÍSMO ---------------------------------
 *
 * Za nadpisem úvodu svítí souhvězdí skutečných nabídek. Je stavěné na
 * rozvržení „text vlevo, tečky vpravo" — jenže na telefonu je text přes
 * celou šířku a tečky mu spadnou rovnou pod písmo. Změřeno na
 * vykreslených pixelech: v obdélníku nadpisu bylo 17,3 % teplých
 * (oranžových) pixelů na 390 px a 20,9 % na 320 px, zatímco na monitoru
 * 0,2 %. Nadpis je bílý a mátový, takže teplý pixel se do něj nemá jak
 * dostat jinak než z ozdoby.
 *
 * Závoj, který to měl řešit, visel na .hero-plot se z-index:-1, kdežto
 * plátno je jeho vnuk se z-index:0 — ležel tedy POD tečkami a netlumil
 * nic. Kontrola měří následek, ne zápis v CSS: tentýž nepořádek se dá
 * vyrobit i jinak. */
{
  /* Rozbor obrázku potřebuje stránku, která umí kreslit — screenshot je
     PNG a Node ho sám rozbalit neumí. */
  const rozbor = await prohlizec.newContext();
  const rp = await rozbor.newPage();
  await rp.goto('about:blank');
  async function teple(el) {
    const buf = await el.screenshot();
    return rp.evaluate(async (dataUrl) => {
      const img = new Image();
      await new Promise((r) => { img.onload = r; img.onerror = r; img.src = dataUrl; });
      const c = document.createElement('canvas');
      c.width = img.width; c.height = img.height;
      c.getContext('2d').drawImage(img, 0, 0);
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let t = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i] > d[i + 1] + 12 && d[i] > d[i + 2] + 12) t++;
      }
      return { podil: +(100 * t / (c.width * c.height)).toFixed(1), px: c.width * c.height };
    }, 'data:image/png;base64,' + buf.toString('base64'));
  }
  for (const [w, h] of [[390, 844], [320, 568]]) {
    const { ctx, p } = await otevri('index.html', w, h);
    await p.waitForTimeout(2600);
    const nadpis = await p.$('.hero-plot h1');
    const platno = await p.$('#hero-souhvezdi');
    if (!nadpis || !platno) {
      pravda(`${w} px: úvod má nadpis i souhvězdí (jinak zkouška nic neměří)`, false,
        'chybí .hero-plot h1 nebo #hero-souhvezdi');
      await ctx.close();
      continue;
    }
    /* POJISTKA: ozdoba se musí opravdu kreslit. Kdyby se souhvězdí
       nepostavilo (nenačtená data, chyba skriptu), byl by nadpis čistý
       sám od sebe a kontrola by prošla, ať je v CSS cokoli. */
    const kresli = await p.evaluate(() => {
      const c = document.getElementById('hero-souhvezdi');
      if (!c || !c.width) return 0;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 12) n++;
      return +(100 * n / (c.width * c.height)).toFixed(1);
    });
    pravda(`${w} px: souhvězdí se opravdu kreslí (jinak zkouška nic neměří)`, kresli > 3,
      `pokresleno jen ${kresli} % plátna`);
    const v = await teple(nadpis);
    pravda(`${w} px: a nelezou z něj tečky pod nadpis`, v.podil <= 2,
      `${v.podil} % teplých pixelů v obdélníku nadpisu (${v.px} px) — přes písmo svítí ozdoba`);
    await ctx.close();
  }
  await rozbor.close();
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

/* --- NÁHLED, KTERÝ JE AŽ POD TLAČÍTKEM, JE K NIČEMU -----------------
 *
 * Karty s náhledem („Takhle bude nabídka vypadat" a „Kde se pozemek
 * ukáže") jsou ve zdroji v bočním panelu. Ten se na mobilu skládá POD
 * formulář, takže tam obě skončí až za tlačítkem „Zveřejnit" — a náhled,
 * který člověk uvidí teprve po odeslání, nemá smysl. js/pridat.js je
 * proto na úzké obrazovce přesouvá do toku formuláře.
 *
 * Naměřeno na 390 px, než se to spravilo: stránka 6 470 px vysoká,
 * „Kde se pozemek ukáže" na 4 033 px, tlačítko na 3 892 px. Tuhle chybu
 * jsem si přivezl sám, když jsem tu kartu přidal — v panelu vypadala
 * správně, na telefonu byla pod odesláním.
 */
for (const [w, h] of [[390, 844], [360, 780]]) {
  const { ctx, p } = await otevri('pridat.html', w, h);
  /* Formulář je za přihlášením — bez sezení by se neukázal a kontrola
     by měřila prázdnou stránku. */
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('pk_auth', JSON.stringify({ access_token: 't', refresh_token: 'r',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@parcelka.test' } }));
    } catch (e) {}
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  await p.fill('#p-obec', 'Kolín').catch(() => {});
  await p.fill('#p-okres', 'Kolín').catch(() => {});
  await p.waitForTimeout(2400);
  const v = await p.evaluate(() => {
    const y = (s) => { const e = document.querySelector(s); if (!e) return null;
      const r = e.getBoundingClientRect(); return r.height ? Math.round(r.top + window.scrollY) : null; };
    return { odeslat: y('#form-prodej button[type="submit"]'),
      nahled: y('#live-preview-card'), mapa: y('#mp-card'), obec: y('#p-obec') };
  });
  pravda(`${w} px: formulář je vidět (jinak zkouška nic neměří)`, v.obec !== null && v.odeslat !== null,
    JSON.stringify(v));
  if (v.odeslat !== null) {
    pravda(`${w} px: živý náhled je nad tlačítkem „Zveřejnit"`,
      v.nahled !== null && v.nahled < v.odeslat, `náhled ${v.nahled}, tlačítko ${v.odeslat}`);
    pravda(`${w} px: „kde se pozemek ukáže" je taky nad ním`,
      v.mapa !== null && v.mapa < v.odeslat, `karta ${v.mapa}, tlačítko ${v.odeslat}`);
  }
  await ctx.close();
}

/* A na velké obrazovce se obě karty vrátí do bočního panelu — jinak by
   se přesouvání jen posunulo do formuláře a panel zůstal prázdný. */
{
  const { ctx, p } = await otevri('pridat.html', 1280, 900);
  await ctx.addInitScript(() => {
    try {
      localStorage.setItem('pk_auth', JSON.stringify({ access_token: 't', refresh_token: 'r',
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@parcelka.test' } }));
    } catch (e) {}
  });
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  const v = await p.evaluate(() => ({
    nahled: !!document.querySelector('.add-aside #live-preview-card'),
    mapa: !!document.querySelector('.add-aside #mp-card'),
  }));
  pravda('1280 px: obě karty jsou v bočním panelu', v.nahled && v.mapa, JSON.stringify(v));
  await ctx.close();
}

/* ---- Žádná karta nesmí zůstat v řádku sama ------------------------
   Tipů na dobrou koupi se vybírají tři nebo čtyři (víc se jich nebere,
   míň než tři se oddíl radši neukáže). Mřížka je ale „kolik se vejde",
   takže při třech sloupcích zůstal čtvrtý tip sám a vedle něj dvě
   třetiny prázdna — naměřeno: řádky 3 a 1, karta 296 px.
   Hlídá se NÁSLEDEK, ne počet sloupců: poslední řádek nesmí mít jednu
   kartu, když jich je nad mřížkou víc. */
for (const [w, h] of [[1440, 900], [1280, 900], [1100, 900], [1024, 900], [820, 900]]) {
  const { ctx, p } = await otevri('index.html', w, h);
  await p.waitForTimeout(2600);
  const v = await p.evaluate(() => {
    const g = document.getElementById('deals-grid');
    if (!g || !g.children.length) return null;
    const radky = {};
    [...g.children].forEach((e) => { const t = Math.round(e.getBoundingClientRect().top); radky[t] = (radky[t] || 0) + 1; });
    const poradi = Object.keys(radky).map(Number).sort((a, b) => a - b).map((k) => radky[k]);
    return { karet: g.children.length, poradi,
      sirka: Math.round(g.children[0].getBoundingClientRect().width) };
  });
  /* Pojistka: bez vykreslených tipů by kontrola pod tím prošla naprázdno. */
  pravda(`${w} px: tipy na dobrou koupi se vůbec vykreslily`, !!(v && v.karet >= 3),
    v ? `karet ${v.karet}` : 'mřížka #deals-grid v DOMu není');
  if (v && v.karet >= 3) {
    const posledni = v.poradi[v.poradi.length - 1];
    pravda(`${w} px: a žádný tip nezůstal v řádku sám`,
      v.poradi.length === 1 || posledni > 1,
      `${v.karet} karet po řádcích ${v.poradi.join(' + ')}, karta ${v.sirka} px`);
  }
  await ctx.close();
}

/* ---- Výzva v prázdném oddílu patří POD text, ne vedle něj ----------
   Text i tlačítko byly inline-block, takže se na širokém okně srovnaly
   vedle sebe a dotýkaly se: odstavec končil na 814 px a tlačítko
   začínalo na 813. Na telefonu to vypadalo správně jen proto, že se to
   tam nevešlo. */
for (const [w, h] of [[1440, 900], [1280, 900], [390, 844]]) {
  const { ctx, p } = await otevri('index.html', w, h);
  await p.waitForTimeout(2600);
  const v = await p.evaluate(() => {
    const sp = document.querySelector('.odl-empty span'), bt = document.querySelector('.odl-empty-btn');
    if (!sp || !bt) return null;
    const a = sp.getBoundingClientRect(), c = bt.getBoundingClientRect();
    return { mezera: Math.round(c.top - a.bottom), stejnyRadek: Math.abs(c.top - a.top) < 30,
      sirkaKarty: Math.round((document.querySelector('.odl-empty') || sp).getBoundingClientRect().width) };
  });
  if (v) {    // oddíl se ukazuje jen dokud nejsou inzeráty od majitelů
    pravda(`${w} px: tlačítko v prázdném oddílu stojí pod textem`,
      !v.stejnyRadek && v.mezera >= 8,
      `mezera ${v.mezera} px, na stejném řádku ${v.stejnyRadek} (karta ${v.sirkaKarty} px)`);
  }
  await ctx.close();
}

/* ---- Obsah rádce vedle sazby --------------------------------------
   Čtecí sloupec má 656 px a obrazovka 1280; po stranách zbývalo přes
   500 px prázdna na dvanácti rádcovských stránkách. Obsah to místo
   využívá a zároveň dává dlouhému článku, co mu chybělo: přeskakování
   mezi oddíly.
   Hlídá se tu trojí, protože každé se už jednou pokazilo:
   · že se obsah vůbec postaví (staví ho skript, ne značky),
   · že NELEŽÍ PŘES TEXT — pravidlo `> *{grid-column:2}` váží víc než
     samotné `.obsah{grid-column:1}` a obsah se vykreslil přes článek,
   · že úvodní pás stojí na TÉŽE svislici jako text pod ním; než se
     srovnal, začínal nadpis na 312 px a článek na 438. */
{
  const CLANKY = readdirSync(KOREN).filter((f) => f.endsWith('.html') &&
    /class="add-card clanek"/.test(readFileSync(path.join(KOREN, f), 'utf8'))).sort();
  pravda('rádcovské stránky se našly (jinak zkouška nic neměří)',
    CLANKY.length >= 8, `nalezeno ${CLANKY.length}`);

  for (const sirka of [1280, 1024]) {
    const ceka = sirka >= 1100;
    let bezObsahu = [], prekryv = [], jinaSvislice = [], malo = [], mrtvyOdkaz = [];
    for (const s of CLANKY) {
      const { ctx, p } = await otevri(s, sirka, 900);
      await p.waitForTimeout(500);
      const v = await p.evaluate(() => {
        const o = document.querySelector('.obsah');
        const videt = !!o && getComputedStyle(o).display !== 'none';
        const sec = document.querySelector('.clanek .rules-sect');
        const h1 = document.querySelector('.add-hero h1');
        const le = (e) => e ? Math.round(e.getBoundingClientRect().left) : null;
        const odkazy = o ? [...o.querySelectorAll('a')].map((a) => a.getAttribute('href')) : [];
        return { videt, polozek: odkazy.length,
          slepe: odkazy.filter((h) => !h || !document.querySelector(h)).length,
          lezi: videt && sec ? o.getBoundingClientRect().right > sec.getBoundingClientRect().left + 1 : false,
          levyNadpis: le(h1), levyText: le(sec) };
      });
      if (v.videt !== ceka) bezObsahu.push(s + ' (vidět: ' + v.videt + ')');
      if (v.lezi) prekryv.push(s);
      if (v.levyNadpis !== v.levyText) jinaSvislice.push(`${s}: nadpis ${v.levyNadpis}, text ${v.levyText}`);
      if (ceka && v.polozek < 5) malo.push(s + ' (' + v.polozek + ')');
      if (v.slepe) mrtvyOdkaz.push(s + ' (' + v.slepe + ')');
      await ctx.close();
    }
    pravda(`${sirka} px: obsah rádce je ${ceka ? 'vidět' : 'schovaný'} na všech stránkách`,
      !bezObsahu.length, bezObsahu.join(', '));
    pravda(`${sirka} px: obsah neleží přes text článku`, !prekryv.length, prekryv.join(', '));
    pravda(`${sirka} px: nadpis i text začínají na téže svislici`,
      !jinaSvislice.length, jinaSvislice.slice(0, 3).join(' · '));
    if (ceka) pravda(`${sirka} px: obsah má aspoň pět položek`, !malo.length, malo.join(', '));
    pravda(`${sirka} px: žádná položka obsahu nevede do prázdna`, !mrtvyOdkaz.length, mrtvyOdkaz.join(', '));
  }
}

/* ---- Předloha musí říkat, co šablona opravdu dělá ----------------
   Vzorník měl u ukázek čísla napsaná ručně a rozešel se s webem:
   sliboval nadpis stránky 44 px a váhu 800, zatímco css/styles.css ho
   dělá 50 px a 700; u nadpisu sekce 30 px proti skutečným 33. Podle
   takového vzorníku člověk něco navrhne a pak mu to nesedí — a nikdo
   neví, které z těch dvou čísel platí.
   Popisky teď dopisuje js/predloha-mery.js z vypočtených stylů, takže
   se rozejít NEMŮŽOU. Hlídá se dvojí: že se vůbec dopsaly (rozbitý
   skript by nechal prázdná místa a nikdo by si nevšiml) a že velikost
   nadpisu stránky sedí na to, co stojí v šabloně. */
{
  const { ctx, p } = await otevri('predloha.html', 1280, 900);
  await p.waitForTimeout(700);
  const v = await p.evaluate(() => {
    const mista = [...document.querySelectorAll('[data-mera]')];
    const h1 = document.querySelector('.typ h1');
    return {
      mist: mista.length,
      prazdnych: mista.filter((e) => !e.textContent.trim()).length,
      bezCisla: mista.filter((e) => !/\d/.test(e.textContent)).length,
      h1px: h1 ? Math.round(parseFloat(getComputedStyle(h1).fontSize)) : null,
    };
  });
  pravda('předloha má ukázky s doplňovanou mírou', v.mist >= 5, `míst: ${v.mist}`);
  pravda('a všechny se opravdu doplnily', v.prazdnych === 0 && v.bezCisla === 0,
    `prázdných ${v.prazdnych}, bez čísla ${v.bezCisla}`);
  const css = readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
  const vSablone = /(?:^|\n)h1\{[^}]*font-size:\s*(\d+)px/.exec(css);
  pravda('v šabloně se našla velikost nadpisu stránky (jinak se nemá s čím porovnat)',
    !!vSablone, 'pravidlo h1{…font-size} v css/styles.css nenalezeno');
  if (vSablone) {
    pravda('a předloha ukazuje touž velikost jako šablona',
      v.h1px === +vSablone[1], `předloha ${v.h1px} px, šablona ${vSablone[1]} px`);
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
