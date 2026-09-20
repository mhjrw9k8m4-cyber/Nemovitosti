// Test vrstvení — co je nad čím.
//
// Spuštění: node scripts/test-vrstveni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Vrstvení je nejzrádnější druh chyby: v kódu vypadá všechno v pořádku,
// protože se každé pravidlo čte zvlášť. Rozbije se to až tím, JAK se
// pravidla potkají — a pozná se to jen okem, nebo tímhle testem.
//
// Pozor na past, na kterou jsem sám naletěl: hlavička je lepivá (sticky)
// a překrývá horních ~66 px. Když se měří bod, který pod ni spadne, měří
// se hlavička, ne to, co je pod ní. Proto se všechno nejdřív odroluje tak,
// aby měřené prvky byly prokazatelně pod hlavičkou.
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function stranka(sirka, prihlasit) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: 900 } });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (prihlasit) await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111' } }));
  });
  return ctx;
}

/* ---------- 1. mapa: detail pozemku musí překrýt i ovládání mapy ---------- */
{
  const ctx = await stranka(390, false);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`);
  await p.waitForTimeout(2200);
  // Úvodní stránka se na mobilu otevře na SEZNAMU a mapa je za přepínačem —
  // bez přepnutí by se měřil skrytý prvek (rect samé nuly).
  {
    const t = await p.$('.mv-toggle .mvt-btn[data-mv="mapa"]');
    if (t && await t.isVisible()) { await t.click(); await p.waitForTimeout(700); }
  }
  // odrolovat tak, aby horní okraj mapy byl jasně pod hlavičkou
  await p.evaluate(() => {
    const h = document.querySelector('.map-holder');
    window.scrollTo(0, h.getBoundingClientRect().top + window.scrollY - 160);
  });
  await p.waitForTimeout(400);

  const body = await p.evaluate(() => {
    const dno = document.querySelector('header').getBoundingClientRect().bottom;
    const stred = (s) => { const r = document.querySelector(s).getBoundingClientRect();
      return { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2), podHlavickou: r.top > dno }; };
    const cv = document.querySelector('.map-canvas').getBoundingClientRect();
    return { hint: stred('#kraj-hint'), tool: stred('.map-reset'), mapa: { x: 195, y: Math.round(cv.top + 220) } };
  });
  je('měřené prvky mapy nejsou schované za lepivou hlavičkou',
    [body.hint.podHlavickou, body.tool.podHlavickou], [true, true]);

  const jas = async (b) => p.evaluate(({ x, y }) => {
    // Jas se čte z prvku, který je v daném bodě nahoře — nepřímé, ale stačí:
    // porovnáváme TENTÝŽ bod před a po, takže rozdíl dělá jen zatmavení.
    const el = document.elementFromPoint(x, y);
    return el ? el.tagName + '|' + (el.className || '') : 'nic';
  }, b);

  const predHint = await jas(body.hint);
  await p.evaluate(() => {
    const d = document.querySelector('.map-detail'), h = document.querySelector('.map-holder');
    d.hidden = false; d.classList.add('show');
    d.innerHTML = '<div style="padding:16px">detail</div>';
    h.classList.add('detail-open');
  });
  await p.waitForTimeout(700);

  // Zatmavení musí ležet NAD ovládáním mapy, jinak by tlačítka plavala nad
  // otevřeným detailem a vypadalo by to jako chyba vrstvení.
  const nahore = await p.evaluate(() => {
    const dno = document.querySelector('header').getBoundingClientRect().bottom;
    const r = document.querySelector('#kraj-hint').getBoundingClientRect();
    if (r.top <= dno) return 'ZA HLAVIČKOU';
    const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    // ::after se z elementFromPoint nevrací, vrátí se jeho nositel
    return el ? (el.className || el.tagName) + '' : 'nic';
  });
  je('nad ovládáním mapy leží zatmavení detailu, ne ovládání samo',
    /map-holder|detail-open/.test(nahore), true);
  je('kontrolní bod se nezměnil v nesmysl', predHint !== 'nic', true);
  await ctx.close();
}

/* ---------- 2. mobilní menu ---------- */
{
  const ctx = await stranka(390, true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pozemky-okres-tabor.html`);
  await p.waitForTimeout(1200);
  await p.click('.nav-toggle');
  await p.waitForTimeout(500);

  const stav = await p.evaluate(() => {
    const nav = document.querySelector('#nav');
    const r = nav.getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2));
    const hlavicka = document.querySelector('header').getBoundingClientRect();
    return {
      nahore: el ? (el.closest('#nav') ? 'menu' : (el.className || el.tagName) + '') : 'nic',
      menuZacinaPodHlavickou: Math.round(r.top) >= Math.round(hlavicka.bottom) - 2,
      // Neprůhlednost se nedá číst jen z backgroundColor: menu má přechod,
      // takže barva je průhledná a kryje až obrázek. Bereme obojí a
      // hlídáme, že ani jedna zarážka není průsvitná.
      pozadiNepruhledne: (() => {
        const st = getComputedStyle(nav);
        const barvaKryje = st.backgroundColor.indexOf('rgba') < 0 &&
                           st.backgroundColor !== 'transparent';
        if (barvaKryje) return true;
        const obr = st.backgroundImage;
        if (!obr || obr === 'none') return false;
        const zarazky = obr.match(/rgba?\([^)]+\)/g) || [];
        if (!zarazky.length) return false;
        return zarazky.every((z) => {
          const c = z.replace(/rgba?\(|\)/g, '').split(',').map(parseFloat);
          return c.length < 4 || c[3] >= 0.99;
        });
      })()
    };
  });
  je('otevřené menu je nahoře', stav.nahore, 'menu');
  je('menu začíná pod hlavičkou, ne přes ni', stav.menuZacinaPodHlavickou, true);
  je('menu je neprůhledné — obsah stránky skrz něj neprosvítá', stav.pozadiNepruhledne, true);

  // Oddělovače skupin: rovná linka, ne zaoblená hrana karty. Zakřivený
  // konec se četl jako horní hrana plovoucí karty a budil dojem, že se
  // v menu něco špatně vrství.
  const oddelovace = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#nav a').forEach((a) => {
      const s = getComputedStyle(a);
      // Jen to, co je opravdu vidět. „Přidat pozemek" je v menu na mobilu
      // skryté, ale rámeček mít nepřestane — počítat ho jako oddělovač by
      // byla chyba měření, ne nález.
      if (a.getBoundingClientRect().height === 0) return;
      if (parseFloat(s.borderTopWidth) > 0) out.push({
        kam: a.getAttribute('href'),
        rohy: [s.borderTopLeftRadius, s.borderTopRightRadius]
      });
    });
    return out;
  });
  je('oddělovače jsou dva', oddelovace.length, 2);
  je('první oddělovač odděluje osobní stránky', oddelovace[0] && oddelovace[0].kam, 'upozorneni.html');
  je('oddělovače nejsou zaoblené',
    oddelovace.every((o) => o.rohy.every((r) => parseFloat(r) === 0)), true);

  // Každá položka menu musí mít ikonu — prázdné místo vypadá jako chyba.
  const bezIkony = await p.evaluate(() => {
    const out = [];
    document.querySelectorAll('#nav a:not(.btn-primary)').forEach((a) => {
      if (getComputedStyle(a, '::before').backgroundImage === 'none') out.push(a.getAttribute('href'));
    });
    return out;
  });
  je('žádná položka menu není bez ikony', bezIkony, []);
  await ctx.close();
}

/* ---------- 3. vyskakovací upozornění nad vším ostatním ---------- */
{
  const ctx = await stranka(390, true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pozemky-okres-tabor.html`);
  await p.waitForTimeout(1500);
  await p.evaluate(() => {
    sessionStorage.setItem('pk_upozorneni_znamo_v1', '0');
    sessionStorage.removeItem('pk_upozorneni_v1');
  });
  await p.reload();
  await p.waitForSelector('.upo-toast.show', { timeout: 15000 });
  await p.click('.nav-toggle');            // otevřeme i menu, ať se potkají
  await p.waitForTimeout(400);
  const nahore = await p.evaluate(() => {
    const r = document.querySelector('.upo-toast').getBoundingClientRect();
    const el = document.elementFromPoint(Math.round(r.x + r.width / 2), Math.round(r.y + 20));
    return el ? (el.closest('.upo-toast') ? 'toast' : (el.className || el.tagName) + '') : 'nic';
  });
  je('vyskakovací upozornění zůstane nahoře i při otevřeném menu', nahore, 'toast');
  await ctx.close();
}

console.log('\nVrstvení: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
await prohlizec.close();
if (chyb) { console.error(`\n${chyb} NEPROŠLO.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
