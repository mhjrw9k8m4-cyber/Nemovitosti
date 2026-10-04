// Test: lišta s cenou a akcí u spodního okraje detailu.
//
// Spuštění: node scripts/test-lista.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Proč vznikla: naměřeno na telefonu 390×844, že stránka detailu je
// 3 106 px dlouhá (3,7 obrazovky), cena stojí 542 px od začátku a hlavní
// tlačítka až 1 990 px — tedy 2,4 obrazovky. Pro první dvě a půl
// obrazovky čtení tak na obrazovce nebyla ani cena, ani čím jednat.
//
// Lišta ale nesmí překážet. Hlídají se proto obě strany pravidla:
//   • dokud je vidět cena, lišta je pryč,
//   • jakmile jsou vidět skutečná tlačítka, lišta je zase pryč
//     (jinak by na obrazovce stála dvě stejná a nebylo by jasné které),
//   • mezi tím je vidět, drží u spodního okraje a dá se na ni klepnout.
//
// A hlavně: popisek i odkaz se BEROU Z EXISTUJÍCÍHO TLAČÍTKA. Kdyby se
// opisovaly, rozejdou se — přesně tak se kdysi rozešly dvě kopie výpočtu
// snímku a dvě kopie barev kategorií.
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKA = '/pozemek-benesov-benesov-1sjtz7b.html';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  hasTouch: true, isMobile: true });
/* Cizí hosty (dlaždice, Supabase) sandbox blokuje a čeká se na timeout.
   Na lištu nemají vliv, tak se rovnou zahodí. */
await ctx.route('**/*', (r) => /^(http:\/\/127\.0\.0\.1|http:\/\/localhost|data:|blob:)/
  .test(r.request().url()) ? r.continue() : r.abort());
const p = await ctx.newPage();
await p.goto(BASE + STRANKA, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
await p.waitForTimeout(2800);

/* Po skoku v rolování doběhne IntersectionObserver až za chvíli; při
   600 ms jsem ho jednou přistihl před doběhnutím a vyšlo z toho, že
   lišta „nefunguje". Odsud ta rezerva. */
async function naY(y) {
  await p.evaluate((yy) => window.scrollTo(0, yy), y);
  await p.waitForTimeout(900);
  return p.evaluate(() => {
    const l = document.querySelector('.pz-lista');
    const a = l && l.querySelector('a');
    const vid = (s) => { const e = document.querySelector(s); if (!e) return null;
      const b = e.getBoundingClientRect(); return b.bottom > 0 && b.top < innerHeight; };
    const b = l && !l.hidden ? l.getBoundingClientRect() : null;
    return { je: !!l, skryta: l ? l.hidden : null,
      uOkraje: b ? Math.round(innerHeight - b.bottom) : null,
      terc: a && !l.hidden ? Math.round(a.getBoundingClientRect().height) : null,
      vidimCenu: vid('.pz-price'), vidimTlacitka: vid('.pz-cta') };
  });
}

// --- Předpoklady: bez nich zkoušky níž neměří nic --------------------
const rozmery = await p.evaluate(() => {
  const y = (s) => { const e = document.querySelector(s); if (!e) return null;
    const b = e.getBoundingClientRect(); return Math.round(b.top + scrollY); };
  return { delka: Math.round(document.documentElement.scrollHeight), okno: innerHeight,
    cena: y('.pz-price'), cta: y('.pz-cta') };
});
pravda('stránka detailu je na telefonu delší než dvě obrazovky',
  rozmery.delka > rozmery.okno * 2, `délka ${rozmery.delka} px, okno ${rozmery.okno} px`);
pravda('cena i hlavní tlačítka na stránce jsou',
  rozmery.cena != null && rozmery.cta != null, JSON.stringify(rozmery));
pravda('a tlačítka leží hluboko pod prvním pohledem (jinak lištu netřeba)',
  rozmery.cta > rozmery.okno, `tlačítka ${rozmery.cta} px od začátku, okno ${rozmery.okno} px`);

// --- Pravidlo ---------------------------------------------------------
const nahore = await naY(0);
pravda('lišta na stránce existuje', nahore.je, 'prvek .pz-lista nenalezen');
pravda('nahoře, kde je vidět cena, je lišta pryč',
  nahore.skryta === true, `cena vidět: ${nahore.vidimCenu}, lišta skrytá: ${nahore.skryta}`);

const uprostred = await naY(900);
pravda('uprostřed čtení, kde není vidět ani cena ani tlačítka, je lišta vidět',
  uprostred.skryta === false,
  `cena ${uprostred.vidimCenu}, tlačítka ${uprostred.vidimTlacitka}, skrytá ${uprostred.skryta}`);
pravda('a drží u spodního okraje okna', uprostred.uOkraje === 0,
  `od spodního okraje ${uprostred.uOkraje} px`);
pravda('tlačítko na liště má terč aspoň 44 px', (uprostred.terc || 0) >= 44,
  `terč ${uprostred.terc} px`);

const uTlacitek = await naY(rozmery.cta - 300);
pravda('u skutečných tlačítek lišta zase zmizí (ať nestojí dvě stejná)',
  uTlacitek.vidimTlacitka === true && uTlacitek.skryta === true,
  `tlačítka vidět ${uTlacitek.vidimTlacitka}, lišta skrytá ${uTlacitek.skryta}`);

const dole = await naY(999999);
pravda('v patičce, kde tlačítka už nejsou vidět, je lišta zase vidět',
  dole.vidimTlacitka === false && dole.skryta === false,
  `tlačítka vidět ${dole.vidimTlacitka}, lišta skrytá ${dole.skryta}`);

// --- Popisek i odkaz pocházejí z existujícího tlačítka ---------------
await naY(900);
const shoda = await p.evaluate(() => {
  const a = document.querySelector('.pz-lista a');
  const t = document.querySelector('.pz-cta .pz-btn.primary') || document.querySelector('.pz-cta .pz-btn');
  const cisty = (e) => { const k = e.cloneNode(true);
    k.querySelectorAll('.visually-hidden').forEach((x) => x.remove());
    return (k.textContent || '').replace(/\s+/g, ' ').trim(); };
  return { odkazLista: a.getAttribute('href'), odkazTlacitko: t.getAttribute('href'),
    textLista: cisty(a), textTlacitko: cisty(t),
    cenaLista: document.querySelector('.pzl-cena').textContent.trim(),
    cenaStranka: (document.querySelector('.pz-price .pv') || {}).textContent };
});
pravda('odkaz na liště je týž jako na hlavním tlačítku',
  shoda.odkazLista === shoda.odkazTlacitko,
  `lišta „${shoda.odkazLista}", tlačítko „${shoda.odkazTlacitko}"`);
pravda('a popisek taky', shoda.textLista === shoda.textTlacitko,
  `lišta „${shoda.textLista}", tlačítko „${shoda.textTlacitko}"`);
pravda('do popisku se nedostala věta určená jen pro odečítač obrazovky',
  !/otevře se v novém okně/.test(shoda.textLista), `popisek „${shoda.textLista}"`);
pravda('na liště stojí hlavní cena, ne slepenec s cenou za metr',
  shoda.cenaLista === (shoda.cenaStranka || '').trim() && !/m²/.test(shoda.cenaLista),
  `lišta „${shoda.cenaLista}", stránka „${shoda.cenaStranka}"`);

// --- A dá se na ni opravdu klepnout ----------------------------------
await p.evaluate(() => { const a = document.querySelector('.pz-lista a');
  a.addEventListener('click', function (e) { e.preventDefault(); window.__klik = a.href; }, { once: true }); });
let klepnuto = true;
try { await p.click('.pz-lista a', { timeout: 5000 }); } catch (e) { klepnuto = false; }
const cil = await p.evaluate(() => window.__klik || null);
pravda('a dá se na ni klepnout (nic ji nepřekrývá)', klepnuto && !!cil,
  klepnuto ? 'klepnutí prošlo, ale odkaz se nespustil' : 'klepnutí se vůbec nepodařilo');

// --- Na stole lišta nepřekáží ----------------------------------------
await p.setViewportSize({ width: 1280, height: 900 });
await p.waitForTimeout(600);
await p.evaluate(() => window.scrollTo(0, 900));
await p.waitForTimeout(700);
const stul = await p.evaluate(() => {
  const l = document.querySelector('.pz-lista');
  return { skryta: l.hidden, display: getComputedStyle(l).display };
});
pravda('na široké obrazovce se lišta nekreslí (tam tlačítka stojí v obsahu)',
  stul.display === 'none', `display ${stul.display}, hidden ${stul.skryta}`);

await ctx.close();
await prohlizec.close();
console.log('\nLišta s cenou a akcí na detailu');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: stránka ${rozmery.delka} px na okně ${rozmery.okno} px, `
  + `cena v ${rozmery.cena} px, tlačítka v ${rozmery.cta} px`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Lišta: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
