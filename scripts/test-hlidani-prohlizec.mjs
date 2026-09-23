// Hlídání lokality v aplikaci — celá cesta v opravdovém prohlížeči.
//
// Spuštění: node scripts/test-hlidani-prohlizec.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Hlídání se špatně zkouší ručně: potřebuje účet, uložené hledání, nový
// pozemek a trpělivost. Dosud na něj byly jen testy vnitřní logiky — tedy
// „počítá se správně?", ne „funguje to člověku?". Tenhle test projde celou
// cestu: přihlásit se, uložit hlídání, počkat na nový pozemek, vidět odznak
// v menu, otevřít centrum upozornění, označit za viděné a hlídání smazat.
//
// E-MAIL SE NEPOSÍLÁ. Hlídání je záležitost aplikace; e-mailem chodí jen
// potvrzení účtu a obnova hesla, což řeší Supabase samo.
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
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Pozemky, ze kterých se hlídání počítá. Druhý je ten „nový" — přidá se
// až po uložení hlídání, takže se musí objevit jako upozornění.
/* Pole `site` je to, co robot vyčte z POPISU nabídky. Je tu schválně:
   podle něj se počítají čísla u voleb „Musí mít" a hlídání podle nich
   vybírá. Bez něj by test tuhle cestu vůbec neprošel — a přesně tam
   dřív hlídání mlčelo. Oplocení ani stav stavby tu nejsou: ty se
   z popisu vyčíst nedají a mají u sebe zůstat nula. */
const STARE = { updated: '2026-01-01', opportunities: [
  { place: 'Kolín', okres: 'Kolín', type: 'sale', parcel: '1/1', druh: 'orná půda',
    area: 1200, price: 400000, lat: 50.02, lng: 15.20, extra: 'inzerát',
    site: ['elektrina', 'voda', 'cesta'] },
] };
const NOVE = { updated: '2026-01-02', opportunities: STARE.opportunities.concat([
  { place: 'Kolín-Sendražice', okres: 'Kolín', type: 'sale', parcel: '2/2', druh: 'stavební pozemek',
    area: 900, price: 650000, lat: 50.05, lng: 15.23, extra: 'inzerát',
    site: ['elektrina', 'kanalizace', 'plyn', 'cesta'] },
]) };

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 420, height: 900 } });
let data = STARE;   // co server právě vydává; test to v průběhu přepne
await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: JSON.stringify(data) }));
await ctx.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
  contentType: 'application/json', body: '[]' }));
// přihlášený majitel (stejný účet jako v testu chatu)
await ctx.addInitScript(() => {
  localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111' } }));
});

const p = await ctx.newPage();
const padlo = [];
p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 140)));

/* ---------- 1. uložení hlídání ---------- */
await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#ns-okres', { timeout: 15000 });
pravda('stránka hlídání se otevřela přihlášenému člověku', true);

// Pozor na past: formulář nového hledání je taky .hl-card a políčko v něm
// nese vepsaný text, takže hledat „Kolín" v .hl-card by prošlo i bez uložení.
// Počítají se proto jen názvy uložených hledání (.hl-iname).
/* U každé volby „Musí mít" musí stát, kolik dnešních nabídek by jí
   vyhovělo. Bez toho se dalo zaškrtnout něco, pod čím není NIC (dřív to
   platilo pro všechny — hlídání se dívalo do políčka, které sbírané
   nabídky vůbec nemají), a hlídání pak mlčelo navždy, aniž by se dalo
   poznat proč. */
{
  const volby = await p.$$eval('.hl-chip', (n) => n.map((x) => {
    const c = x.querySelector('.hl-chip-n');
    return {
      nazev: (x.getAttribute('data-feat') || ''),
      /* Chybějící počet je ŘETĚZEC, ne null: dál se z něj tahají číslice
         a null by test shodil výjimkou místo toho, aby řekl, co je
         špatně. Padlý test se v běhu pozná jen podle toho, že po sobě
         nic nenechal — a to je horší než chyba, kterou hlásí. */
      pocet: c ? (c.textContent || '') : '(chybí)',
      nula: x.classList.contains('hl-nula'),
    };
  }));
  pravda('volby „Musí mít" jsou na stránce', volby.length >= 5, JSON.stringify(volby));
  pravda('a u každé stojí počet', volby.every((v) => /^[\d\s\u00a0]+$/.test(v.pocet)), JSON.stringify(volby));
  /* Co je v popisu vypsané nabídky, musí mít nenulový počet. (Kanalizace
     a plyn jsou jen u té nabídky, která v týhle chvíli ještě neexistuje,
     takže u nich nula být SMÍ — proto se hlídají jen ty tři.) */
  const site = volby.filter((v) => ['Elektřina', 'Voda', 'Přístupová cesta'].indexOf(v.nazev) >= 0);
  pravda('sítě a příjezd z popisu nabídky mají nenulový počet',
    site.length === 3 && site.every((v) => !v.nula && parseInt(String(v.pocet).replace(/\D/g, ''), 10) > 0),
    JSON.stringify(volby));
  pravda('a co se z popisu vyčíst nedá, má nulu',
    volby.filter((v) => ['Oplocení', 'Stavba k rekonstrukci'].indexOf(v.nazev) >= 0).every((v) => v.nula),
    JSON.stringify(volby));
  pravda('volba, pod kterou nic není, je označená a neschovaná',
    volby.filter((v) => v.nula).every((v) => String(v.pocet).replace(/\D/g, '') === '0'),
    JSON.stringify(volby.filter((v) => v.nula)));
  /* A poznámka u nich nesmí tvrdit nic, co neplatí: sítě se čtou
     z popisu VŠECH sbíraných nabídek, ne jen od majitelů. */
  const pozn = await p.$eval('.hl-feats', (e) => (e.previousElementSibling || {}).textContent || '').catch(() => '');
  pravda('poznámka u voleb říká, odkud se to bere',
    /popisu nabídky/.test(pozn) && !/jen u nabídek od majitelů/.test(pozn), `poznámka: „${pozn.trim()}"`);
}

const pred = await p.$$eval('.hl-iname', (e) => e.map((x) => x.textContent));
await p.fill('#ns-okres', 'Kolín');
await p.click('#ns-save');
await p.waitForTimeout(1400);
const po = await p.$$eval('.hl-iname', (e) => e.map((x) => x.textContent));
pravda('hlídání se uložilo a přibylo v seznamu', po.length === pred.length + 1,
  `před: ${JSON.stringify(pred)}, po: ${JSON.stringify(po)}`);
pravda('nové hlídání se jmenuje podle okresu', po.some((t) => /Kolín/.test(t)),
  JSON.stringify(po));
pravda('dřívější hlídání zůstalo', po.some((t) => /Tábor/.test(t)), JSON.stringify(po));

/* ---------- 2. nový pozemek → upozornění ---------- */
data = NOVE;   // robot mezitím našel další pozemek
await p.goto(`${BASE}/upozorneni.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
const centrum = await p.evaluate(() => ({
  text: (document.getElementById('up-root') || {}).textContent || '',
  polozek: document.querySelectorAll('.up-item, .up-row, .up-card .up-list > *').length,
}));
pravda('v centru upozornění je nový pozemek', /Sendražice/.test(centrum.text),
  'text centra: ' + centrum.text.replace(/\s+/g, ' ').slice(0, 160));
pravda('staré pozemky se jako nové nehlásí', !/„?Kolín"?\s*·\s*1\/1/.test(centrum.text));

/* ---------- 3. odznak v menu ---------- */
// Na stránce hlídání a upozornění se odznak schválně neukazuje (po přečtení
// by lhal), takže se zkouší tam, kde patří — na úvodní stránce.
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
const odznak = await p.evaluate(() => {
  const b = document.getElementById('nav-hlidani');
  const tecka = document.querySelector('.nav-toggle .nav-dot');
  return {
    menu: b ? (b.textContent || '').replace(/\s+/g, ' ').trim() : '(odkaz chybí)',
    titul: document.title,
    teckaNaHamburgeru: !!(tecka && getComputedStyle(tecka).display !== 'none'),
  };
});
pravda('v menu je vidět, že z hlídání něco přibylo',
  /\d/.test(odznak.menu) || /\(\d+\)/.test(odznak.titul) || odznak.teckaNaHamburgeru,
  `menu: „${odznak.menu}", titulek: „${odznak.titul}", tečka: ${odznak.teckaNaHamburgeru}`);

/* ---------- 4. označení za viděné ---------- */
await p.goto(`${BASE}/upozorneni.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
const tlacitko = await p.$('#up-seen, .up-seen, button:has-text("označit vše")');
if (tlacitko) {
  await tlacitko.click();
  await p.waitForTimeout(1200);
  const hned = await p.evaluate(() => (document.getElementById('up-root') || {}).textContent || '');
  pravda('po označení za viděné upozornění hned zmizí', !/Sendražice/.test(hned),
    'zbylo: ' + hned.replace(/\s+/g, ' ').slice(0, 140));
  // A TEĎ to podstatné: centrum položky schová rovnou v prohlížeči, ať server
  // odpoví jakkoli. Kdyby se označení neuložilo, po obnovení stránky by se
  // upozornění vrátilo — a člověk by ho odklikával pořád dokola. Bez tohohle
  // kroku test prošel i s rozbitým ukládáním; ověřeno.
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  const poObnoveni = await p.evaluate(() => (document.getElementById('up-root') || {}).textContent || '');
  pravda('označení za viděné si zapamatoval server (po obnovení se nevrátí)',
    !/Sendražice/.test(poObnoveni),
    'po obnovení zbylo: ' + poObnoveni.replace(/\s+/g, ' ').slice(0, 140));
} else {
  chyb++; zpravy.push('  ✕ tlačítko „označit vše jako viděné" se nenašlo');
}

/* ---------- 5. smazání hlídání ---------- */
await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
await p.waitForSelector('#ns-okres', { timeout: 15000 });
const smazat = await p.$('.hl-del, [data-del], button:has-text("Smazat")');
if (smazat) {
  p.once('dialog', (d) => d.accept());
  await smazat.click();
  await p.waitForTimeout(1200);
  const zbylo = await p.$$eval('.hl-card', (e) => e.map((x) => x.textContent).join(' '));
  pravda('smazané hlídání zmizelo ze seznamu', !/Kolín/.test(zbylo),
    'zbylo: ' + zbylo.replace(/\s+/g, ' ').slice(0, 140));
} else {
  zpravy.push('  – tlačítko pro smazání hlídání se nenašlo (přeskočeno)');
}

je('na žádné stránce nespadl skript', padlo, []);

await prohlizec.close();
console.log('\nHlídání v aplikaci (celá cesta v prohlížeči)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Hlídání v aplikaci nefunguje celou cestou.');
process.exit(chyb ? 1 : 0);
