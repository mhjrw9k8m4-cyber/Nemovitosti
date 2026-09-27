// Test: vložení vlastního pozemku — celá cesta od formuláře po databázi.
//
// Spuštění: node scripts/test-pridat.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Proč vznikl: „Přidat pozemek" je JEDINÁ cesta, kudy se na web dostane
// vlastní obsah — a neprocházel ji žádný test. Kontrolovalo se jen to, že
// stránka nespadne a že odkazy vedou někam. Jestli formulář opravdu uloží
// pozemek, jestli odmítne nesmysl a jestli člověku řekne PROČ, nehlídalo
// nic. Přitom právě tady se nejvíc pozná, že web „nefunguje": kdo dvakrát
// marně odešle inzerát, potřetí nepřijde.
//
// Hlídá se:
//   1. bez přihlášení se formulář vůbec nenabídne (a je vidět proč),
//   2. po přihlášení jde vyplnit a odeslat a pozemek se opravdu uloží,
//   3. meze serveru platí a jejich porušení má SROZUMITELNOU hlášku
//      (ne obecné „nepovedlo se"),
//   4. co server odmítne, to web nevydává za uložené.
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

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/* Přepínač pro sondu níž: „obec se nenajde, okres ano". */
let bezObce = false;
async function otevri(prihlasit) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  /* POZOR NA POŘADÍ: platí poslední zaregistrovaná cesta, ne první.
     Když se hrubý zákaz ven zapsal až nakonec, přebil i podstrčenou
     odpověď geokodéru — formulář pak skončil na „obec jsme nenašli"
     a o ukládání se test nedozvěděl nic. */
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  /* Geokódování jde na nominatim.openstreetmap.org — ven se v testu
     nechodí, tak se odpověď podstrčí. */
  await ctx.route('**nominatim.openstreetmap.org**', (r) => {
    /* Když test chce, ať se OBEC nenajde: prázdná odpověď na všechno,
       co není dotaz na samotný okres. Tím se vyvolá poslední záchrana,
       která vrátí souřadnice okresního města — a přesně to se nesmí
       zveřejnit jako poloha pozemku. */
    /* Propustí se JEN dotaz na samotný okres („okres Kolín, Česko").
       První pokus zní „obec, okres Kolín, Česko" a slovo „okres"
       obsahuje taky — hledat ho kdekoli v dotazu tedy nestačí. */
    const dotaz = (/[?&]q=([^&]*)/.exec(r.request().url()) || [])[1] || '';
    if (bezObce && !/^okres[+%20 ]/i.test(decodeURIComponent(dotaz))) {
      return r.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
    }
    return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify([{ lat: '50.0281', lon: '15.2000' }]) });
  });
  if (prihlasit) {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
          refresh_token: 'ref-majitel', expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@parcelka.test' } }));
      } catch (e) {}
    });
  }
  const p = await ctx.newPage();
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String(e).slice(0, 160)));
  p.setDefaultTimeout(8000);
  await p.goto(`${BASE}/pridat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  return { ctx, p, padlo };
}

/* --- 1) Bez přihlášení ------------------------------------------------ */
{
  const { ctx, p } = await otevri(false);
  const v = await p.evaluate(() => ({
    obec: !!(document.getElementById('p-obec') || {}).offsetParent,
    email: !!(document.getElementById('au-email') || {}).offsetParent,
    text: document.body.textContent.replace(/\s+/g, ' '),
  }));
  pravda('bez přihlášení se formulář nenabídne', v.obec === false);
  pravda('a je vidět, čím se to odemkne', v.email === true,
    'chybí přihlašovací pole — člověk by nevěděl, co má udělat');
  pravda('a stojí u toho proč', /přihlá|účet/i.test(v.text));
  await ctx.close();
}

/* --- 2) Vyplnit a odeslat --------------------------------------------- */
async function vypln(p, zmeny) {
  const zaklad = { 'p-obec': 'Kolín', 'p-vymera': '1200', 'p-cena': '480000',
    'p-okres': 'Kolín', 'p-parcela': '254/1', 'p-popis': 'Rovinatý pozemek na okraji obce.',
    'p-kontakt': '777 123 654' };   // „Vaše jméno" formulář nemá: nikam nevedlo
  const pole = Object.assign({}, zaklad, zmeny || {});
  for (const [id, hod] of Object.entries(pole)) {
    if (hod === null) continue;
    await p.fill('#' + id, String(hod)).catch(() => {});
  }
  await p.check('#p-souhlas').catch(() => {});
}
/* Sekce označená za nepovinnou nesmí skrývat povinné pole — nadpis by
   lhal. Je to funkce, protože platí na každé stránce s formulářem,
   ne jen na té, kde se to stalo (viz blok „SEKCE OZNAČENÁ…" níž). */
async function rozporyVRozbalovatkach(p) {
  return p.evaluate(() => {
    const out = [];
    document.querySelectorAll('details').forEach((d) => {
      const sum = (d.querySelector('summary') || {}).textContent || '';
      if (!/nepovinn|doporučen|volitel/i.test(sum)) return;
      const povinna = [...d.querySelectorAll('input[required], select[required], textarea[required]')]
        .map((e) => e.id || e.name || '(bez id)');
      if (povinna.length) out.push(sum.replace(/\s+/g, ' ').trim() + ' → ' + povinna.join(', '));
    });
    return out;
  });
}

async function odesli(p) {
  /* Schválně tlačítko UVNITŘ formuláře s pozemkem. Na stránce je i druhý
     odesílací knoflík — přihlašovací — a ten je v DOM první; klepnutí na
     „první submit na stránce" tedy přihlašovalo místo odesílání a test
     pak tvrdil, že web nic neuložil. */
  const btn = await p.$('#form-prodej button[type="submit"]');
  if (!btn) return { url: '(chyba)', hlaska: 'tlačítko odeslat ve formuláři nenalezeno' };
  await btn.click().catch(() => {});
  await p.waitForTimeout(2200);
  return p.evaluate(() => ({
    url: location.pathname,
    hlaska: [...document.querySelectorAll('#msg-prodej, .add-msg, [role="alert"]')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '),
  }));
}

{
  const { ctx, p, padlo } = await otevri(true);
  pravda('po přihlášení je formulář k dispozici',
    await p.evaluate(() => !!(document.getElementById('p-obec') || {}).offsetParent));

  await vypln(p);
  const v = await odesli(p);
  pravda('vyplněný pozemek se uloží a web přejde na „moje inzeráty"',
    /muj-inzerat/.test(v.url), `zůstali jsme na ${v.url}, hláška: „${v.hlaska}"`);

  const ulozeno = await fetch(`${BASE}/rest/v1/rpc/my_listings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-majitel' },
    body: '{}',
  }).then((r) => r.json()).catch(() => []);
  pravda('a v databázi opravdu je', Array.isArray(ulozeno) && ulozeno.length === 1,
    `uloženo záznamů: ${Array.isArray(ulozeno) ? ulozeno.length : '?'}`);
  if (ulozeno[0]) {
    pravda('se vším, co člověk vyplnil',
      ulozeno[0].place === 'Kolín' && ulozeno[0].area === 1200 && ulozeno[0].price === 480000
      && ulozeno[0].contact === '777 123 654',
      JSON.stringify(ulozeno[0]).slice(0, 200));
    pravda('a se souřadnicemi, ne bez nich',
      typeof ulozeno[0].lat === 'number' && typeof ulozeno[0].lng === 'number',
      'pozemek bez polohy se na mapě neukáže');
  }
  pravda('a nic při tom nespadlo', padlo.length === 0, padlo.join(' | '));
  await ctx.close();
}

/* --- 2b) A dál: vidím ho ve svých inzerátech a jde smazat -------------
   Formulář po uložení přejde na „moje inzeráty" — tam cesta pokračuje
   a dosud ji taky nikdo neprocházel. Vložit pozemek, který pak nejde
   najít ani smazat, je totéž jako ho nevložit. */
{
  const { ctx, p, padlo } = await otevri(true);
  await p.goto(`${BASE}/muj-inzerat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2800);
  const v = await p.evaluate(() => ({
    karet: document.querySelectorAll('.mi-lcard').length,
    odznak: (document.querySelector('.mi-lstatus') || {}).textContent || '',
    tlacitka: [...document.querySelectorAll('.mi-lbtn')].map((b) => b.textContent.trim()),
    text: (document.getElementById('mi-list') || document.body).textContent.replace(/\s+/g, ' '),
  }));
  pravda('vložený pozemek je vidět v „moje inzeráty"', v.karet === 1, `karet ${v.karet}`);
  // Totéž pravidlo o rozbalovátkách platí i tady — je to druhá a poslední
  // stránka webu s formulářem.
  const rozporyMi = await rozporyVRozbalovatkach(p);
  pravda('ani v „moje inzeráty" se rozbalovátko netváří jako nepovinné, když v něm je povinné pole',
    rozporyMi.length === 0, rozporyMi.join(' | '));
  /* Inzerát je na mapě HNED (create_listing vkládá status 'approved').
     Kdyby se stav ztratil, stránka by u něj tvrdila „čeká" a člověk by
     marně vyhlížel schválení, které nikdo nedělá. */
  pravda('a je označený jako zveřejněný, ne „čeká"', /na mapě/i.test(v.odznak),
    `odznak: „${v.odznak.trim()}"`);
  pravda('s údaji, které člověk zadal', /Kolín/.test(v.text) && /1 200|1200/.test(v.text));
  pravda('a jde smazat', v.tlacitka.some((t) => /smazat/i.test(t)), JSON.stringify(v.tlacitka));

  p.on('dialog', (d) => d.accept());
  const del = await p.$('[data-del]');
  if (del) {
    await del.click().catch(() => {});
    await p.waitForTimeout(1800);
    const po = await p.evaluate(() => ({
      karet: document.querySelectorAll('.mi-lcard').length,
      prazdno: !(document.getElementById('mi-empty') || {}).hidden,
    }));
    pravda('smazání opravdu smaže', po.karet === 0, `zůstalo karet ${po.karet}`);
    pravda('a řekne, že už nic nemáte', po.prazdno === true,
      'prázdný seznam bez vysvětlení vypadá jako chyba načítání');
  }
  pravda('a ani tady nic nespadlo', padlo.length === 0, padlo.join(' | '));
  await ctx.close();
}

/* --- 2c) Co najde noční kontrola, musí se dozvědět majitel -----------
   scripts/kontrola-inzeratu.mjs projde každou noc zveřejněné inzeráty,
   zkusí odkaz i fotky a výsledek zapíše do listing_checks. Nic neskrývá
   ani nemaže — „rozhodnutí zůstává na člověku".
   Jenže ten člověk se to neměl jak dozvědět: výsledky nečetla ŽÁDNÁ
   stránka. Kontrola tedy zjistila, že někomu nejde fotka, a mlčela.
   Majitel je přitom jediný, kdo to může spravit. */
{
  const { ctx, p, padlo } = await otevri(true);
  // založit inzerát a podstrčit k němu nález, jako by ho našla noční kontrola
  const vlozeny = await fetch(`${BASE}/rest/v1/rpc/create_listing`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-majitel' },
    body: JSON.stringify({ p_place: 'Kolín', p_okres: 'Kolín', p_druh: 'orná půda', p_parcel: '9/9',
      p_area: 2000, p_price: 600000, p_lat: 50.02, p_lng: 15.2, p_description: 'Pozemek.',
      p_contact: 'jan@example.com', p_photos: [], p_features: [], p_access: '' }),
  }).then((r) => r.json()).catch(() => null);
  const lid = vlozeny && vlozeny[0] && vlozeny[0].id;
  pravda('zkušební inzerát se založil', !!lid);
  await fetch(`${BASE}/zkouska/kontrola`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lid, ok: false, nalezy: [
      { typ: 'fotka', stav: 'chybi', msg: 'fotka už v úložišti není' },
      { typ: 'odkaz', stav: 'mrtvy', msg: 'odkaz už neexistuje (404)' },
    ] }),
  }).catch(() => {});

  await p.goto(`${BASE}/muj-inzerat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2800);
  const v = await p.evaluate(() => {
    const el = document.querySelector('.mi-potiz');
    return { je: !!el, text: el ? el.textContent.replace(/\s+/g, ' ').trim() : '' };
  });
  pravda('nález noční kontroly je na inzerátu vidět', v.je,
    'kontrola běží každou noc a výsledek se k majiteli nedostane');
  pravda('a je z něj poznat, co je špatně',
    /fotka už v úložišti není/i.test(v.text) && /odkaz už neexistuje/i.test(v.text),
    `text: „${v.text}"`);
  pravda('a že inzerát kvůli tomu neskrýváme', /neskrýváme|opravit/i.test(v.text),
    'jinak by to vypadalo jako trest, ne jako upozornění');

  // A naopak: u inzerátu bez nálezu se nic strašit nemá
  await fetch(`${BASE}/zkouska/kontrola`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: lid, ok: true, nalezy: [] }),
  }).catch(() => {});
  await p.reload({ waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  pravda('u inzerátu, kde je všechno v pořádku, se nic nestraší',
    await p.evaluate(() => !document.querySelector('.mi-potiz')));
  pravda('a nic při tom nespadlo', padlo.length === 0, padlo.join(' | '));

  // úklid, ať další oddíl začíná s prázdným seznamem
  await fetch(`${BASE}/rest/v1/rpc/delete_listing`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-majitel' },
    body: JSON.stringify({ p_id: lid }),
  }).catch(() => {});
  await ctx.close();
}

/* --- 3) Co server odmítne, se nesmí tvářit jako uložené ---------------
   Meze jsou na serveru schválně — prohlížeči se věřit nedá. Test je ale
   o tom, co uvidí ČLOVĚK: odmítnutí musí dojít až k němu a musí z něj
   jít poznat, co opravit. */
{
  const spatne = [
    ['výměra pod deseti metry', { 'p-vymera': '5' }, /výměr/i],
    ['nesmyslná cena za metr', { 'p-vymera': '100000', 'p-cena': '2000' }, /cen|metr/i],
    ['kontakt, který není kontakt', { 'p-kontakt': 'zavolejte mi' }, /kontakt|telefon|e-mail/i],
    ['sprostý popis', { 'p-popis': 'Tenhle pozemek je uplne na hovno.' }, /nevhodn|obsah/i],
  ];
  for (const [popis, zmeny, ocekavana] of spatne) {
    const { ctx, p } = await otevri(true);
    await vypln(p, zmeny);
    const v = await odesli(p);
    pravda(`odmítne: ${popis}`, !/muj-inzerat/.test(v.url),
      `web přešel na ${v.url}, jako by to uložil`);
    pravda(`a řekne proč: ${popis}`, ocekavana.test(v.hlaska),
      `hláška byla „${v.hlaska}"`);
    await ctx.close();
  }
}

/* --- 3b) PRAVIDLO ZE SERVERU MUSÍ DOJÍT AŽ K ČLOVĚKU -----------------
   Případy výš zachytí ještě prohlížeč, takže o cestě „server odmítl →
   člověk to čte" neříkají nic. A právě ta cesta byla rozbitá: js/pridat.js
   znal jen čtyři hlášky (vulgarity, počkejte, limit, přihlášení) a všechno
   ostatní spadlo do obecného „Odeslání se teď nepovedlo, zkuste to prosím
   za chvíli znovu" — což je rada, po které člověk zkusí totéž a zase to
   nejde. Přišlo se na to u kontaktu: server ho vyžadoval, formulář ho
   nabízel jako nepovinný, a kdo ho nevyplnil, nedozvěděl se vůbec nic.
   Odpověď serveru se tu podstrčí, protože jinou cestou ji vyvolat nejde. */
{
  const pripady = [
    ['nepotvrzený e-mail', 'nejdřív potvrďte e-mail — poslali jsme vám odkaz', /potvrďte e-mail/i, true],
    ['mez, kterou prohlížeč neuhlídal', 'popis je delší než 2000 znaků', /popis je delší/i, true],
    /* Naopak cizí chyba (spadlé spojení, rozbitý token) se ukazovat NEMÁ:
       člověku neřekne nic a je to vnitřek databáze. Tady musí zůstat
       obecná hláška — jinak by whitelist v pridat.js pouštěl cokoli. */
    ['cizí chybu databáze web nevystavuje', 'JWSError JWSInvalidSignature', /za chvíli znovu/i, false],
  ];
  for (const [popis, zprava, ocekavana, nasePravidlo] of pripady) {
    const { ctx, p } = await otevri(true);
    await ctx.route('**/rest/v1/rpc/create_listing*', (r) => r.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: zprava, details: null, hint: null }),
    }));
    await vypln(p);
    const v = await odesli(p);
    pravda(`neuloží, co server odmítl: ${popis}`, !/muj-inzerat/.test(v.url),
      `web přešel na ${v.url}, jako by to uložil`);
    pravda(`a řekne proč: ${popis}`, ocekavana.test(v.hlaska),
      `hláška byla „${v.hlaska}"`);
    if (nasePravidlo) {
      pravda(`a nezůstane u obecného „zkuste to za chvíli": ${popis}`, !/za chvíli znovu/i.test(v.hlaska),
        `hláška byla „${v.hlaska}" — člověk nemá co opravit`);
    }
    await ctx.close();
  }
}

/* --- OKRES SE VYBÍRÁ, NEPÍŠE SE Z HLAVY ----------------------------
 * Bylo to prázdné políčko s nápovědou „např. Kolín" a prošlo cokoli.
 * Přitom podle okresu se inzerát zařadí na krajskou i okresní stránku,
 * najdou ho uložená hlídání a poměří se jeho cena s okolím. Překlep
 * znamená, že pozemek nikdo nenajde a cena se srovnává s cizím krajem.
 */
{
  const { ctx, p } = await otevri(true);
  const v = await p.evaluate(() => {
    const i2 = document.getElementById('p-okres');
    const dl = document.getElementById('p-okresy');
    return { napojeno: i2 ? i2.getAttribute('list') : null,
      voleb: dl ? dl.querySelectorAll('option').length : 0,
      prvni: dl && dl.querySelector('option') ? dl.querySelector('option').value : '' };
  });
  pravda('okres se dá vybrat z nabídky, ne jen napsat',
    v.napojeno === 'p-okresy' && v.voleb === 77, JSON.stringify(v));
  pravda('a je to opravdu seznam okresů', /^[A-ZÁ-Ž]/.test(v.prvni), `první volba: „${v.prvni}"`);

  /* Překlep se musí zastavit dřív, než se inzerát uloží. */
  await vypln(p, { 'p-okres': 'Kolim' });
  await odesli(p);
  await p.waitForTimeout(900);
  const chyba = await p.evaluate(() => {
    const m = document.getElementById('msg-prodej');
    return (m ? m.textContent : '').replace(/\s+/g, ' ').trim();
  });
  pravda('překlep v okrese inzerát nepustí dál a poradí správný',
    /Kolín/.test(chyba), `hláška: „${chyba.slice(0, 120)}"`);
  await ctx.close();
}

/* --- KDE SE POZEMEK UKÁŽE ------------------------------------------
 * Poloha se dřív ověřovala až po klepnutí na „Zveřejnit" — po vyplnění
 * všeho a po nahrání fotek. Náhled ji ukáže hned při psaní: snímek
 * místa a pod ním verdikt. Tohle je ta zkouška, že se to opravdu děje
 * BEZ odeslání formuláře.
 *
 * Podstrčený geokodér vrací pořád souřadnice u Kolína, takže okres
 * Kolín má dopadnout dobře a okres Cheb špatně.
 */
{
  const { ctx, p } = await otevri(true);
  const stav = async () => p.evaluate(() => {
    const c = document.getElementById('mp-card'), s = document.getElementById('mp-stav');
    const r = document.getElementById('mp-ram');
    return { skryta: !c || c.hidden, trida: s ? s.className : '',
      text: (s ? s.textContent : '').replace(/\s+/g, ' ').trim(),
      dlazdic: r ? r.querySelectorAll('image').length : 0 };
  });

  const naStart = await stav();
  pravda('náhled místa je schovaný, dokud není co ukázat', naStart.skryta, JSON.stringify(naStart));

  await vypln(p, {});                       // obec Kolín, okres Kolín
  await p.waitForTimeout(2600);             // 1,2 s čekání + geokodér
  const dobre = await stav();
  pravda('po vyplnění obce a okresu se náhled ukáže', !dobre.skryta, JSON.stringify(dobre));
  pravda('a je v něm opravdu snímek místa, ne prázdný rám', dobre.dlazdic > 0,
    `dlaždic ve snímku: ${dobre.dlazdic}`);
  pravda('u sedící dvojice náhled potvrdí, že je to v pořádku',
    dobre.trida === 'mp-stav ok', `třída „${dobre.trida}", text „${dobre.text}"`);

  await p.fill('#p-okres', 'Cheb');
  await p.waitForTimeout(2600);
  const spatne = await stav();
  pravda('špatný okres se pozná hned při psaní, bez odeslání',
    spatne.trida === 'mp-stav err', `třída „${spatne.trida}", text „${spatne.text}"`);
  pravda('a hláška řekne kolik km a který okres to nejspíš je',
    /\d+ km mimo okres Cheb/.test(spatne.text) && /Kolín/.test(spatne.text),
    `text „${spatne.text.slice(0, 160)}"`);
  const url = await p.evaluate(() => location.pathname);
  pravda('a nic se přitom neodeslalo', !/muj-inzerat/.test(url), `jsme na ${url}`);
  await ctx.close();
}

/* --- OBEC A OKRES K SOBĚ MUSÍ SEDĚT --------------------------------
 * Obcí jménem Lhota je v Česku přes dvacet a našeptávač adres vrátí tu
 * první. Když člověk vybere okres, ve kterém jeho obec neleží, pozemek
 * by se ukázal o sto kilometrů vedle — a poznat by to nešlo.
 *
 * Podstrčený geokodér vrací pořád souřadnice u Kolína. Okres Kolín tedy
 * projde (to hlídá hlavní zkouška výš, jinak by tahle nic neznamenala)
 * a okres Cheb projít nesmí.
 */
{
  const { ctx, p } = await otevri(true);
  await vypln(p, { 'p-okres': 'Cheb' });
  await odesli(p);
  await p.waitForTimeout(1500);
  const stav = await p.evaluate(() => {
    const m = document.getElementById('msg-prodej');
    return { hlaska: (m ? m.textContent : '').replace(/\s+/g, ' ').trim(), url: location.pathname };
  });
  pravda('pozemek u Kolína zadaný jako okres Cheb se nezveřejní',
    !/muj-inzerat/.test(stav.url), `web přešel na ${stav.url}`);
  pravda('a hláška řekne, jak daleko to je a který okres to nejspíš má být',
    /\d+ km mimo okres Cheb/.test(stav.hlaska) && /Kolín/.test(stav.hlaska),
    `hláška: „${stav.hlaska.slice(0, 160)}"`);
  await ctx.close();
}

/* --- ŠPENDLÍK NESMÍ TIŠE SKONČIT U OKRESNÍHO MĚSTA -----------------
 * Když se obec nenajde, geokódování spadlo na „okres X, Česko"
 * a inzerát dostal souřadnice okresního města. Na mapě to vypadá jako
 * přesný špendlík; kupující by jel třeba dvacet kilometrů vedle a nikdo
 * — ani ten, kdo inzerát podal — by o tom nevěděl.
 */
{
  bezObce = true;
  const { ctx, p } = await otevri(true);
  await vypln(p, { 'p-obec': 'Nenajitelna Lhota' });
  await odesli(p);
  await p.waitForTimeout(1200);
  const stav = await p.evaluate(() => {
    const m = document.getElementById('msg-prodej');
    return { hlaska: (m ? m.textContent : '').replace(/\s+/g, ' ').trim(), url: location.pathname };
  });
  pravda('nenalezená obec inzerát nezveřejní',
    !/muj-inzerat/.test(stav.url), `web přešel na ${stav.url}`);
  pravda('a řekne, že by špendlík skončil u okresního města',
    /okresního města/.test(stav.hlaska), `hláška: „${stav.hlaska.slice(0, 140)}"`);
  bezObce = false;
  await ctx.close();
}

/* --- TENTÝŽ POZEMEK PODRUHÉ ----------------------------------------
 * Formulář je dlouhý a odeslání chvíli trvá; kdo si není jistý, že to
 * prošlo, klepne znovu a má v „Moje inzeráty" dvě stejné nabídky —
 * zájemce pak neví, která platí.
 *
 * Blok si pozemek založí SÁM a nespoléhá na to, co v databázi nechaly
 * zkoušky před ním: napoprvé jsem se spolehl, že tam po hlavní zkoušce
 * zůstane jeden, jenže mezitím ho jiná zkouška smazala — a celý blok
 * pak měřil prázdno. Chytla to kontrola prázdnosti pár řádků níž,
 * proto tu je.
 *
 * A nezakazuje se, jen upozorní: druhé klepnutí projde, protože dvě
 * sousední parcely stejné velikosti v jedné vsi jsou obě poctivé.
 */
{
  const mojeInzeraty = () => fetch(`${BASE}/rest/v1/rpc/my_listings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-majitel' },
    body: '{}',
  }).then((r) => r.json()).catch(() => []);

  const { ctx, p } = await otevri(true);
  await vypln(p);
  const prvni = await odesli(p);
  pravda('první pozemek se zveřejní', /muj-inzerat/.test(prvni.url),
    `zůstali jsme na ${prvni.url}, hláška: „${prvni.hlaska}"`);
  await ctx.close();

  const pred = await mojeInzeraty();
  pravda('a je opravdu v databázi (jinak zkouška níž nic neměří)',
    Array.isArray(pred) && pred.length > 0, `záznamů: ${Array.isArray(pred) ? pred.length : '?'}`);

  // Totéž znovu, z čisté karty — jako by člověk nevěděl, že to už poslal.
  const { ctx: ctx2, p: p2 } = await otevri(true);
  await vypln(p2);
  const druhy = await odesli(p2);
  pravda('tentýž pozemek podruhé se hned nezveřejní',
    !/muj-inzerat/.test(druhy.url), `web přešel na ${druhy.url}`);
  pravda('a řekne, který inzerát už člověk má',
    /Moje inzeráty/.test(druhy.hlaska) && /Kolín/.test(druhy.hlaska),
    `hláška: „${druhy.hlaska.slice(0, 160)}"`);
  const mezitim = await mojeInzeraty();
  pravda('a nic mezitím nepřibylo', mezitim.length === pred.length,
    `bylo ${pred.length}, je ${mezitim.length}`);

  // Druhé klepnutí = „vím to, je to jiný pozemek". Musí projít.
  const treti = await odesli(p2);
  pravda('kdo klepne podruhé, tomu se to zveřejní',
    /muj-inzerat/.test(treti.url), `zůstali jsme na ${treti.url}, hláška: „${treti.hlaska}"`);
  await ctx2.close();
}

/* --- SEKCE OZNAČENÁ ZA NEPOVINNOU NESMÍ SKRÝVAT POVINNÉ POLE -------
 * Okres se stal povinným, ale leží v rozbalovátku, jehož nadpis hlásil
 * „(doporučené)". Člověk tedy mohl číst, že celá ta část je volitelná,
 * a pak dostat „Vyberte prosím okres" — vlastní nadpis by mu lhal.
 * (Rozbalovátko je otevřené a chyba na pole odroluje, takže to nebyla
 * past, jen protimluv. Protimluv ale stačí, aby web působil nedbale.)
 *
 * Kontrolují se VŠECHNA rozbalovátka na téhle stránce, ne jen to jedno:
 * až někdo udělá povinným další pole, spadne to tady. Na stránce
 * přidání je to potřeba nejvíc — je to jediný dlouhý formulář webu
 * a jediná stránka, která části skládá do rozbalovátek.
 */
{
  const { ctx, p } = await otevri(false);
  const rozpory = await rozporyVRozbalovatkach(p);
  pravda('na stránce přidání se žádné rozbalovátko netváří jako nepovinné, když v něm je povinné pole',
    rozpory.length === 0, rozpory.join(' | '));

  // A ať zkouška něco měří: povinná pole na stránce vůbec být musí.
  const povinnych = await p.evaluate(() =>
    document.querySelectorAll('#form-prodej [required]').length);
  pravda(`formulář má povinná pole (${povinnych}) — jinak zkouška výš nic neměří`, povinnych >= 4,
    `povinných polí ${povinnych}`);
  await ctx.close();
}

/* --- ÚVOD STRÁNKY NESMÍ ODTLAČIT TO, PROČ SEM ČLOVĚK PŘIŠEL ---------
 *
 * Kdo klepne na „Přidat pozemek", rozhodnutý už je — přesvědčovat ho je
 * zbytečné a jen ho to vzdaluje od prvního políčka. Změřeno na telefonu:
 * úvod měl 814 px a první ovládací prvek začínal na 1 221 px, tedy
 * půldruhé obrazovky dolů. Tahle zkouška hlídá, že se to nevrátí.
 */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/pridat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  const v = await p.evaluate(() => {
    const y = (e) => (e ? Math.round(e.getBoundingClientRect().top + window.scrollY) : null);
    const prvni = document.querySelector('.auth-tabs')
      || document.querySelector('#form-prodej input, #form-prodej select');
    const jak = document.querySelector('.add-jak');
    const sum = jak && jak.querySelector('summary');
    const hero = document.querySelector('.add-hero');
    return {
      prvniAkceY: y(prvni),
      heroH: hero ? Math.round(hero.getBoundingClientRect().height) : null,
      jeJak: !!jak,
      krokuUvnitr: jak ? jak.querySelectorAll('.add-steps li').length : 0,
      zavreno: jak ? !jak.hasAttribute('open') : null,
      vyskaSouhrnu: sum ? Math.round(sum.getBoundingClientRect().height) : 0,
      oUctuVUvodu: /účet|e-mail a heslo/i.test((hero && hero.textContent) || ''),
    };
  });
  pravda('na telefonu je první ovládací prvek vidět bez rolování (do 844 px)',
    v.prvniAkceY != null && v.prvniAkceY <= 844,
    'začíná až na ' + v.prvniAkceY + ' px — člověk musí rolovat, než vůbec něco udělá');
  pravda(`úvod stránky je krátký (${v.heroH} px)`, v.heroH != null && v.heroH <= 560,
    'úvod má ' + v.heroH + ' px; rozhodnutého člověka už není proč přesvědčovat');
  pravda('„Jak to funguje" je zabalené a zavřené', v.jeJak && v.zavreno === true,
    v.jeJak ? 'je otevřené rovnou' : 'blok .add-jak na stránce není');
  pravda('a má co ukázat (jinak zkouška nic neměří)', v.krokuUvnitr >= 3,
    'kroků je ' + v.krokuUvnitr);
  pravda('souhrn se dá trefit prstem (aspoň 44 px)', v.vyskaSouhrnu >= 44,
    'je vysoký ' + v.vyskaSouhrnu + ' px');
  /* O účtu se musí dozvědět v úvodu, ne až z přihlašovacích dveří. Totéž
     hlídá scripts/test-sliby.mjs ze zdroje; tady na vykreslené stránce. */
  pravda('a v úvodu pořád stojí, že je potřeba účet', v.oUctuVUvodu,
    'úvod o účtu mlčí — zkracováním se ta věta nesmí ztratit');
  await ctx.close();
}

await prohlizec.close();
console.log('\nPřidání vlastního pozemku — celá cesta');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Přidání pozemku: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
