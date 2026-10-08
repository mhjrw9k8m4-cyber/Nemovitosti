/* Test: co se pod myší zvedne, na to musí jít kliknout.
 *
 * Spuštění: node scripts/test-zdvih.mjs
 *   (potřebuje playwright-core; v sandboxu PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ. Na profilu stojí tři dlaždice: Moje inzeráty, Zhlédnutí celkem,
 * Uložené pozemky. Pravidlo .pf-stat:hover je zvedá o dva pixely a mění
 * jim okraj — všem třem. Obsluhu klepnutí má ale jen poslední z nich
 * (odroluje k seznamu uložených). Dvě dlaždice tedy pod myší slíbí, že
 * se na ně klepe, a pak neudělají nic.
 *
 * Opačný směr už hlídá test-afordance (ovládání musí být poznat od
 * textu). Tenhle hlídá tu druhou lež: vypadá to jako ovládání, a není.
 *
 * JAK SE TO MĚŘÍ. Ne ze zdrojáku — ze stránky. Prvek se najede myší
 * a porovná se, co se změnilo: poloha, okraj, stín, pozadí. Když se
 * změnilo cokoli z toho a prvek přitom není odkaz, tlačítko ani nic
 * s role/tabindex (ani jím není obalený), je to nález.
 *
 * Posluchače klepnutí ze stránky vyčíst nejdou, takže se ptáme na to,
 * co jde: čím prvek JE. Dlaždice, co má obsluhu, dostane role="button"
 * a tabindex — jinak ji nepoužije ani klávesnice, a to je vada sama.
 * Pravidlo tedy zní: smíš se hýbat jen tehdy, když jsi i pro klávesnici
 * a pro čtečku ovládání.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Stránka okresu je tu kvůli vzorku: dlaždice .okr-item nesla hlavně
   stránka cen (50 řádků krajů a okresů) a ta je teď vyhledávač, takže
   by pojistka „bylo vůbec co měřit" hlásila 18 dlaždic místo dvaceti.
   Upozornění ze seznamu vypadla — ta stránka je odebraná. */
const STRANKY = ['muj-inzerat.html', 'hlidani.html', 'zpravy.html', 'index.html',
  'cena-pozemku.html', 'pozemky-okres-kolin.html'];

/* Prvky, které se podle stylopisu pod myší hýbou nebo mění okraj.
   Vypsané schválně: projíždět všechno na stránce a hoverovat to po
   jednom trvá minuty a najede to i na věci, co se hýbat mají (mapa). */
const ZDVIHANE = ['.pf-stat', '.okr-item', '.deal-card', '.opp-item', '.odl-card',
  '.status-card', '.gl-item', '.ul-card', '.kraj-item', '.filter-chip',
  '.vm-navrhy li', '.ms-navrhy li'];
/* OD KAŽDÉ TŘÍDY STAČÍ PÁR KUSŮ. Vada je vlastnost pravidla v CSS, ne
   jednotlivé karty — když se chová špatně první .opp-item, chovají se
   tak všechny. Na úvodu jich přitom bývá přes padesát a každá stojí
   čekání na klid, najetí a odjetí: první verze testu běžela přes deset
   minut a do dávky se nevešla. */
const Z_KAZDE = 3;

const INTERAKTIVNI = 'a[href], button, summary, label, input, select, textarea, [role="button"], [role="link"], [role="tab"], [role="menuitem"], [tabindex]:not([tabindex="-1"])';

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
let zmerenych = 0, hybajicich = 0;

/* Co se o prvku měří. Jedna funkce pro stav před, kontrolu i stav po —
   kdyby to byly tři opisy, stačí jeden překlep a porovnává se nesmysl. */
const zmer = (e) => {
  const st = getComputedStyle(e), r = e.getBoundingClientRect();
  return { t: Math.round(r.top * 10) / 10, l: Math.round(r.left * 10) / 10,
    tr: st.transform, ok: st.borderTopColor + '|' + st.borderTopWidth,
    st: st.boxShadow, bg: st.backgroundColor };
};

for (const s of STRANKY) {
  /* Na šířku stolního počítače: na 390 px je `@media (hover:none)`
     sice nevypíná (to závisí na zařízení, ne na šířce), ale některé
     dlaždice tam vůbec nejsou. */
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1200);
  /* ANIMACE PŘÍCHODU MUSÍ DOBĚHNOUT DŘÍV, NEŽ SE ZAČNE MĚŘIT.
     Karty na úvodu připlouvají (.reveal) a spouští je teprve to, že se
     dostanou do zorného pole — a do zorného pole je dostane až samo
     hover(). První verze testu proto hlásila „hýbe se pod myší" u věcí,
     které se hýbaly samy od sebe. Stránka se jednou projede shora dolů,
     čímž se animace spustí všechny, a pak se počká, až skončí. Je to
     i rychlejší než hlídat každý prvek zvlášť: to trvalo přes deset
     minut a do dávky se to nevešlo. */
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += Math.round(innerHeight * 0.8)) {
      scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    scrollTo(0, 0);
  });
  await p.waitForTimeout(400);
  /* ČEKÁNÍ MUSÍ MÍT STROP. Některé animace na webu neskončí nikdy —
     pulzující tečka „živě" běží s `infinite`, takže její `finished` se
     nesplní a Promise.all na ní visí do skonání světa. Test tím visel
     celých deset minut a vypadal to jako pomalost, ne jako zaseknutí. */
  await p.evaluate(() => Promise.race([
    Promise.all(document.getAnimations()
      .filter((a) => !(a.effect && a.effect.getTiming().iterations === Infinity))
      .map((a) => a.finished.catch(() => {}))),
    new Promise((r) => setTimeout(r, 1500)),
  ])).catch(() => {});
  await p.waitForTimeout(200);

  const prvky = [];
  for (const sel of ZDVIHANE) prvky.push(...(await p.$$(sel)).slice(0, Z_KAZDE));
  const lzi = [];
  for (const el of prvky) {
    const vidno = await el.isVisible().catch(() => false);
    if (!vidno) continue;
    const box = await el.boundingBox().catch(() => null);
    if (!box || box.width < 8 || box.height < 8) continue;
    zmerenych++;

    await el.scrollIntoViewIfNeeded().catch(() => {});
    await p.waitForTimeout(120);

    const pred = await el.evaluate(zmer);
    /* KONTROLNÍ MĚŘENÍ BEZ MYŠI. Jinak se nedá odlišit, co způsobilo
       najetí, od toho, co se hýbalo samo: karty na úvodu dojíždějí
       animací příchodu, která se spustí teprve tím, že se dostanou do
       zorného pole. Změří se tedy totéž zpoždění BEZ hoveru, a teprve
       když se nic nezměnilo, má smysl najet. */
    let klid = false;
    for (let pokus = 0; pokus < 8 && !klid; pokus++) {
      await p.waitForTimeout(260);
      const kontrola = await el.evaluate(zmer);
      klid = Object.keys(pred).every((k) => String(pred[k]) === String(kontrola[k]));
      if (!klid) Object.assign(pred, kontrola);
    }
    if (!klid) continue;          // hýbe se sám od sebe, hover z toho nepoznám

    await el.hover({ timeout: 2000 }).catch(() => {});
    await p.waitForTimeout(260);          // ať doběhne přechod
    const po = await el.evaluate(zmer);
    const zmeny = Object.keys(pred).filter((k) => String(pred[k]) !== String(po[k]));
    if (!zmeny.length) continue;
    hybajicich++;

    const jeOvladani = await el.evaluate((e, sel) =>
      !!(e.matches(sel) || e.closest(sel) || e.querySelector(sel)), INTERAKTIVNI);
    if (!jeOvladani) {
      const popis = await el.evaluate((e) => e.tagName.toLowerCase() + '.'
        + String(e.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')
        + ' („' + (e.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40) + '")');
      lzi.push(`${popis} — mění ${zmeny.join(', ')}`);
    }
    // myš pryč, ať další měření nezačíná z navěšeného stavu
    await p.mouse.move(2, 2);
    await p.waitForTimeout(140);
  }
  pravda(`${s}: nic se pod myší nehýbe nadarmo`, lzi.length === 0,
    [...new Set(lzi)].slice(0, 6).join('\n      '));
  await ctx.close();
}

/* Pojistka proti měření prázdna. Bez ní by stačilo přejmenovat třídu
   a test by „prošel" s nulou nalezených dlaždic — přesně ta chyba, na
   kterou jsem už jednou naletěl u kontroly prázdných míst. */
pravda('a bylo vůbec co měřit', zmerenych >= 20 && hybajicich >= 6,
  `nalezeno ${zmerenych} dlaždic, z nich se pod myší mění ${hybajicich} — seznam tříd nic nenašel`);

await prohlizec.close();
console.log('=== zdvih ===');
console.log(zpravy.join('\n'));
console.log(`${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.error(`::error::Zdvih: ${chyb} kontrol neprošlo.`); process.exit(1); }
/* Ukončit výslovně. Falešný server drží smyčku událostí naživu, takže
   by test po dopsání výsledku jen tiše visel — a dávka, která mu dává
   dvacet minut, by ho nakonec zabila a zelený běh nahlásila jako chybu. */
process.exit(0);
