// Test: patička drží tvar — na počítači i na telefonu.
//
// Spuštění: node scripts/test-paticka.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Patička působila „slitě" a stály za tím tři samostatné příčiny, ani jedna
// vidět v kódu na první pohled:
//
// 1) Pravidlo „footer .wrap" (zbytek po staré jednořádkové patičce) je silnější
//    než „.foot-grid", takže se mřížka nikdy nevykreslila jako mřížka. Sloupce
//    se jen vystředily vedle sebe a nadpisy byly každý jinde vysoko.
// 2) Odkazy měly na telefonu „display:inline-block" kvůli ploše k trefení —
//    tím ale přestaly být řádky a slily se do odstavce: „MapaCeny pozemků".
// 3) Na úzkých telefonech přepisovala „.wrap{padding:0 20px}" zkratkou i svislé
//    odsazení, které si patička nese. Dělicí čára pak ležela natěsno na
//    posledním odkazu.
//
// Žádnou z nich by nechytil test chyb skriptů ani kontrastu — patička dál
// fungovala, jen vypadala, že ji nikdo nedodělal. Proto se tu měří rozvržení.
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Úvod má patičku s mapou nad sebou, textová stránka bez ní — obě ji sdílejí.
const STRANKY = ['index.html', 'cena-pozemku.html'];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/** Změří patičku na jedné stránce v jedné šířce. */
async function zmer(stranka, sirka) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: 900 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.waitForTimeout(700);
  const v = await p.evaluate(() => {
    const g = document.querySelector('.foot-grid');
    const fb = document.querySelector('.foot-bottom');
    const cs = getComputedStyle(g);
    // Nadpisy sloupců: seskupíme je po řádcích podle svislé polohy.
    const hlavicky = [...document.querySelectorAll('.foot-col h5')]
      .map((h) => Math.round(h.getBoundingClientRect().top));
    const radky = {};
    hlavicky.forEach((y) => { radky[y] = (radky[y] || 0) + 1; });
    // Odkazy v jednom sloupci: každý musí být na svém řádku.
    const sloupec = document.querySelector('.foot-col');
    const odkazy = [...sloupec.querySelectorAll('a')].map((a) => {
      const r = a.getBoundingClientRect();
      return { text: a.textContent.trim(), top: Math.round(r.top), vyska: Math.round(r.height) };
    });
    const naStejnemRadku = odkazy.filter((a, i) => i > 0 && Math.abs(a.top - odkazy[i - 1].top) < 4);
    const t = document.getElementById('to-top');
    const posl = fb.lastElementChild.getBoundingClientRect();
    const tr = t ? t.getBoundingClientRect() : null;
    return {
      mrizka: cs.display,
      pocetSloupcu: cs.gridTemplateColumns.split(' ').filter(Boolean).length,
      radkyNadpisu: Object.values(radky),
      odkazy, naStejnemRadku,
      odstupPodMrizkou: Math.round(fb.getBoundingClientRect().top - g.getBoundingClientRect().bottom)
        + parseFloat(cs.paddingBottom) + parseFloat(getComputedStyle(fb).paddingTop),
      cara: cs.borderBottomWidth,
      nahoruVidno: !!(t && t.classList.contains('show')),
      nahoruPrekryva: !!(t && t.classList.contains('show') && tr.left < posl.right
        && tr.top < posl.bottom && tr.bottom > posl.top),
    };
  });
  await ctx.close();
  return v;
}

for (const s of STRANKY) {
  // --- Počítač ---
  const pc = await zmer(s, 1280);
  pravda(`${s} — patička je na počítači opravdu mřížka`, pc.mrizka === 'grid',
    `vyšlo display:${pc.mrizka} — staré pravidlo „footer .wrap" ji přebíjí`);
  pravda(`${s} — všech pět sloupců vedle sebe`, pc.pocetSloupcu === 5,
    `sloupců ${pc.pocetSloupcu}`);
  pravda(`${s} — nadpisy sloupců jsou na jedné lince`, pc.radkyNadpisu.length === 1,
    `nadpisy v ${pc.radkyNadpisu.length} různých výškách: ${JSON.stringify(pc.radkyNadpisu)}`);

  // --- Telefon ---
  const mob = await zmer(s, 390);
  pravda(`${s} — na telefonu je každý odkaz na svém řádku`, mob.naStejnemRadku.length === 0,
    'slité: ' + mob.naStejnemRadku.map((a) => a.text).join(' | '));
  /* „Žádný odkaz" projde touhle podmínkou stejně dobře jako „všechny
     dost vysoké" — .every() nad prázdným polem je true. Patička, která
     by se přestala vykreslovat, by tedy prošla. Ptáme se proto nejdřív,
     jestli tam nějaké odkazy vůbec jsou. */
  pravda(`${s} — odkazy se na telefonu dají trefit prstem`,
    mob.odkazy.length > 0 && mob.odkazy.every((a) => a.vyska >= 28),
    mob.odkazy.length === 0 ? 'v patičce není ani jeden odkaz'
      : 'nejnižší ' + Math.min(...mob.odkazy.map((a) => a.vyska)) + ' px');
  pravda(`${s} — pod sloupci je dělicí čára`, parseFloat(mob.cara) >= 1, `čára ${mob.cara}`);
  pravda(`${s} — a kolem ní je na telefonu prostor`, mob.odstupPodMrizkou >= 36,
    `odstup jen ${mob.odstupPodMrizkou} px — zkratka „padding" v .wrap sráží svislé odsazení`);
  pravda(`${s} — tlačítko „Nahoru" neleží na copyrightu`, mob.nahoruPrekryva === false,
    'v patičce se překrývají');
  const pcNahoru = pc.nahoruPrekryva;
  pravda(`${s} — ani na počítači`, pcNahoru === false);
}

await prohlizec.close();
console.log('\nPatička — rozvržení na počítači i na telefonu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Patička: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
