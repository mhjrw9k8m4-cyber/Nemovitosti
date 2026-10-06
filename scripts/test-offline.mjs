/* Test: web funguje i bez signálu — a cizí servery se přitom neukládají.
   ==================================================================
   Spuštění: node scripts/test-offline.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Web se dá nainstalovat jako aplikace (manifest.webmanifest nese
   prakticky každá stránka) a pozemky se prohlížejí venku, kde signál
   bývá nejhorší. Přesný počet se tu schválně nedrží: mění se s tím,
   kolik je nabídek, takže by zastaral a začal lhát — spočítá ho
   scripts/test-staticka.mjs při každém běhu.
   Bez service workeru to byla aplikace, která bez signálu neukáže nic.

   JAK SE TO MĚŘÍ, ABY TO NEMĚŘILO NĚCO JINÉHO. Kdyby se jen zkusilo
   „offline a ono se to načetlo", prošlo by to i tehdy, kdyby stránku
   vydala obyčejná HTTP cache prohlížeče — tedy i bez service workeru.
   Proto tu stojí ZÁKLAD: tentýž pokus v čistém kontextu BEZ registrace
   workeru, kde offline načtení musí SELHAT. Když selže tam a projde
   tady, měří se opravdu ten worker.

   A druhá polovina je o ochraně údajů, ne o pohodlí: ochrana-udaju.html
   vypisuje, na které cizí servery (mapové podklady ČÚZK, VÚV, SPÚ…) se
   chodí. Kdyby jim worker potichu zřídil úložiště v zařízení člověka,
   přestal by ten výpis být pravdivý. Testuje se tedy i to, že v úložišti
   NENÍ nic cizího a že se tam nedostanou adresy s dotazem (v dotazu
   chodí token z e-mailu na obnovu hesla).
   ================================================================== */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nOffline režim (service worker)');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Offline režim: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* 127.0.0.1 je pro prohlížeč zabezpečený původ, takže tam service worker
   běží i bez https. */
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* ---------- ZÁKLAD: bez workeru offline nejde nic ---------- */
  {
    const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 },
      serviceWorkers: 'block' });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
    await p.waitForTimeout(500);
    await ctx.setOffline(true);
    let selhalo = false;
    try { await p.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 8000 }); }
    catch (e) { selhalo = true; }
    if (!selhalo) {
      /* Nestačí, že goto nevyhodilo chybu: stránka může být i chybová. */
      const t = await p.title().catch(() => '');
      selhalo = !/Parcelka|pozemk/i.test(t);
    }
    pravda('BEZ service workeru offline načtení selže (jinak by test měřil HTTP cache)',
      selhalo, 'offline se stránka načetla i bez workeru — následující kontroly nic nedokazují');
    await ctx.close();
  }

  /* ---------- S workerem ---------- */
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));

  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  const stav = await p.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return 'není podpora';
    const r = await Promise.race([
      navigator.serviceWorker.ready.then(() => 'ready'),
      new Promise((res) => setTimeout(() => res('čas vypršel'), 10000))
    ]);
    return r;
  });
  pravda('service worker se přihlásil a je aktivní', stav === 'ready', `stav: ${stav}`);
  if (stav !== 'ready') hotovo();

  /* Druhé načtení: teď už worker požadavky vidí a ukládá. Pak ještě
     stránka pozemku a okresu, ať je v úložišti i něco jiného než úvod. */
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await p.evaluate(() => fetch('data/model.json').then((r) => r.text()).catch(() => ''));
  /* CIZÍ PŮVOD SE MUSÍ DÁT ZMĚŘIT. Napoprvé tu stál ostrý mapový server
     (services.cuzk.gov.cz). V uzavřené síti se ale nedovolá, takže
     odpověď, kterou by si worker mohl uložit, vůbec nevznikla — a
     kontrola „nic cizího v úložišti" pak procházela sama od sebe.
     Poznalo se to sabotáží: zákaz cizích původů se z workeru odebral a
     test si toho nevšiml.
     localhost a 127.0.0.1 jsou pro prohlížeč dva RŮZNÉ původy, ačkoli
     je za nimi tentýž server. Cizí původ je tedy dosažitelný i tady.
     no-cors proto, aby to byl týž druh požadavku jako mapová dlaždice. */
  await p.evaluate(() => fetch('http://localhost:8310/data/model.json', { mode: 'no-cors' })
    .then(() => '').catch(() => ''));
  /* ADRESA S DOTAZEM, a to NAVIGACÍ. Napoprvé tu bylo fetch(), jenže
     pravidlo v workeru se týká navigací (request.mode === 'navigate') —
     fetch má jiný mode, takže se to pravidlo vůbec nevyvolalo a sabotáž
     „ukládej i adresy s dotazem" test nepoznal. V dotazu přitom chodí
     token z odkazu v e-mailu na obnovu hesla. */
  await p.goto(`${BASE}/index.html?token=tajne`, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(1000);

  const ulozeno = await p.evaluate(async () => {
    const out = {};
    for (const jmeno of await caches.keys()) {
      const c = await caches.open(jmeno);
      out[jmeno] = (await c.keys()).map((r) => r.url);
    }
    return out;
  });
  const vsechny = Object.values(ulozeno).flat();
  pravda('v úložišti vůbec něco je', vsechny.length > 0,
    `prázdno — pak kontroly pod tím nic neváží; úložiště: ${JSON.stringify(Object.keys(ulozeno))}`);

  const cizi = vsechny.filter((u) => !u.startsWith(BASE));
  pravda('a není v něm NIC z cizích serverů', cizi.length === 0, cizi.slice(0, 3).join(', '));

  const sDotazem = vsechny.filter((u) => u.includes('?') && !/[?&]v=[A-Za-z0-9]+$/.test(u));
  pravda('ani žádná adresa s dotazem (tokeny z e-mailu)', sDotazem.length === 0,
    sDotazem.slice(0, 3).join(', '));

  const otiskovane = vsechny.filter((u) => /\/(css|js|vendor|fonts|assets)\//.test(u));
  pravda('soubory s otiskem v adrese se uložily', otiskovane.length >= 3,
    `jen ${otiskovane.length}: ${otiskovane.slice(0, 3).join(', ')}`);
  const data = vsechny.filter((u) => /\/data\/.+\.json$/.test(u));
  pravda('a data taky', data.length >= 1, `${data.length}`);

  /* ---------- a teď bez signálu ---------- */
  await ctx.setOffline(true);
  let nacetlo = true;
  try { await p.goto(`${BASE}/index.html`, { waitUntil: 'load', timeout: 15000 }); }
  catch (e) { nacetlo = false; }
  pravda('bez signálu se úvodní stránka načte', nacetlo, 'goto selhalo');

  /* Když se stránka offline nenačte, je kontext stránky rozbitý a
     evaluate vyhodí. Spolkne se to, aby test NAHLÁSIL chybu místo toho,
     aby spadl bez výpisu — spadlý test se pozná hůř než červený. */
  const offline = await p.evaluate(() => ({
    titulek: document.title,
    /* Styl se ověřuje po VÝPOČTU: kdyby se stylopis nenačetl, zůstane
       výchozí hodnota prohlížeče a tohle to pozná. */
    pozadi: getComputedStyle(document.body).backgroundColor,
    mapa: !!document.getElementById('map'),
    skripty: typeof window.PK_CENY === 'object' && !!window.PK_CENY
  })).catch((e) => ({ titulek: '', pozadi: '', mapa: false, skripty: false, chyba: String(e) }));
  pravda('a má svůj titulek', /Parcelka/i.test(offline.titulek || ''), offline.titulek);
  pravda('se svým stylem (ne výchozím bílým prohlížeče)',
    offline.pozadi && offline.pozadi !== 'rgba(0, 0, 0, 0)' && offline.pozadi !== 'rgb(255, 255, 255)',
    `pozadí ${offline.pozadi}`);
  pravda('a s načtenými skripty (cenový model existuje)', offline.skripty === true,
    'window.PK_CENY chybí — stylopis sám by stačil na vzhled, ale ne na web');

  const dataOffline = await p.evaluate(() => fetch('data/model.json')
    .then((r) => r.ok ? r.text() : '').then((t) => t.length).catch(() => 0)).catch(() => 0);
  pravda('bez signálu se dají přečíst i uložená data', dataOffline > 1000, `${dataOffline} B`);

  /* Cizí server se offline nesmí „podařit" z úložiště — to by znamenalo,
     že si ho worker přes zákaz uložil. */
  const ciziOffline = await p.evaluate(() => fetch('http://localhost:8310/data/model.json', { mode: 'no-cors' })
    .then(() => 'odpověď přišla').catch(() => 'selhalo')).catch(() => 'stránka není');
  pravda('cizí server se bez signálu NEozve z úložiště', ciziOffline === 'selhalo', ciziOffline);

  await ctx.setOffline(false);
  pravda('a nic z toho nevyhodilo chybu do konzole', chybyKonzole.length === 0,
    chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
