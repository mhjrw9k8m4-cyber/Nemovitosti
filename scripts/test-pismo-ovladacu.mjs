// Test: ovladače píšou písmem webu, a měří se to i po přihlášení.
//
// Spuštění: node scripts/test-pismo-ovladacu.mjs
//   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta)
//
// DVĚ VĚCI NARÁZ, protože bez té druhé by první nic nenašla.
//
// 1) PÍSMO. Tlačítka, pole, rozbalovátka ani textové plochy písmo
//    NEDĚDÍ — tak to má CSS odjakživa. Dokud si ho nenastaví samy,
//    vykreslí se výchozím písmem prohlížeče. Změřeno 2. 11. 2026
//    v Chromiu: „Odeslat pozemek ke zveřejnění“ na pridat.html psalo
//    ARIALEM, stejně jako hamburger v hlavičce a tlačítko „Nahoru“ —
//    zatímco celý web píše Interem. Na odkazech to vidět nebylo (<a>
//    písmo dědí), a protože většina tlačítek webu jsou odkazy, zůstala
//    vada v menšině míst a nikdo si jí nevšiml.
//
// 2) STAV PO PŘIHLÁŠENÍ. Hlídači vzhledu měřili jen odhlášeného (úkol
//    #217), a část ovladačů je vidět až po přihlášení — na pridat.html
//    je jich 33 proti 18. Tahle zkouška je proto první, která stránky
//    otevírá v OBOU stavech: přihlášení se předstírá zápisem pk_auth
//    a dotazy jdou na falešnou Supabase (scripts/falesna-supabase-chat.mjs).
//
// A ještě jedno poučení je tu zapsané jako kontrola: pravidlo v
// css/styles.css NEZNAMENÁ pravidlo na stránce. Stránky si berou
// zkrácené svazky (css/zaklad.min.css a spol., viz scripts/rozdel-styly.mjs)
// a dokud se nepřestaví, nové pravidlo na web nedojde. Při téhle opravě
// jsem na to narazil: po zápisu do styles.css měřil prohlížeč Arial dál.
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
const U = (p) => new URL('../' + p, import.meta.url);
const UID = '11111111-1111-4111-8111-111111111111';
const RODINA = 'Inter';
const STRANKY = ['index.html', 'pridat.html', 'hlidani.html', 'zpravy.html',
  'muj-inzerat.html', 'prihlaseni.html', 'kontakt.html', 'diagnostika.html',
  'pozemky-okres-benesov.html'];

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) PRAVIDLO JE VE ZDROJI A DOŠLO NA STRÁNKY --------------- */
{
  const zdroj = readFileSync(U('css/styles.css'), 'utf8');
  pravda('ovladače mají ve stylopisu dědit rodinu písma',
    /button,\s*input,\s*select,\s*textarea,\s*optgroup\{\s*font-family:inherit;?\s*\}/.test(zdroj),
    'bez toho se vykreslí výchozím písmem prohlížeče, protože ovladače písmo nedědí');
  /* Dědí se RODINA, ne velikost: `font: inherit` by přepsalo i
     font-size, který si ovladače nastavují samy podle role. */
  pravda('a dědí se jen rodina, ne celé `font` (velikost si ovladače řídí samy)',
    !/button,\s*input,\s*select,\s*textarea[^{]*\{\s*font:\s*inherit/.test(zdroj));
  const svazky = ['css/styles.min.css', 'css/zaklad.min.css', 'css/region.min.css', 'css/pozemek.min.css'];
  const bez = svazky.filter((f) => !/optgroup\{font-family:inherit\}/.test(readFileSync(U(f), 'utf8')));
  pravda(`a je v každém svazku, který si stránky berou (${svazky.length})`,
    bez.length === 0, 'chybí v: ' + bez.join(', ') + ' — pravidlo ve zdroji ještě není pravidlo na stránce');
}

/* ---- 2) MĚŘENÍ V PROHLÍŽEČI, ODHLÁŠENĚ I PŘIHLÁŠENĚ ----------- */
const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
async function kontext(prihlasen) {
  /* Servisní pracovník se vypíná: kdo podstrkuje odpovědi přes route,
     nesmí nechat v cestě mezipaměť, která by odpověděla místo něj
     (hlídá scripts/test-zkousky-meri.mjs). */
  const c = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  /* Dotazy na Supabase jdou na falešný server; cizí hosty (dlaždice
     map, písma z Googlu) se zahodí, ať zkouška nečeká na síť. */
  await c.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';` }));
  for (const vzor of ['**/*.supabase.co/**', '**/server.arcgisonline.com/**',
    '**/fonts.googleapis.com/**', '**/fonts.gstatic.com/**', '**/*.openstreetmap.org/**']) {
    await c.route(vzor, (r) => r.abort());
  }
  if (prihlasen) {
    await c.addInitScript(([u, t]) => {
      localStorage.setItem('pk_auth', JSON.stringify({ access_token: t,
        refresh_token: 'ref-majitel', user: { id: u, email: 'majitel@test.cz' } }));
    }, [UID, 'tok-majitel']);
  }
  return c;
}

const MERENI = () => {
  const SEL = 'button, input:not([type=hidden]), select, textarea';
  const ven = { pocet: 0, mimo: [], klice: [] };
  document.querySelectorAll(SEL).forEach((e) => {
    const r = e.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    const st = getComputedStyle(e);
    if (st.visibility === 'hidden' || Number(st.opacity) === 0) return;
    ven.pocet++;
    ven.klice.push((e.tagName + '.' + (e.className || '').toString().trim()).slice(0, 60));
    const prvni = st.fontFamily.split(',')[0].replace(/["']/g, '').trim();
    if (prvni.toLowerCase() === 'inter') return;
    ven.mimo.push({
      co: (e.tagName + '.' + (e.className || '').toString().trim()).slice(0, 48),
      jmeno: ((e.getAttribute('aria-label') || e.textContent || e.value || '')).replace(/\s+/g, ' ').trim().slice(0, 28),
      rodina: prvni,
    });
  });
  return ven;
};

const stav = {};
for (const prihlasen of [false, true]) {
  const c = await kontext(prihlasen);
  const jmeno = prihlasen ? 'přihlášen' : 'odhlášen';
  let pocet = 0; const mimo = []; const klice = new Set(); const nedoslo = [];
  for (const s of STRANKY) {
    const p = await c.newPage();
    try {
      await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded', timeout: 20000 });
      await p.waitForTimeout(900);
      const v = await p.evaluate(MERENI);
      pocet += v.pocet;
      for (const m of v.mimo) mimo.push({ ...m, stranka: s });
      for (const k of v.klice) klice.add(k);
    } catch (e) { nedoslo.push(`${s}: ${String(e.message).slice(0, 60)}`); }
    await p.close();
  }
  await c.close();
  stav[jmeno] = { pocet, mimo, klice, nedoslo };
  pravda(`${jmeno}: všechny stránky se otevřely (${STRANKY.length})`,
    nedoslo.length === 0, nedoslo.join(' | '));
  pravda(`${jmeno}: bylo co měřit (${pocet} viditelných ovladačů)`, pocet >= 30, `${pocet}`);
  pravda(`${jmeno}: každý ovladač píše ${RODINA}em`, mimo.length === 0,
    mimo.slice(0, 6).map((m) => `${m.stranka} ${m.co} „${m.jmeno}" → ${m.rodina}`).join('\n      ')
      + (mimo.length > 6 ? `\n      …a dalších ${mimo.length - 6}` : ''));
}

/* ---- 3) PŘIHLÁŠENÝ STAV OPRAVDU UKAZUJE JINÉ OVLADAČE --------- */
/* Jinak by druhá polovina měření jen podruhé proměřila totéž a úkol
   #217 („hlídači vidí jen odhlášeného“) by zůstal nesplněný, aniž by
   to bylo poznat. Počet se nehlídá proti pevnému číslu — stačí, že
   přihlášení přináší ovladače, které odhlášený nemá. */
{
  const navic = [...stav['přihlášen'].klice].filter((k) => !stav['odhlášen'].klice.has(k));
  pravda(`po přihlášení jsou vidět ovladače, které odhlášený nemá (${navic.length})`,
    navic.length >= 1, navic.slice(0, 8).join(' · '));
}

await prohlizec.close();
console.log('Písmo ovladačů:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) hlasPad('Písmo ovladačů', zpravy.filter((z) => z.includes('✕')).map((z) => z.replace(/^\s*✕\s*/, '')), pricinaChyb);
process.exit(chyb ? 1 : 0);
