/* OFFLINE REŽIM — service worker
 * ====================================================================
 * Co to řeší: web se dá nainstalovat jako aplikace (manifest.webmanifest
 * je na 2 125 stránkách), ale bez service workeru to byla aplikace, která
 * bez signálu neukáže nic. Pozemky se přitom prohlížejí venku, na place,
 * kde signál bývá nejhorší.
 *
 * ---------------------------------------------------------------------
 * CO SE UKLÁDÁ A CO SE NEUKLÁDÁ ZA ŽÁDNOU CENU
 *
 * 1. CIZÍ SERVERY NIKDY. Mapové podklady (ČÚZK, VÚV, SPÚ, CENIA…),
 *    Supabase ani Stripe tudy neprojdou: požadavek na jiný původ se
 *    nechá být, tedy ani neuloží, ani nepřečte z úložiště. Je to
 *    i otázka ochrany údajů — ochrana-udaju.html vypisuje, na které
 *    cizí servery se chodí, a přidat jim tiché úložiště u člověka
 *    v zařízení by znamenalo, že ten výpis přestal být pravdivý.
 *
 * 2. NIC JINÉHO NEŽ GET. Přihlášení, odeslání inzerátu, platba — všechno
 *    POST a nic z toho se nikam neukládá.
 *
 * 3. ADRESY S DOTAZEM SE NEUKLÁDAJÍ. V dotazu může být token z odkazu
 *    v e-mailu (obnova hesla přistává na úvodní stránce). Uložená
 *    odpověď na takovou adresu je zbytečná a riziková.
 *
 * ---------------------------------------------------------------------
 * TŘI PRAVIDLA, PODLE ČEHO SE ROZHODUJE
 *
 * A) SOUBORY S OTISKEM V ADRESE (css/, js/, vendor/, fonts/, assets/
 *    a ?v=…): nejdřív z úložiště, a jen když tam nejsou, ze sítě.
 *    Smí se to, protože otisk je součást adresy — scripts/orazitkuj-verze.mjs
 *    ho spočítá z obsahu, takže jiný obsah = jiná adresa. Stará odpověď
 *    tedy nemůže přebít novou verzi, jen zabere místo.
 *
 * B) DATA (data/*.json): nejdřív ze sítě, a jen když síť není, z úložiště.
 *    Nabídky se obnovují čtyřikrát denně a stará cena je horší než žádná;
 *    ukazovat včerejší dražbu jako dnešní by byl přesně ten druh chyby,
 *    kterou tenhle web nemá dělat. Proto se o síť pokusí VŽDYCKY a
 *    úložiště je jen záchrana pro chvíli bez signálu.
 *
 * C) STRÁNKY (navigace): taky nejdřív ze sítě. Stránky mají v hlavičce
 *    Cache-Control: no-cache, must-revalidate — ten záměr se tady
 *    neobchází, jen se k němu přidá záloha pro offline.
 *
 * ---------------------------------------------------------------------
 * JAK TO VYPNOUT, kdyby se to pokazilo. Service worker je jediná část
 * webu, která přežije i to, že se smaže ze serveru — proto se nevypíná
 * mazáním, ale NÁHRADOU. Obsah tohoto souboru se přepíše na:
 *
 *   self.addEventListener('install', () => self.skipWaiting());
 *   self.addEventListener('activate', (e) => e.waitUntil((async () => {
 *     for (const k of await caches.keys()) await caches.delete(k);
 *     await self.registration.unregister();
 *     for (const c of await self.clients.matchAll()) c.navigate(c.url);
 *   })()));
 *
 * Prohlížeče si sw.js samy neukládají (updateViaCache je u importů), takže
 * se tahle náhrada rozšíří při první navigaci. Nic jiného se měnit nemusí.
 * ==================================================================== */
const TRVALE = 'pk-trvale-v1';   // soubory s otiskem v adrese
const DATA = 'pk-data-v1';       // data/*.json
const STRANKY = 'pk-stranky-v1'; // HTML

/* Strop, aby úložiště nerostlo donekonečna. Stránek je 2 130 a nabídky
   se obnovují čtyřikrát denně, takže bez stropu by to u někoho, kdo web
   používá denně, narostlo do stovek megabajtů. Cache API vrací klíče
   v pořadí vložení, takže se zahazuje od nejstaršího. */
const STROP = { [TRVALE]: 80, [DATA]: 40, [STRANKY]: 60 };

const OTISKOVANE = /^(?:css|js|vendor|fonts|assets)\//;

async function uklid(jmeno) {
  const strop = STROP[jmeno];
  if (!strop) return;
  const c = await caches.open(jmeno);
  const klice = await c.keys();
  for (let i = 0; i < klice.length - strop; i++) await c.delete(klice[i]);
}

/* Uloží se jen vlastní a úspěšná odpověď. „opaque" (cizí původ bez CORS)
   se neukládá: nedá se u ní poznat, jestli je to vůbec odpověď, nebo chyba. */
function uloziltelna(odpoved) {
  return !!odpoved && odpoved.ok && odpoved.type === 'basic';
}

async function zUlozisteNejdriv(zadost, jmeno) {
  const c = await caches.open(jmeno);
  const mam = await c.match(zadost);
  if (mam) return mam;
  const odpoved = await fetch(zadost);
  if (uloziltelna(odpoved)) { await c.put(zadost, odpoved.clone()); uklid(jmeno); }
  return odpoved;
}

async function zeSiteNejdriv(zadost, jmeno) {
  const c = await caches.open(jmeno);
  try {
    const odpoved = await fetch(zadost);
    if (uloziltelna(odpoved)) { await c.put(zadost, odpoved.clone()); uklid(jmeno); }
    return odpoved;
  } catch (e) {
    const mam = await c.match(zadost);
    if (mam) return mam;
    throw e;
  }
}

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  /* Cizí úložiště po starších verzích tohoto souboru se smažou, ať se
     nedrží místo, které už nikdo nečte. */
  const nase = new Set([TRVALE, DATA, STRANKY]);
  for (const k of await caches.keys()) if (!nase.has(k)) await caches.delete(k);
  await self.clients.claim();
})()));

self.addEventListener('fetch', (e) => {
  const zadost = e.request;
  if (zadost.method !== 'GET') return;               // bod 2 v hlavičce
  let u;
  try { u = new URL(zadost.url); } catch (err) { return; }
  if (u.origin !== self.location.origin) return;     // bod 1 v hlavičce

  const cesta = u.pathname.replace(/^\//, '');

  if (OTISKOVANE.test(cesta) && u.searchParams.has('v')) {
    e.respondWith(zUlozisteNejdriv(zadost, TRVALE));  // pravidlo A
    return;
  }
  if (/^data\/.+\.json$/.test(cesta) && !u.search) {
    e.respondWith(zeSiteNejdriv(zadost, DATA));       // pravidlo B
    return;
  }
  if (zadost.mode === 'navigate' && !u.search) {
    e.respondWith(zeSiteNejdriv(zadost, STRANKY));    // pravidlo C
    return;
  }
  /* Všechno ostatní (adresy s dotazem — bod 3, obrázky bez otisku, cokoli
     nového) jde přímo na síť a nikam se neukládá. Mlčet je tu správná
     odpověď: co se neuloží, nemůže zastarat. */
});
