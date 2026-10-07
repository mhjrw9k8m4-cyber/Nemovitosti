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
import { readFileSync } from 'node:fs';

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

const RUCNI_SEZNAM = (/var DRUHY = \[([^\]]*)\]/.exec(
  readFileSync(new URL('../hlidani.html', import.meta.url), 'utf8')) || [, ''])[1];
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 420, height: 900 } });
let data = STARE;   // co server právě vydává; test to v průběhu přepne
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
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
/* Čeká se na políčko v DOM, ne na jeho VIDITELNOST: formulář nového
   hlídání je nově pod záložkou a ten, kdo už nějaké hlídání uložené má,
   ho po otevření stránky nevidí — vidí svá hlídání. Přepne se na něj
   níž, až se ověří, že výchozí pohled je ten správný. */
await p.waitForSelector('#ns-okres', { state: 'attached', timeout: 15000 });
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

/* ZÁLOŽKY. Stížnost se snímkem: uložená hlídání ležela pod celým
   formulářem nového, tedy na telefonu přes obrazovku a půl rolování.
   Kdo si přišel zkontrolovat, co hlídá, viděl formulář a odešel.
   Výchozí pohled proto patří tomu, co už uložené je. */
{
  const t = await p.evaluate(() => {
    const taby = [...document.querySelectorAll('.hl-tab')].map((b) => ({
      text: (b.textContent || '').trim(), vybrany: b.getAttribute('aria-selected') === 'true',
    }));
    const vidno = (sel) => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; };
    return { taby, seznam: vidno('#hl-p-moje'), formular: vidno('#hl-p-nove'),
      pruh: !!document.querySelector('.hl-prepin[role="tablist"]') };
  });
  pravda('nad hlídáními je pruh se dvěma záložkami', t.pruh && t.taby.length === 2,
    JSON.stringify(t.taby));
  pravda('jedna je „Moje hlídání", druhá „Nové hlídání"',
    /Moje hlídání/.test(t.taby[0].text) && /Nové hlídání/.test(t.taby[1].text),
    JSON.stringify(t.taby.map((x) => x.text)));
  pravda('u „Moje hlídání" stojí, kolik jich je', /\d/.test(t.taby[0].text), t.taby[0].text);
  pravda('kdo má uložená hlídání, vidí rovnou je, ne formulář',
    t.taby[0].vybrany && t.seznam === true && t.formular === false,
    JSON.stringify(t));

  /* A přepnutí musí opravdu přepnout — obojí najednou viditelné být nemá. */
  await p.click('.hl-tab[data-zalozka="nove"]');
  await p.waitForTimeout(250);
  const po2 = await p.evaluate(() => {
    const vidno = (sel) => { const e = document.querySelector(sel); if (!e) return null;
      const r = e.getBoundingClientRect(); return !e.hidden && r.width > 0 && r.height > 0; };
    return { seznam: vidno('#hl-p-moje'), formular: vidno('#hl-p-nove'),
      vybrany: (document.querySelector('.hl-tab[data-zalozka="nove"]') || {}).getAttribute('aria-selected') };
  });
  pravda('klepnutí na „Nové hlídání" ukáže formulář a schová seznam',
    po2.formular === true && po2.seznam === false && po2.vybrany === 'true', JSON.stringify(po2));
}

/* U KAŽDÉHO DRUHU MUSÍ STÁT, KOLIK NABÍDEK MU DNES VYHOVÍ.
 * Stránka to tak dělá u „Musí mít" od začátku a sama si u toho píše proč:
 * dalo se zaškrtnout něco, pod čím není NIC, a hlídání pak mlčelo navždy,
 * aniž by se dalo poznat proč. U druhu pozemku ten počet chyběl — přitom
 * je to první věc, kterou člověk ve formuláři vybírá. */
{
  const v = await p.evaluate(() => {
    const sel = document.getElementById('ns-druh');
    if (!sel) return null;
    const o = [...sel.options].slice(1);     // první je „jakýkoli druh"
    return { pocet: o.length, hodnoty: o.map((x) => x.value),
      nenulovych: o.filter((x) => /\((?!0\))/.test(x.textContent)).length,
      sPoctem: o.filter((x) => /\((\d[\d\s ]*)\)\s*$/.test(x.textContent)).length,
      ukazka: o.slice(0, 3).map((x) => x.textContent) };
  });
  pravda('ve formuláři je výběr druhu pozemku', !!v && v.pocet >= 5,
    v ? `voleb ${v.pocet}` : 'výběr #ns-druh nenalezen');
  if (v) {
    pravda('a u každé volby stojí, kolik nabídek jí dnes vyhoví',
      v.sPoctem === v.pocet, `s počtem ${v.sPoctem} z ${v.pocet}: ${JSON.stringify(v.ukazka)}`);
    /* Pojistka proti tomu, aby se počty měřily na prázdnu: aspoň jeden
       musí být nenulový, jinak by „(0)" u všeho prošlo stejně dobře. */
    pravda('a aspoň u jedné volby ten počet není nula',
      v.nenulovych >= 1, `nenulových ${v.nenulovych} z ${v.pocet}`);
  }
}

/* --- JEN CELÉ POZEMKY -----------------------------------------------
 * Čtvrtina nabídek je spoluvlastnický podíl: kupující dostane zlomek
 * parcely a sám na ní nic nepostaví. Mapa je umí skrýt odjakživa,
 * hlídání ne — komu přišlo upozornění na „stavební pozemek do milionu",
 * chodily i podíly, které si nikdy nekoupí.
 *
 * Tady se zkouší to, co ze zdroje poznat nejde: že zaškrtávátko ve
 * formuláři opravdu je, že se u něj píše, kolika nabídek se to týká,
 * a že se na něj dá na telefonu trefit prstem.
 */
{
  const z = await p.evaluate(() => {
    const vst = document.getElementById('ns-celek');
    if (!vst) return null;
    const radek = vst.closest('label') || vst.parentElement;
    const r = radek.getBoundingClientRect();
    /* Počet nabídek nestojí v samotném zaškrtávátku, ale v nápovědě
       hned pod ním — čte se proto obojí. */
    const pozn = radek.nextElementSibling;
    return { jeTam: true, zaskrtnuto: vst.checked, typ: vst.type,
      vyska: Math.round(r.height), sirka: Math.round(r.width),
      text: (radek.textContent || '').replace(/\s+/g, ' ').trim(),
      pozn: ((pozn && pozn.classList.contains('hl-napoveda') ? pozn.textContent : '') || '')
        .replace(/\s+/g, ' ').trim() };
  });
  pravda('ve formuláři je volba „jen celé pozemky"', !!z,
    z ? 'nalezena' : 'zaškrtávátko #ns-celek nenalezeno');
  if (z) {
    pravda('a je to zaškrtávátko, ne něco jiného', z.typ === 'checkbox', `typ „${z.typ}"`);
    /* Nezaškrtnuté: zapnout filtr za člověka by mu schovalo čtvrtinu
       nabídek, aniž by o to řekl. */
    pravda('a ve výchozím stavu je vypnutá', z.zaskrtnuto === false, `zaškrtnuto ${z.zaskrtnuto}`);
    /* Terč je celý řádek. 44 px je mez, kterou projekt drží i jinde
       (scripts/test-dotyk.mjs) — do 20px čtverečku se prstem netrefí. */
    pravda('a trefit se na ni dá i prstem (terč aspoň 44 px)',
      z.vyska >= 44, `terč ${z.sirka}×${z.vyska} px`);
    /* A hlavně: musí u ní stát, KOLIKA nabídek se to týká. Bez čísla je
       to volba naslepo — člověk netuší, jestli odfiltruje tři, nebo pět
       stovek. Číslo nesmí být nula, jinak by se měřilo na prázdnu. */
    pravda('a je u ní vysvětleno, co podíl znamená',
      /podíl/i.test(z.pozn), `nápověda: „${z.pozn}"`);
    const cislo = /(\d[\d\s ]*)/.exec(z.pozn);
    pravda('a stojí u ní, kolika nabídek se to týká',
      !!cislo, `nápověda: „${z.pozn}"`);
    if (cislo) {
      const n = Number(cislo[1].replace(/[\s ]/g, ''));
      pravda('a to číslo není nula (jinak by se měřilo prázdno)', n > 0, `uvedeno ${n}`);
    }
  }
}

const pred = await p.$$eval('.hl-iname', (e) => e.map((x) => x.textContent));
await p.fill('#ns-okres', 'Kolín');
await p.click('#ns-save');
await p.waitForTimeout(1400);
/* Po uložení se musí ukázat SEZNAM. Kdyby zůstal formulář, člověk nemá
   jak poznat, že se něco stalo — přesně to na webu vadilo i u filtrů. */
{
  const kam = await p.evaluate(() => {
    const e = document.querySelector('#hl-p-moje');
    return { seznam: !!(e && !e.hidden), vybrany: (document.querySelector('.hl-tab[data-zalozka="moje"]') || {}).getAttribute('aria-selected') };
  });
  pravda('po uložení se ukáže seznam hlídání, ne prázdný formulář',
    kam.seznam === true && kam.vybrany === 'true', JSON.stringify(kam));
}
const po = await p.$$eval('.hl-iname', (e) => e.map((x) => x.textContent));
pravda('hlídání se uložilo a přibylo v seznamu', po.length === pred.length + 1,
  `před: ${JSON.stringify(pred)}, po: ${JSON.stringify(po)}`);
pravda('nové hlídání se jmenuje podle okresu', po.some((t) => /Kolín/.test(t)),
  JSON.stringify(po));
pravda('dřívější hlídání zůstalo', po.some((t) => /Tábor/.test(t)), JSON.stringify(po));

/* ---------- 2. nový pozemek → upozornění ---------- */
data = NOVE;   // robot mezitím našel další pozemek

/* ---------- 2a. karta hlídání musí říct, KDE ty nové jsou ----------
   Odznak „1 nových" byl slepá ulička: řekl počet a nic víc. Jediné
   tlačítko vedlo na mapu, kde je vidět všech N nálezů a nový se od
   ostatních nijak neliší. Vypsané jsou v Upozorněních — tam karta vede.

   A klepnutí na mapu je nesmí spotřebovat: dřív označilo VŠECHNY nálezy
   hledání za viděné, takže seznam nových zmizel dřív, než ho někdo
   stačil přečíst, a v Upozorněních po něm nezbylo nic. */
await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
{
  const karta = await p.evaluate(() => {
    const it = [...document.querySelectorAll('.hl-item')]
      .find((e) => e.querySelector('.hl-new-badge') && !/zero/.test(e.querySelector('.hl-new-badge').className));
    if (!it) return null;
    return {
      odznak: (it.querySelector('.hl-new-badge') || {}).textContent || '',
      odkazy: [...it.querySelectorAll('a')].map((a) => ({
        href: a.getAttribute('href') || '', text: (a.textContent || '').trim() })),
    };
  });
  pravda('je hlídání, u kterého něco nového je (jinak zkouška nic neměří)',
    !!karta, 'žádná karta s nenulovým odznakem — kontroly níž by neměly co hlídat');

  /* JMÉNO SE POD SEBOU NEOPAKUJE. Hlídání okresu se tak i jmenuje, takže
     na kartě stálo dvakrát pod sebou totéž („Praha" a pod tím „Praha") —
     vypadá to jako chyba výpisu a neříká to nic navíc. */
  const karty = await p.evaluate(() => [...document.querySelectorAll('.hl-item')].map((e) => ({
    jmeno: ((e.querySelector('.hl-iname') || {}).textContent || '').trim(),
    krit: ((e.querySelector('.hl-crit') || {}).textContent || '').trim(),
    pocet: ((e.querySelector('.hl-count') || {}).textContent || '').trim(),
  })));
  pravda('karty hlídání se vypsaly (jinak zkouška nic neměří)', karty.length > 0, 'žádná karta');
  const opakuje = karty.filter((k) => k.jmeno && k.krit.toLowerCase() === k.jmeno.toLowerCase());
  pravda('jméno hlídání se pod ním neopakuje', opakuje.length === 0,
    JSON.stringify(opakuje));

  /* Skloňování. „1 pozemků" nebo „3 pozemků" vypadá jako strojový překlad. */
  const spatne = karty.filter((k) => /\b1\b\s*pozemků|\b[234]\b\s*pozemků|\b(?:[05-9]|\d\d+)\b\s*pozemek\b/.test(k.pocet));
  pravda('počty pozemků jsou skloňované', spatne.length === 0,
    JSON.stringify(karty.map((k) => k.pocet)));
  if (karta) {
    /* NOVÉ POZEMKY JSOU V KARTĚ. Dřív tu byl odkaz „Ukázat nové" do
       Upozornění; ta se na přání majitele odebrala a karta na otázku
       „kde je uvidím" odpovídá sama. */
    const vypsane = await p.evaluate(() => [...document.querySelectorAll('.hl-item .hl-nove li')]
      .map((li) => (li.textContent || '').trim()));
    pravda('karta nové pozemky rovnou vypíše', vypsane.length > 0,
      'v kartě není .hl-nove ani s jedním řádkem');
    pravda('a je mezi nimi ten nový', vypsane.some((t) => /Sendražice/.test(t)),
      JSON.stringify(vypsane.slice(0, 4)));
    pravda('kdežto staré se jako nové nehlásí',
      !vypsane.some((t) => /Kolín/.test(t) && /1\/1/.test(t)), JSON.stringify(vypsane.slice(0, 4)));

    const naMapu = karta.odkazy.find((a) => /^index\.html/.test(a.href));
    pravda('a druhá cesta vede na mapu', !!naMapu, JSON.stringify(karta.odkazy));
    if (naMapu) {
      /* POČÍTAJÍ SE ODESLANÉ POŽADAVKY, ne stav serveru po nich. Napoprvé
         jsem tu četl, co má server za viděné — a sabotáž (označuj zase při
         klepnutí na mapu) zkouškou PROŠLA: požadavek sice odejde, ale
         odchod na jinou stránku ho zruší dřív, než ho server zapíše.
         Měřilo se tedy, co stihne síť, ne co dělá web. Posluchač
         požadavků se ozve v okamžiku odeslání, takže na tom nezáleží. */
      const oznaceni = [];
      const posluchac = (req) => { if (/mark_search_seen/.test(req.url())) oznaceni.push(req.url()); };
      p.on('request', posluchac);
      await p.click(`.hl-item a[href="${naMapu.href.replace(/"/g, '\\"')}"]`);
      await p.waitForTimeout(2000);
      p.off('request', posluchac);
      pravda('otevření mapy z hlídání nové pozemky neodklikne', oznaceni.length === 0,
        `web při tom poslal ${oznaceni.length}× „označit za viděné"`);
    }
  }
}

/* VYPSANÝ POZEMEK MUSÍ JÍT OTEVŘÍT. Byly to jen řádky textu: člověk se
   dozvěděl, že mu přibyly tři a které to jsou, a otevřít si mohl leda
   celou mapu a hledat je mezi tečkami. */
{
  /* Zpátky na hlídání: kontrola o kus výš klepla na „Zobrazit na mapě",
     takže se stránka přepnula a karty tu už nejsou. */
  await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  const odkazy = await p.evaluate(() => [...document.querySelectorAll('.hl-nove li a')]
    .map((a) => ({ href: a.getAttribute('href') || '', text: (a.textContent || '').trim() })));
  pravda('vypsané pozemky jsou odkazy, ne jen text', odkazy.length > 0,
    'v kartě hlídání není ani jeden odkaz na pozemek');
  const sendrazice = odkazy.find((a) => /Sendražice/.test(a.text));
  pravda('a vede z nich odkaz na vlastní stránku toho pozemku',
    !!sendrazice && /^pozemek\.html\?p=/.test(sendrazice.href),
    JSON.stringify(odkazy.slice(0, 3)));
  if (sendrazice) {
    await p.click(`.hl-nove li a[href="${sendrazice.href.replace(/"/g, '\\"')}"]`);
    await p.waitForTimeout(2200);
    const nadpis = await p.evaluate(() => (document.querySelector('.pz-place') || {}).textContent || '');
    pravda('a otevře se opravdu ten pozemek, ne jiný',
      /Sendražice/.test(nadpis), `na stránce stojí „${nadpis.trim()}"`);
  }
}

/* ---------- 3. odznak v menu ---------- */
/* ODZNAK JE PRYČ. Byl to „nepřečtená upozornění" v nabídce a šel
   s Upozorněními, která se na přání majitele odebrala. Kdo chce vědět,
   co přibylo, otevře Hlídání, kde je to vypsané u každého hledání. */

/* ---------- 4. označení za viděné ---------- */
/* Odklikávalo se v centru upozornění („označit vše"), které je pryč.
   Co se označuje a kdy, hlídá dál kontrola výš: otevření mapy z karty
   nové pozemky NEODKLIKNE. */

/* ---------- 5. smazání hlídání ---------- */
await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
/* Zase jen „je v DOM": po otevření je vidět seznam hlídání, ne
   formulář — a mazat se bude právě v tom seznamu. */
await p.waitForSelector('#ns-okres', { state: 'attached', timeout: 15000 });
/* Po označení za viděné je odznak nulový — a tehdy se člověk nejvíc
   ptá „kde to teda uvidím, až něco přibude". Karta mu to musí říct. */
{
  await p.waitForTimeout(1200);
  const nulova = await p.evaluate(() => {
    const it = [...document.querySelectorAll('.hl-item')]
      .find((e) => /zero/.test(((e.querySelector('.hl-new-badge') || {}).className || '')));
    return it ? { text: (it.textContent || '').replace(/\s+/g, ' ') } : null;
  });
  pravda('je hlídání bez nových pozemků (jinak zkouška nic neměří)', !!nulova,
    'žádná karta s nulovým odznakem');
  if (nulova) {
    pravda('i u prázdného odznaku je napsané, kde se nové objeví',
      /vypíšeme ho rovnou sem/i.test(nulova.text),
      `na kartě stojí: „${nulova.text.slice(0, 160)}"`);
  }
}

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

/* ---------- 6. přihlášení na osobních stránkách ---------- */
/* Nepřihlášený člověk se musí přihlásit PŘÍMO tam, kam přišel. Výjimkou
   bývala Upozornění: nabízela tlačítko „Přihlásit se", které vedlo na
   zpravy.html — po přihlášení koukal na cizí seznam a nic ho nevedlo
   zpátky. Stránka je pryč, pravidlo platí pro zbylé dvě.
   A Enter v heslu musí odeslat: bez <form> to byla na telefonu největší
   klávesa, po které se nedělo nic. */
{
  const ctxOdhlaseny = await prohlizec.newContext({ viewport: { width: 420, height: 900 } });
  await ctxOdhlaseny.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctxOdhlaseny.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(data) }));
  await ctxOdhlaseny.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: '[]' }));
  const o = await ctxOdhlaseny.newPage();
  o.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 140)));

  for (const [stranka, poleMail, poleHeslo] of [
    ['hlidani.html', '#he', '#hp'],
    ['zpravy.html', '#ze', '#zp'],
  ]) {
    await o.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
    await o.waitForTimeout(2000);
    const m = await o.evaluate((s) => {
      const vidno = (x) => !!x && x.getClientRects().length > 0;
      /* Past je odkaz PRYČ ze stránky, který se tváří jako přihlášení.
         „Nepřihlášeno" v hlavičce se nepočítá — to je stav, ne pokyn. */
      const utek = Array.from(document.querySelectorAll('a')).filter((a) =>
        /přihlásit/i.test(a.textContent || '') &&
        !/^#/.test(a.getAttribute('href') || '#'));
      return {
        mail: vidno(document.querySelector(s[0])),
        heslo: vidno(document.querySelector(s[1])),
        utek: utek.map((a) => a.getAttribute('href')),
      };
    }, [poleMail, poleHeslo]);
    pravda(`na ${stranka} se nepřihlášený přihlásí rovnou tady`, m.mail && m.heslo,
      `pole e-mail: ${m.mail}, pole heslo: ${m.heslo}`);
    pravda(`a ${stranka} ho kvůli přihlášení nikam neodesílá`, m.utek.length === 0,
      'odkazy: ' + JSON.stringify(m.utek));
  }

  /* Když pole s heslem chybí, musí to test ŘÍCT, ne spadnout. Padlý test
     po sobě nenechá souhrn — a chyba, kterou nikdo nepřečte, je horší než
     chyba nahlášená. (Ověřeno: při návratu ke staré podobě přihlášení tudy
     test padal výjimkou místo hlášení.) */
  /* Zkouší se na Hlídání; dřív to bylo na stránce upozornění, která je
     pryč. Pravidlo je stejné: Enter v heslu je na telefonu největší
     klávesa a bez <form> se po ní nedělo nic. */
  await o.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
  await o.waitForTimeout(2200);
  if (!(await o.$('#hp'))) {
    chyb++; zpravy.push('  ✕ Enter v heslu přihlásí — pole pro heslo na hlidani.html vůbec není');
  } else {
    await o.fill('#he', 'zajemce@example.com');
    await o.fill('#hp', 'tajneheslo');
    await o.press('#hp', 'Enter');
    await o.waitForTimeout(2200);
    const poEnteru = await o.evaluate(() => ({
      formular: !!document.querySelector('#hp'),
      text: (document.body || {}).textContent || '',
    }));
    pravda('Enter v heslu přihlásí (formulář zmizí a seznam se načte)', !poEnteru.formular,
      'na stránce zbylo: ' + poEnteru.text.replace(/\s+/g, ' ').slice(0, 160));
  }

  await ctxOdhlaseny.close();
}

/* --- DRUH, KTERÝ V RUČNÍM SEZNAMU NENÍ, MUSÍ JÍT HLÍDAT TAKY -------
 * Výběr druhu stál na ručním seznamu devíti hodnot. Data ale chodí
 * z divočiny: v ostré nabídce na „pozemek" (52 nabídek), „zemědělský
 * pozemek", „zastavěná plocha a nádvoří" ani „vodní plocha" nesedělo
 * ani jedno z nich. Hlídání se na ně nikdy nemohlo ozvat — a nedalo se
 * to poznat, protože mlčící hlídání vypadá stejně jako to, kterému
 * zatím nic nepřibylo. Zdroje přitom nové názvy přidávají samy.
 *
 * Tady se podstrčí nabídka s druhem, který v ručním seznamu NENÍ,
 * a čte se skutečný výběr ve formuláři.
 */
{
  const EXOTICKY = 'vodní plocha';
  const DATA_X = { updated: '2026-01-01', opportunities: [
    { place: 'Kolín', okres: 'Kolín', type: 'sale', parcel: '7/1', druh: EXOTICKY,
      area: 800, price: 120000, lat: 50.02, lng: 15.20, extra: 'inzerát', site: [] },
    { place: 'Kolín', okres: 'Kolín', type: 'sale', parcel: '7/2', druh: 'orná půda',
      area: 1200, price: 400000, lat: 50.03, lng: 15.21, extra: 'inzerát', site: [] },
  ] };
  const ctxX = await prohlizec.newContext({ viewport: { width: 420, height: 900 } });
  await ctxX.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctxX.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(DATA_X) }));
  await ctxX.route('**/data/user-listings.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: '[]' }));
  await ctxX.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel', refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111' } }));
  });
  const px = await ctxX.newPage();
  await px.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
  await px.waitForTimeout(2200);
  await px.click('.hl-tab[data-zalozka="nove"]').catch(() => {});
  await px.waitForTimeout(600);
  const vx = await px.evaluate(() => {
    const sel = document.getElementById('ns-druh');
    if (!sel) return null;
    const o = [...sel.options].slice(1);
    return { hodnoty: o.map((x) => x.value), popisky: o.map((x) => x.textContent) };
  });
  pravda('formulář se složil i s neobvyklým druhem v datech', !!vx,
    'výběr #ns-druh nenalezen');
  if (vx) {
    /* Pojistka: kdyby ten druh v ručním seznamu byl, kontrola pod tím
       by neověřila doplňování, ale jen ten seznam. */
    pravda(`„${EXOTICKY}" opravdu není v ručním seznamu (jinak by se doplnění nemělo na čem poznat)`,
      !/vodní plocha/i.test(RUCNI_SEZNAM), RUCNI_SEZNAM);
    pravda(`a přesto je mezi volbami k hlídání`,
      vx.hodnoty.indexOf(EXOTICKY) !== -1, vx.hodnoty.join(' / '));
    pravda('a stojí u něj počet nabídek, které mu vyhoví',
      /\(\s*1\s*\)/.test(vx.popisky[vx.hodnoty.indexOf(EXOTICKY)] || ''),
      vx.popisky[vx.hodnoty.indexOf(EXOTICKY)] || '—');
  }
  await ctxX.close();
}

/* --- SOUHRN HLÍDÁNÍ MUSÍ UKÁZAT VŠECHNY MEZE, KTERÉ SE ULOŽILY ------
 * Formulář ukládá pět mezí (dolní i horní cenu, dolní i horní výměru
 * a cenu za metr), karta hlídání ukazovala dvě. Kdo si uložil
 * „od 500 000 Kč", „do 5 000 m²" nebo „do 20 Kč/m²", nenašel to na
 * kartě nikde — a dvě hlídání, která se lišila právě tím, vypadala
 * úplně stejně.
 *
 * Nepřihlášenému návštěvníkovi stránka ukazuje tytéž souhrny u příkladů,
 * takže se čtou odtud — kdyby je critText zamlčel, bude to vidět tady.
 */
{
  const ctxU = await prohlizec.newContext({ viewport: { width: 420, height: 900 } });
  await ctxU.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const pu = await ctxU.newPage();
  await pu.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
  await pu.waitForTimeout(3200);
  const u = await pu.evaluate(() => {
    const o = document.querySelector('.hl-ukazka');
    if (!o) return null;
    return { radky: [...o.querySelectorAll('.hlu-list li')].map((li) => ({
      podminky: (li.querySelector('.hlu-p') || {}).textContent || '',
      cislo: (li.querySelector('.hlu-n') || {}).textContent || '' })) };
  });
  pravda('nepřihlášenému stránka ukáže, co hlídání dělá', !!u && u.radky.length >= 2,
    u ? `řádků ${u.radky.length}` : 'ukázka na stránce není');
  if (u) {
    /* „Kolik přibylo" má DVĚ správné podoby a dřív se uznávala jen jedna.
       Když za týden nepřibylo nic, stránka napíše „za poslední týden
       nepřibyl žádný" — žádná číslice v tom není, a přitom je to přesná
       odpověď; napsat „0 pozemků" by byla horší čeština. Zkouška na to
       padala jeden den v týdnu, kdy se zrovna nic nenašlo, a vypadalo to
       jako vada webu. Co se hlídat MUSÍ, je prázdná buňka: ta neříká nic
       a člověk z ní nepozná, jestli se počítalo. */
    pravda('a u každého příkladu stojí, kolik pozemků by mu přibylo',
      u.radky.every((r) => /\d/.test(r.cislo) || /nepřibyl|žádn/i.test(r.cislo)),
      JSON.stringify(u.radky.map((r) => r.cislo)));
    pravda('a žádný ten řádek není prázdný',
      u.radky.every((r) => String(r.cislo).trim().length > 0),
      JSON.stringify(u.radky.map((r) => r.cislo)));
    /* Pojistka čte PŘEDPIS příkladů ze zdroje stránky: aspoň jeden musí
       mít mez v Kč/m². Bez toho by kontrola pod tím hledala něco, co
       nikdo nenastavil, a prošla by, i kdyby to souhrn zamlčoval. */
    const zdroj = readFileSync(new URL('../hlidani.html', import.meta.url), 'utf8');
    const predpis = (/var PRIKLADY = \[([\s\S]*?)\];/.exec(zdroj) || [, ''])[1];
    pravda('mezi příklady je nastavená mez v Kč/m² (jinak nemá co zamlčet)',
      /max_perm2\s*:\s*\d/.test(predpis), predpis.slice(0, 160));
    pravda('a souhrn ji opravdu uvádí — formulář ukládá pět mezí, karta jich ukazovala dvě',
      u.radky.some((r) => /Kč\/m²/.test(r.podminky)),
      JSON.stringify(u.radky.map((r) => r.podminky)));
  }
  await ctxU.close();
}

je('na žádné stránce nespadl skript', padlo, []);

await prohlizec.close();
console.log('\nHlídání v aplikaci (celá cesta v prohlížeči)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Hlídání v aplikaci nefunguje celou cestou.');
process.exit(chyb ? 1 : 0);
