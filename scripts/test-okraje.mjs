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
import { decode as dekodujJpeg } from 'jpeg-js';

const STRANKY = ['index.html', 'pridat.html', 'hlidani.html', 'upozorneni.html', 'zpravy.html', 'muj-inzerat.html', 'kontakt.html'];
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
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 900 } });
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.protocol === 'file:' || u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  return r.abort();
});

const nalezy = [];
let zmereno = 0, preskoceno = 0;

for (const s of STRANKY) {
  const p = await ctx.newPage();
  await p.goto('file://' + process.cwd() + '/' + s, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(500);
  // Prvky schované v rozbalovacích blocích jsou taky prvky — otevřeme je.
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
  await p.waitForTimeout(250);

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
      const maPrechod = /gradient\(/.test(c.backgroundImage || '');
      if (!poleCi && sirka === 0 && vypln.a < 0.05 && !maPrechod) return;
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
    nalezy.push({ stranka: s, prvek: d.popis,
      vypln: pomer(d.bg, d.podklad).toFixed(2),
      cara: d.okraj ? pomer(d.okraj, d.bg).toFixed(2) : 'žádná' });
  }
  await p.close();
}

/* --- Posuvník zvlášť: dráha, vybraný úsek a táhlo ---------------------
 *
 * U posuvníku není vidět sám prvek, ale jeho části: <input type=range> je
 * neviditelný překryv přes celou šířku, aby se dal chytit prstem, a dráhu
 * i táhlo kreslí pseudoprvky. Výš se proto přeskakuje — a tady se měří to,
 * co je doopravdy vidět.
 *
 * Měří se dvě věci, a ne tři: TÁHLO proti panelu (podle něj se pozná, že
 * tu vůbec nějaký posuvník je) a VYBRANÝ ÚSEK proti zbytku dráhy (podle
 * toho se pozná, co je nastavené). Samotná dráha se schválně neměří:
 * nejde ji udělat tmavou proti panelu A ZÁROVEŇ světlou proti zelenému
 * vybranému úseku — zelená leží někde uprostřed, takže co pomůže jednomu,
 * uškodí druhému (spočítáno pro devět odstínů, žádný nesplní obojí).
 * Dráha je jen náznak, kudy se dá táhnout; ovládací prvek i jeho stav jsou
 * čitelné z táhla a z vybraného úseku. */
const posuvnikNalezy = [];
{
  const p = await ctx.newPage();
  await p.goto('file://' + process.cwd() + '/index.html', { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(700);
  await p.evaluate(() => { document.querySelectorAll('details').forEach((d) => { d.open = true; }); });
  await p.waitForTimeout(250);
  const v = await p.evaluate(() => {
    const rgb = (t) => { const m = /rgba?\(([^)]+)\)/.exec(t || ''); if (!m) return null;
      const c = m[1].split(',').map(parseFloat); return { r: c[0], g: c[1], b: c[2], a: c.length > 3 ? c[3] : 1 }; };
    const slozit = (v2, s2) => ({ r: v2.r * v2.a + s2.r * (1 - v2.a), g: v2.g * v2.a + s2.g * (1 - v2.a), b: v2.b * v2.a + s2.b * (1 - v2.a) });
    const podklad = (el) => {
      let n = el;
      while (n && n !== document.documentElement) {
        const c = rgb(getComputedStyle(n).backgroundColor);
        if (c && c.a > 0.95) return c;
        n = n.parentElement;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    };
    const draha = document.querySelector('.mcp-draha');
    if (!draha) return null;
    const pod = podklad(draha);
    const cara = slozit(rgb(getComputedStyle(draha, '::before').backgroundColor) || { r: 0, g: 0, b: 0, a: 0 }, pod);
    const vybr = slozit(rgb(getComputedStyle(document.querySelector('.mcp-vybrano')).backgroundColor) || { r: 0, g: 0, b: 0, a: 0 }, pod);
    return { pod: [pod.r, pod.g, pod.b], cara: [cara.r, cara.g, cara.b], vybrano: [vybr.r, vybr.g, vybr.b] };
  });
  if (!v) posuvnikNalezy.push('posuvník ceny se na stránce vůbec nenašel');
  else {
    if (pomer(v.vybrano, v.cara) < MIN) posuvnikNalezy.push(`vybraný úsek splývá se zbytkem dráhy (${pomer(v.vybrano, v.cara).toFixed(2)}:1)`);
    /* Táhlo kreslí ::-webkit-slider-thumb a ten se přes getComputedStyle
       přečíst nedá — prohlížeč ho nevydá. Měří se proto ze SKUTEČNÉHO
       snímku: v místě, kde táhlo stojí, musí být pixely dost odlišné od
       panelu. Je to poctivější než číst deklaraci v CSS, protože to
       dokazuje, že je táhlo opravdu vidět, ne jen napsané. */
    const snimek = await p.locator('.mcp-draha').first().screenshot({ type: 'jpeg', quality: 100 });
    const obr = dekodujJpeg(snimek, { useTArray: true });
    /* Počítají se JEN pruhy nad a pod čárou dráhy. Kdyby se braly všechny
       pixely, prošlo by to i s neviditelným táhlem — odlišná od panelu je
       totiž i sama dráha a vybraný úsek. (Právě na tom mi sabotáž ukázala,
       že první podoba téhle kontroly nic nehlídá.) */
    const caraOd = Math.round(obr.height * 0.40), caraDo = Math.round(obr.height * 0.62);
    let odlisnych = 0, zkoumanych = 0;
    for (let y = 0; y < obr.height; y++) {
      if (y >= caraOd && y <= caraDo) continue;
      for (let x = 0; x < obr.width; x++) {
        const i = (y * obr.width + x) * 4;
        zkoumanych++;
        if (pomer([obr.data[i], obr.data[i + 1], obr.data[i + 2]], v.pod) >= MIN) odlisnych++;
      }
    }
    const podil = zkoumanych ? odlisnych / zkoumanych : 0;
    if (podil < 0.01) posuvnikNalezy.push(`na dráze není vidět žádné táhlo (jen ${(podil * 100).toFixed(2)} % pixelů mimo čáru se liší od panelu)`);
    zmereno += 2;
  }
  await p.close();
}

await prohlizec.close();

console.log(`\nViditelnost okrajů (WCAG 1.4.11, práh ${MIN}:1) — změřeno ${zmereno} prvků`
  + (preskoceno ? `, ${preskoceno} přeskočeno (leží na barevném přechodu)` : ''));
if (posuvnikNalezy.length) {
  posuvnikNalezy.forEach((t) => console.log('  ✕ posuvník: ' + t));
}
if (!nalezy.length && !posuvnikNalezy.length) {
  console.log('Každý ovládací prvek je od svého pozadí odlišený.');
  process.exit(0);
}
if (!nalezy.length) { console.log(`\n${posuvnikNalezy.length} částí posuvníku splývá.`); process.exit(1); }
const videno = new Set();
nalezy.forEach((n) => {
  const k = n.stranka + '|' + n.prvek;
  if (videno.has(k)) return;
  videno.add(k);
  console.log(`  ✕ ${n.stranka}  ${n.prvek}\n      výplň proti pozadí ${n.vypln}:1, okraj proti výplni ${n.cara}:1`);
});
console.log(`\n${videno.size} prvků splývá s pozadím.`);
process.exit(1);
