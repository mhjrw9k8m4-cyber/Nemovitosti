/* Test: vyhledávání pozemků vypadá jako jedna věc.
 * ====================================================================
 * Spuštění: node scripts/test-hledani-vzhled.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta)
 *
 * PROČ. Majitel webu: „vylepši vizuálně konečně to vyhledávání pozemků
 * na další level v úplnosti a profesionalitě." Vyhledávání není jedno
 * políčko — je to pole, našeptávač obcí, odznaky rozpoznané z věty,
 * odznaky druhů a panel filtrů. Každý z těch dílů si žil vlastním
 * životem a dalo se to vyčíslit:
 *
 *   · našeptávač měl na telefonu 207 px z 370, protože se roztahoval
 *     na POLE, ne na řadu — a návrhy se do té šířky nevešly: položky
 *     byly 57 px vysoké, tedy tři zalomené řádky („Brno-venkov"
 *     rozlomené uprostřed jména);
 *   · odznaky druhů byly šedé (rgb 237,239,238) vedle bílých sousedů
 *     a měly šířky 89 / 126 / 122 / 133 px ve dvou řadách;
 *   · značka druhu v odznaku měla 8 px, takže kosočtverec (dražba)
 *     splýval s trojúhelníkem (exekuce) — a přitom tvar je to jediné,
 *     co ty dva od sebe odliší pro barvoslepé (viz test-tvary.mjs);
 *   · odznaky rozpoznané z věty měly TŘI barvy bez vysvětlení a terč
 *     30 px, ačkoli web si jinde sám vymáhá 44;
 *   · v panelu filtrů měla první řada druhů 77 px a ostatní 58.
 *
 * Tahle zkouška měří SKUTEČNÉ rozměry a barvy v prohlížeči, ne zápis
 * v CSS — proto pozná i to, co se rozbije až složením pravidel.
 */
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
hlasPad('Vzhled hledání', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(e) {
  if (e) zpravy.push('  ✕ zkouška spadla: ' + e.message);
  console.log('\nVyhledávání pozemků — jeden vzhled');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb + (e ? 1 : 0)} chyb\n`);
  if (chyb || e) { console.log('::error::Vzhled hledání: ' + (chyb + (e ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block',
    viewport: { width: 390, height: 1400 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  /* ČEKÁ SE NA STAV, NE NA HODINY.
     Zkouška nejdřív spala pevných 2 600 ms a pak měřila. Na vytížené
     mašině v CI to je sázka: když se data načtou o chlup později,
     zkouška nahlásí vadu, která v aplikaci není (hlídá to i checklist
     gstacku, oddíl „Timing-Dependent Tests"). Čeká se proto na věc,
     která má být na obrazovce — a pevná pauza zůstává jen tam, kde
     není na co se chytit (dojezd animace). */
  const nacteno = async () => {
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await p.waitForFunction(() => {
      const c = document.getElementById('map-count');
      return !!c && !/Načítám/.test(c.textContent || '');
    }, { timeout: 25000 });
  };
  await nacteno();

  /* --- 1) NAŠEPTÁVAČ OBCÍ ------------------------------------------ */
  await p.click('#map-search');
  await p.type('#map-search', 'Brno', { delay: 40 });
  await p.waitForSelector('#map-search-navrhy li', { timeout: 10000 });
  const n = await p.evaluate(() => {
    const ul = document.getElementById('map-search-navrhy');
    const rada = document.querySelector('.mcp-hledani');
    if (!ul || ul.hidden || !rada) return null;
    const li = [...ul.querySelectorAll('li')];
    return { sirka: Math.round(ul.getBoundingClientRect().width),
      rada: Math.round(rada.getBoundingClientRect().width),
      vysky: li.map((l) => Math.round(l.getBoundingClientRect().height)),
      radku: li.map((l) => {
        /* Kolik řádků text zabral: výška obsahu dělená řádkováním.
           Měří se SKUTEČNÝ obal textu, ne počet znaků — zalomení dělá
           prohlížeč a jen on ví, kde. */
        const cs = getComputedStyle(l);
        const vnitrni = l.getBoundingClientRect().height
          - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
        return Math.round(vnitrni / parseFloat(cs.lineHeight || 20));
      }) };
  });
  pravda('našeptávač obcí se po napsání „Brno" ukázal', !!(n && n.vysky.length),
    'seznam návrhů je prázdný nebo schovaný');
  if (n) {
    pravda('a roztáhl se přes celou řadu hledání', n.sirka >= n.rada - 1,
      `${n.sirka} px z ${n.rada} px`);
    pravda('a každý návrh se vejde na jeden řádek', n.radku.every((r) => r <= 1),
      'řádků na položku: ' + JSON.stringify(n.radku) + ', výšky: ' + JSON.stringify(n.vysky));
    /* Terč pro prst: vybírá se z něj klepnutím. */
    pravda('a každý návrh je aspoň 44 px vysoký', n.vysky.every((v) => v >= 44),
      'výšky: ' + JSON.stringify(n.vysky));
  }

  /* --- 2) ODZNAKY DRUHŮ -------------------------------------------- */
  const d = await p.evaluate(() => {
    const chipy = [...document.querySelectorAll('#map-filters .filter-chip')].filter((c) => c.offsetParent);
    const vypnute = chipy.filter((c) => !c.classList.contains('active'));
    const soused = document.querySelector('.map-near-btn') || document.querySelector('.msf-summary');
    return { sirky: chipy.map((c) => Math.round(c.getBoundingClientRect().width)),
      plocha: vypnute.length ? getComputedStyle(vypnute[0]).backgroundColor : null,
      plochaSouseda: soused ? getComputedStyle(soused).backgroundColor : null,
      /* ZNAČKA DRUHU JE OD 29. 10. IKONA, NE BAREVNÝ PUNTÍK. Majitel:
         „odeber ty barvičky a přidej tam nějaké ikonky." Měří se
         tedy .fc-ik; smysl kontroly se nemění — značka musí být dost
         velká, aby se dala přečíst. */
      znacky: chipy.map((c) => { const m = c.querySelector('.fc-ik');
        return m ? Math.round(m.getBoundingClientRect().width) : null; }).filter((x) => x !== null) };
  });
  pravda('odznaky druhů se vykreslily', d.sirky.length >= 2, 'našly se jen ' + d.sirky.length);
  if (d.sirky.length >= 2) {
    pravda('a mají tutéž šířku', new Set(d.sirky).size === 1, 'šířky: ' + JSON.stringify(d.sirky));
    /* Bílá jako ovladače kolem nich. Šedá z nich dělala vypnuté
       ovládání, ačkoli jsou to živé přepínače. */
    pravda('a tutéž plochu jako ovladač nad nimi', !!d.plocha && d.plocha === d.plochaSouseda,
      `odznak ${d.plocha}, soused ${d.plochaSouseda}`);
    pravda('a značka druhu v nich má aspoň 12 px',
      d.znacky.length > 0 && Math.min(...d.znacky) >= 12,
      'nejmenší má ' + (d.znacky.length ? Math.min(...d.znacky) : '—') + ' px');
  }

  /* --- 3) ODZNAKY ROZPOZNANÉ Z VĚTY -------------------------------- */
  await p.evaluate(() => { const e = document.getElementById('map-search'); e.value = ''; });
  await p.click('#map-search');
  await p.type('#map-search', 'les do 30 km od Brna do 500 tis', { delay: 15 });
  await p.keyboard.press('Enter');
  await p.waitForFunction(() => {
    const ch = document.getElementById('ms-chipy');
    return !!ch && !ch.hidden && ch.querySelectorAll('.msch').length >= 2;
  }, { timeout: 15000 });
  const v = await p.evaluate(() => {
    const ch = document.getElementById('ms-chipy');
    if (!ch || ch.hidden) return null;
    const kusy = [...ch.querySelectorAll('.msch')];
    return { pocet: kusy.length,
      plochy: [...new Set(kusy.map((k) => getComputedStyle(k).backgroundColor))],
      vysky: kusy.map((k) => Math.round(k.getBoundingClientRect().height)) };
  });
  pravda('z věty se rozpoznalo aspoň dvoje a ukázalo se to', !!(v && v.pocet >= 2),
    'odznaky rozpoznaných filtrů se neukázaly');
  if (v) {
    /* Jedna plocha: všechny říkají totéž („tohle jsem si z věty vzal"),
       rozdíl mezi místem, cenou a druhem nese text, ne barva. */
    pravda('a všechny odznaky mají jednu plochu', v.plochy.length === 1,
      'ploch: ' + JSON.stringify(v.plochy));
    pravda('a dají se zrušit prstem (44 px)', v.vysky.every((h) => h >= 44),
      'výšky: ' + JSON.stringify(v.vysky));
  }

  /* --- 4) PANEL FILTRŮ --------------------------------------------- */
  /* NAČÍST STRÁNKU ZNOVU, A MÁ TO DŮVOD.
     Panel se měří na NEVYFILTROVANÉM seznamu druhů — tam, kde roztřepené
     řady vznikly: „Louka / travní porost" se v 171px políčku zalomí na
     tři řádky, kdežto „Zahrada" na jeden. Jenže o kus výš zkouška napsala
     do hledání celou větu („les do 30 km od Brna do 500 tis"), takže by
     panel ukázal jen hrstku druhů, které zbyly — a mezi nimi je výška
     jednotná i bez `grid-auto-rows`.
     NAŠLO SE TO SABOTÁŽÍ: po odebrání `grid-auto-rows:1fr` zkouška dál
     hlásila „stejně vysoká", ačkoli sonda ve stejné chvíli měřila
     77 / 77 / 58 / 58 / 58 / 58 / 58 / 58. Kontrola měřila jinou skupinu,
     než o které mluvila. Proto čistá stránka. */
  await nacteno();
  await p.click('#map-search');
  await p.waitForSelector('.ms-filters summary, .ms-filters .msf-summary', { state: 'visible', timeout: 10000 });
  await p.evaluate(() => { const s = document.querySelector('.ms-filters summary, .ms-filters .msf-summary'); if (s) s.click(); });
  await p.waitForFunction(() => {
    const b = [...document.querySelectorAll('.mcv-btn')].filter((e) => e.offsetParent);
    return b.length >= 4;
  }, { timeout: 10000 });
  const f = await p.evaluate(() => {
    const btns = [...document.querySelectorAll('.mcv-btn')].filter((e) => e.offsetParent);
    const prvni = btns[0] && btns[0].parentElement;
    const skupina = prvni ? [...prvni.children].filter((e) => e.offsetParent) : [];
    /* Karta „Cena a výměra" je složená ze dvou kusů: .mc-shrnuti se
       dvěma tlačítky (.mcs-btn — „Cena" a „Výměra", každé otevírá
       vlastní plátno) a pod ním .mc-hodnota-radek s rozbalovátkem
       („Cena za m²"). Hodnota se v obou případech hledá jako POSLEDNÍ
       prvek řádku, ať je to tlačítko rozbalovátka nebo span se
       slovem „libovolná" — měří se, kde končí, ne co to je. */
    const hodnoty = [];
    document.querySelectorAll('.mc-hodnoty .mcs-btn').forEach((b) => {
      if (!b.offsetParent) return;
      const h = b.lastElementChild || b;
      hodnoty.push(Math.round(h.getBoundingClientRect().right));
    });
    document.querySelectorAll('.mc-hodnoty .mc-hodnota-radek').forEach((r) => {
      if (!r.offsetParent) return;
      const h = r.querySelector('.cdd-btn') || r.lastElementChild;
      if (h) hodnoty.push(Math.round(h.getBoundingClientRect().right));
    });
    const prave = hodnoty;
    return { vysky: skupina.map((e) => Math.round(e.getBoundingClientRect().height)), prave };
  });
  pravda('panel filtrů se otevřel a má políčka druhů', f.vysky.length >= 4,
    'našlo se jen ' + f.vysky.length);
  if (f.vysky.length >= 4) {
    pravda('a všechna políčka v té skupině jsou stejně vysoká',
      new Set(f.vysky).size === 1, 'výšky: ' + JSON.stringify(f.vysky));
  }
  pravda('hodnoty v kartě „Cena a výměra" končí v jednom sloupci',
    f.prave.length >= 2 && Math.max(...f.prave) - Math.min(...f.prave) <= 2,
    'pravé okraje: ' + JSON.stringify(f.prave));
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
