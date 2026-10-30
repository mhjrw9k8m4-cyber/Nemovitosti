// Vidět je i to, co není text: okraje ovládacích prvků.
//
// Spuštění: node scripts/test-okraje.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Proč zvlášť: test kontrastu měří TEXT. Políčko, které má bílé pozadí na
// bílém panelu a okraj na 18 % černé, projde – text v něm je čitelný –
// a přitom na mobilu vypadá, že tam žádné políčko není. Přesně to se stalo
// u filtrů ceny a výměry.
//
// Měřítko je WCAG 2.1, pravidlo 1.4.11 (Non-text Contrast): hranice prvku,
// se kterým se dá pracovat, musí mít proti sousední ploše aspoň 3:1.
//
// Co se NEMĚŘÍ, ať test nehlásí nesmysly:
//   – tlačítko bez rámečku a bez výplně (odkaz nebo ikonka; jeho tvar je
//     samotný text nebo čárky obrázku, a ty hlídá kontrast textu),
//   – prvek s barevným přechodem na pozadí (odlišuje se výplní, ne čárou).
// Měří se tedy políčka a seznamy vždycky, a cokoli dalšího, co si rámeček
// nebo výplň samo nasadilo — protože pak se od pozadí odlišit CHCE.
import { chromium } from 'playwright-core';
import { hlasPad } from './zkouska-pad.mjs';
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Tahle zkouška si kontroly nedrží v seznamu (vypisuje je rovnou), takže
   se u pádu nemá co vypsat — ale pojmenovaný titulek a MÍSTO ve zkoušce
   jsou pořád víc než nahá stopa výjimky. */
hlasPad('Viditelnost okrajů (WCAG 1.4.11)', []);

const STRANKY = ['index.html', 'pridat.html', 'hlidani.html', 'zpravy.html', 'muj-inzerat.html', 'kontakt.html'];
const PRVKY = 'select, input:not([type=hidden]), textarea, button, .map-select, .filter-chip, summary';
const MIN = 3;

function lum(r, g, b) {
  const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function pomer(a, b) {
  const la = lum(a[0], a[1], a[2]), lb = lum(b[0], b[1], b[2]);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
/* DVA PROFILY, A DOTYK SE MUSÍ ŘÍCT VÝSLOVNĚ.
   Do 15. 10. se měřilo jen v okně 390 px BEZ emulace dotyku — tedy
   „telefon s myší", zařízení, které neexistuje. Pravidla pro telefon
   tu stojí za `@media (pointer: coarse)`, ne za šířkou okna, a právě
   v tom bloku dostávají políčka `font-size:16px !important` a ovládání
   terč 44 px, tedy přesně to, co tahle zkouška měří.
   Samotné zapnutí dotyku ale nestačilo: změřeno 25 prvků s dotykem
   proti 39 bez něj. Na telefonu se část ovládání schválně neukazuje,
   takže by se zkouška o těch čtrnáct prvků připravila. Profily jsou
   proto dva — telefon s dotykem a monitor bez dotyku — a měří se
   SJEDNOCENÍ, ne jeden místo druhého.
   (Jak se to našlo: bod 3da v docs/co-chybi.md.) */
const PROFILY = [
  { jmeno: 'telefon', viewport: { width: 390, height: 900 }, dotyk: true },
  { jmeno: 'monitor', viewport: { width: 1280, height: 900 }, dotyk: false },
];
async function kontext(profil) {
  const ctx = await prohlizec.newContext(Object.assign({ bypassCSP: true,  serviceWorkers: 'block', viewport: profil.viewport },
    profil.dotyk ? { isMobile: true, hasTouch: true, locale: 'cs-CZ' } : {}));
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.protocol === 'file:' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    return r.abort();
  });
  return ctx;
}

const nalezy = [];
let zmereno = 0, preskoceno = 0;

for (const profil of PROFILY) {
const ctx = await kontext(profil);
for (const s of STRANKY) {
  const p = await ctx.newPage();
  await p.goto('file://' + process.cwd() + '/' + s, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  // Prvky schované v rozbalovacích blocích jsou taky prvky — otevřeme je.
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
  await p.waitForTimeout(250);

  /* OVLÁDÁNÍ, KTERÉ SE ODHLÁŠENÉMU NEVYKRESLÍ, TAHLE ZKOUŠKA NEMĚŘILA.
     `muj-inzerat.html` je v seznamu stránek od začátku, ale bez
     přihlášení je v něm jen přihlašovací pole — celý seznam inzerátů
     včetně tlačítek si vykreslí až JavaScript z odpovědi databáze. Pravidla
     pro ta tlačítka přitom ve stylopisu stránky stojí a platí.
     Stálo to jeden nález: `.mi-lbtn.danger` („Smazat") je bílé tlačítko
     na bílé kartě a jeho jediná hranice měla proti kartě 1,60 : 1,
     tedy polovinu požadavku. Zkouška ho neviděla, protože ve stránce
     nebyl.
     Vzorek se proto postaví tak, jak ho stránka opravdu skládá (karta →
     tlačítka), a měří se s ostatními. Není to podstrčený výsledek: měří
     se pravidla ze stylopisu té stránky, ne vymyšlené barvy — a aby bylo
     v případném nálezu na první pohled vidět, odkud je, nese prvek `id`
     se slovem „vzorek". */
  /* KOLIK TOHO BYLO. Změřeno 22. 10.: z 99 tříd ovládacích prvků, které
     šablony umí vyrobit, jich odhlášený nikdy neuvidí 33 — a hlídač je
     tedy nikdy neměřil. Devět dalších vysvětlily stránky, kam tahle
     zkouška vůbec nechodila. Ve vzorcích níž je to, co stojí za
     přihlášením; ve vzorku je vždycky JEN prvek, který se měří (odkazy
     `<a>` a odznaky `<span>` se do PRVKY nepočítají, takže postavit je
     sem by vypadalo, že se měří, a neměřilo by se nic). */
  const VZORKY_ZA_PRIHLASENIM = {
    'muj-inzerat.html': '<div class="mi-lcard"><div class="mi-lactions">'
      + '<button class="mi-lbtn danger" id="vzorek-smazat" type="button">Smazat</button>'
      /* `.mi-lbtn` bez přívlastku a `.mi-lbtn.primary` tu NEJSOU: stránka
         je skládá jako `<a>`, ne jako tlačítko (muj-inzerat.html, řádky
         s „Otevřít inzerát" a „Zobrazit na mapě"). Postavit je jako
         <button> by vyrobilo nález o vzorku, ne o webu — odkaz bez
         rámečku a bez výplně je z měření vyjmutý záměrně, protože tvar
         mu dělá text. */
      + '</div><button class="sv-del" id="vzorek-odebrat" type="button">Odebrat</button></div>',
    'hlidani.html': '<div class="hl-card">'
      + '<button class="hl-tab" id="vzorek-tab" type="button">Hlídaná místa</button>'
      + '<button class="hl-chip" id="vzorek-chip" type="button">elektřina</button>'
      + '<button class="hl-a" id="vzorek-a" type="button">Upravit</button>'
      + '<button class="hl-rychle" id="vzorek-rychle" type="button">Do 500 000 Kč</button>'
      + '<select class="hl-sel" id="vzorek-sel"><option>orná půda</option></select>'
      + '<button class="del" id="vzorek-del" type="button">Smazat</button></div>',
    'zpravy.html': '<div class="zp-card">'
      + '<textarea class="zp-ta" id="vzorek-ta">Dobrý den</textarea>'
      + '<button class="zp-send" id="vzorek-send" type="button">Odeslat</button>'
      + '<input class="zp-cb" id="vzorek-cb" type="checkbox"></div>',
  };
  if (VZORKY_ZA_PRIHLASENIM[s]) {
    await p.evaluate((html) => {
      const host = document.querySelector('main') || document.body;
      const obal = document.createElement('div');
      obal.innerHTML = html;
      host.appendChild(obal);
    }, VZORKY_ZA_PRIHLASENIM[s]);
    await p.waitForTimeout(100);
  }

  const data = await p.evaluate((sel) => {
    const rgb = (t) => { const m = /rgba?\(([^)]+)\)/.exec(t); if (!m) return null;
      const c = m[1].split(',').map(parseFloat); return { r: c[0], g: c[1], b: c[2], a: c.length > 3 ? c[3] : 1 }; };
    // Skutečné pozadí: první neprůhledný předek.
    const slozit = (vrch, spod) => ({
      r: vrch.r * vrch.a + spod.r * (1 - vrch.a),
      g: vrch.g * vrch.a + spod.g * (1 - vrch.a),
      b: vrch.b * vrch.a + spod.b * (1 - vrch.a),
    });
    // Barevný přechod na pozadí: vytáhneme z něj jednotlivé barvy a vezmeme
    // jejich průměr. Přesné to není (přechod je v každém bodě jiný), ale na
    // rozhodnutí „splývá / nesplývá" to stačí — a hlavně to nepodstrčí
    // světlou barvu tam, kde je ve skutečnosti tmavý pás.
    const zPrechodu = (img) => {
      if (!img || img === 'none') return null;
      if (!/gradient\(/.test(img)) return 'nevim';     // fotka nebo obrázek — neodhadneme
      const barvy = (img.match(/rgba?\([^)]+\)/g) || []).map(rgb).filter(Boolean);
      if (!barvy.length) return null;
      const n = barvy.length;
      return barvy.reduce((a2, c) => ({
        r: a2.r + c.r / n, g: a2.g + c.g / n, b: a2.b + c.b / n, a: a2.a + c.a / n,
      }), { r: 0, g: 0, b: 0, a: 0 });
    };
    const podklad = (el) => {
      let e = el.parentElement;
      while (e) {
        const c2 = getComputedStyle(e);
        const zakl = rgb(c2.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
        const pre = zPrechodu(c2.backgroundImage);
        if (pre === 'nevim') return null;               // radši nic než výmysl
        if (pre) {
          const spod2 = zakl.a >= 0.95 ? zakl : null;
          const v = spod2 ? slozit(pre, spod2) : pre;
          if ((pre.a >= 0.9) || spod2) return { r: v.r, g: v.g, b: v.b, a: 1 };
        }
        if (zakl.a >= 0.95) return zakl;
        e = e.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const ven = [];
    document.querySelectorAll(sel).forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 14) return;          // ikonky a drobnosti neřešíme
      const c = getComputedStyle(el);
      if (c.visibility === 'hidden' || c.display === 'none' || c.opacity === '0') return;
      const spod = podklad(el);
      if (!spod) { ven.push({ preskoceno: true }); return; }
      let vypln = rgb(c.backgroundColor) || { r: 0, g: 0, b: 0, a: 0 };
      // Přechod na pozadí prvku je taky výplň (barevné tlačítko se od okolí
      // odlišuje jím, ne čárou). Obrázek nebo ikonka v pozadí ne — to je
      // ozdoba, ne plocha.
      const preEl = zPrechodu(c.backgroundImage);
      if (preEl && preEl !== 'nevim') {
        const zaklad = vypln.a > 0 ? slozit(vypln, spod) : spod;
        vypln = { r: preEl.r * preEl.a + zaklad.r * (1 - preEl.a),
                  g: preEl.g * preEl.a + zaklad.g * (1 - preEl.a),
                  b: preEl.b * preEl.a + zaklad.b * (1 - preEl.a), a: 1 };
      }
      const bg = vypln.a > 0 ? slozit(vypln, spod) : spod;
      const okraj = rgb(c.borderTopColor);
      const sirka = parseFloat(c.borderTopWidth) || 0;
      /* Posuvník je výjimka, a záměrná: samotný <input type=range> je jen
         neviditelný překryv přes celou šířku, aby se dal chytit prstem.
         Vidět je z něj TÁHLO a DRÁHA, a ty kreslí pseudoprvky, na které
         se tudy nedá sáhnout. Měří se proto zvlášť, kousek níž — kdyby se
         to tady jen přeskočilo, bylo by to zametení pod koberec. */
      if (el.tagName.toLowerCase() === 'input' && el.type === 'range') return;
      const poleCi = /^(input|textarea|select)$/.test(el.tagName.toLowerCase());
      // Mimo hru zůstane jen tlačítko/odkaz bez rámečku i bez výplně — tvar
      // mu dělá text nebo ikonka a ty hlídá kontrast textu.
      /* PRŮHLEDNÝ RÁMEČEK JE TOTÉŽ CO ŽÁDNÝ. Do 30. 10. se tu četla jen
         ŠÍŘKA rámečku, takže `border:3px solid transparent` počítalo
         jako „rámeček má" — a prvek pak padl na tom, že ten rámeček
         není vidět. Je to logická díra, ne vlastnost jednoho prvku:
         průhledná linka není vidět nikdy, ať je široká kolik chce.
         Vyplavalo to na vypnuté polovině přepínače Seznam/Mapa, která
         průhledným rámečkem jen odsazuje svou plochu od dráhy
         (`background-clip:padding-box`); tvar jí dělá dráha kolem
         a zapnutá polovina vedle, přesně jako text dělá tvar tlačítku
         bez rámečku. */
      const maPrechod = /gradient\(/.test(c.backgroundImage || '');
      const okrajVidet = sirka > 0 && okraj && okraj.a >= 0.05;
      if (!poleCi && !okrajVidet && vypln.a < 0.05 && !maPrechod) return;
      ven.push({
        popis: el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : ''),
        bg: [bg.r, bg.g, bg.b],
        podklad: [spod.r, spod.g, spod.b],
        okraj: okraj && sirka > 0 ? [okraj.r * okraj.a + bg.r * (1 - okraj.a), okraj.g * okraj.a + bg.g * (1 - okraj.a), okraj.b * okraj.a + bg.b * (1 - okraj.a)] : null,
        stin: c.boxShadow && c.boxShadow !== 'none',
      });
    });
    return ven;
  }, PRVKY);

  for (const d of data) {
    if (d.preskoceno) { preskoceno++; continue; }
    zmereno++;
    // Prvek se může odlišovat vlastní výplní — pak čáru nepotřebuje.
    if (pomer(d.bg, d.podklad) >= MIN) continue;
    // Nebo okrajem.
    if (d.okraj && pomer(d.okraj, d.bg) >= MIN) continue;
    // Stín sám o sobě neměříme, ale uznáváme ho jako záměrné odlišení.
    if (d.stin && !d.okraj) continue;
    nalezy.push({ stranka: `${s} (${profil.jmeno})`, prvek: d.popis,
      vypln: pomer(d.bg, d.podklad).toFixed(2),
      cara: d.okraj ? pomer(d.okraj, d.bg).toFixed(2) : 'žádná' });
  }
  await p.close();
}
await ctx.close();
}

/* --- Výběr ceny a výměry zvlášť: sloupce histogramu -------------------
 *
 * SLOUPCOVÝ GRAF V OKNĚ ROZSAHU TU BYL MĚŘENÝ ZVLÁŠŤ a od 29. 10. není
 * co měřit: majitel ho nechal zrušit („ten graf nad tím dej pryč a nech
 * tam jen to nastavení ceny"). Měřilo se na něm, že vybrané sloupce jsou
 * poznat od nevybraných a že se neliší jen barvou (WCAG 1.4.1) —
 * obyčejná kontrola okrajů to nezachytila, protože tlačítko sloupce
 * nemá ani rámeček, ani výplň; měl je až proužek uvnitř.
 * V okně zůstala políčka od–do, a ta už tahle zkouška měří jako každý
 * jiný ovladač: mají rámeček a stojí na ploše.
 * ------------------------------------------------------------------ */

await prohlizec.close();

console.log(`\nViditelnost okrajů (WCAG 1.4.11, práh ${MIN}:1) — změřeno ${zmereno} prvků`
  + (preskoceno ? `, ${preskoceno} přeskočeno (leží na barevném přechodu)` : ''));
if (!nalezy.length) {
  console.log('Každý ovládací prvek je od svého pozadí odlišený.');
  process.exit(0);
}
const videno = new Set();
nalezy.forEach((n) => {
  const k = n.stranka + '|' + n.prvek;
  if (videno.has(k)) return;
  videno.add(k);
  console.log(`  ✕ ${n.stranka}  ${n.prvek}\n      výplň proti pozadí ${n.vypln}:1, okraj proti výplni ${n.cara}:1`);
});
console.log(`\n${videno.size} prvků splývá s pozadím.`);
process.exit(1);
