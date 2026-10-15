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
  const ctx = await prohlizec.newContext({ serviceWorkers: 'block', viewport: { width: sirka, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
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
    return { hint: stred('#kraj-hint'), tool: stred('.map-nastroj'), mapa: { x: 195, y: Math.round(cv.top + 220) } };
  });
  je('měřené prvky mapy nejsou schované za lepivou hlavičkou',
    [body.hint.podHlavickou, body.tool.podHlavickou], [true, true]);

  /* TADY SE MĚŘILO ZATMAVENÍ POD VYSOUVACÍM DETAILEM — tedy jestli leží
     nad ovládáním mapy, aby tlačítka neplavala nad otevřeným panelem.
     Panel je pryč: nikdy se neotevřel (funkce, která ho plnila, měla
     v js/main.js jedinou zmínku — vlastní deklaraci), takže zkouška si
     ho musela do stránky vyrobit sama a měřila vrstvení něčeho, co na
     webu nebylo. Zbyla kontrola nad ní: že měřené prvky mapy nejsou
     schované za lepivou hlavičkou. Kdyby panel nad mapou někdy vznikl
     znovu, patří to měření zpátky. */
  await ctx.close();
}

/* ---------- 2. vysouvací nabídka leží nad vším ----------
   Nabídka byla postupně panel pod křížkem, spodní lišta, vodorovný pás
   odkazů v hlavičce a teď je to zase vysouvací panel (na přání
   majitele; proč, stojí v css/styles.css u .nav-burger). Otázka se tím
   vrátila k té původní: leží otevřený panel opravdu NAD obsahem, nebo
   se do něj něco plovoucího promítá? Pás se měřil jinak — že drží
   v hlavičce — a to už tu není co měřit. */
{
  const ctx = await stranka(390, true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pozemky-okres-tabor.html`);
  await p.waitForTimeout(1500);
  /* Zavřený panel je mimo obrazovku, takže by se měřilo prázdno. */
  await p.click('.nav-burger');
  await p.waitForTimeout(500);

  const stav = await p.evaluate(() => {
    const nav = document.querySelector('#nav');
    const h = document.querySelector('header');
    const r = nav.getBoundingClientRect(), hr = h.getBoundingClientRect();
    const bod = (x, y) => { const el = document.elementFromPoint(x, y); return el ? (el.closest('#nav') ? 'pás' : (el.className || el.tagName) + '') : 'nic'; };
    const st = getComputedStyle(h);
    const kryje = st.backgroundColor.indexOf('rgba') < 0 ||
      parseFloat((st.backgroundColor.match(/([\d.]+)\)$/) || [0, '0'])[1]) >= 0.8 ||
      (st.backdropFilter && st.backdropFilter !== 'none');
    return {
      vHlavicce: !!nav.closest('header'),
      uvnitr: Math.round(r.bottom) <= Math.round(hr.bottom) + 1,
      nahoreVlevo: bod(Math.round(r.x + 20), Math.round(r.y + r.height / 2)),
      pozadiKryje: !!kryje
    };
  });
  je('nabídka je v hlavičce (otevírá se z ní)', stav.vHlavicce, true);
  /* Panel je position:fixed přes celou výšku okna, takže „nevyčuhuje
     pod hlavičku" by u něj znamenalo pravý opak toho, co má dělat. */
  je('nahoře na otevřeném panelu je opravdu panel', stav.nahoreVlevo, 'pás');
  je('a hlavička pod ním kryje obsah stránky', stav.pozadiKryje, true);

  /* IKONA PATŘÍ ODDÍLU, NE KAŽDÉMU ŘÁDKU.
     Tahle kontrola hlídala „každý odkaz má ikonu" a byla správně, dokud
     byl šuplík plochý seznam: prázdné místo před textem tam vypadalo
     jako chyba. Od přestavby podle velkých realitních webů (14. 10.) má
     šuplík ČTYŘI ODDÍLY (Pozemky, Příležitosti, Rádce, Můj profil)
     a ikonu nese nadpis oddílu — čtrnáct ikon pod sebou dělalo z krátké
     nabídky vánoční stromek a nedalo se v ní nic najít. Hlídá se proto
     totéž, co ta kontrola chtěla (nabídka se pozná tvarem, ne jen
     textem), jen na správné úrovni: každý oddíl má ikonu. */
  const ikony = await p.evaluate(() => {
    const bezIkony = [];
    document.querySelectorAll('#nav .nav-sk > summary').forEach((h) => {
      if (!h.getClientRects().length) return;
      if (getComputedStyle(h, '::before').backgroundImage === 'none') {
        bezIkony.push((h.textContent || '').trim());
      }
    });
    return { bezIkony, oddilu: document.querySelectorAll('#nav .nav-sk > summary').length };
  });
  je('žádný oddíl nabídky není bez ikony', ikony.bezIkony, []);
  /* A ať se nestane, že oddíly zmizí a kontrola projde na prázdnu. */
  je('oddíly nabídky se vůbec našly', ikony.oddilu >= 3, true);
  await ctx.close();
}

/* ---------- 3. nic nevyskakuje ----------
   Dřív se tu měřila vyskakovací hláška „Přibylo N nových pozemků" —
   ta je pryč (majitel webu ji odmítl: vyskakovala přes obsah uprostřed
   čtení). Pak tu byl odznak novinek v hlavičce a měřilo se, že ho nic
   nepřekryje; ten šel s odebranými Upozorněními. Zbývá kontrola, že
   se vyskakovací hláška nevrátila zadními vrátky. */
{
  const ctx = await stranka(390, true);
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pozemky-okres-tabor.html`);
  await p.waitForTimeout(2500);
  je('žádná vyskakovací hláška se neukáže', await p.locator('.upo-toast').count(), 0);
  await ctx.close();
}

console.log('\nVrstvení: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
await prohlizec.close();
if (chyb) { console.error(`\n${chyb} NEPROŠLO.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
