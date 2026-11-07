/* =====================================================================
   TŘI CESTY, KTERÉ MUSÍ FUNGOVAT: PŘIDAT INZERÁT, HLÍDÁNÍ, ZPRÁVY
   =====================================================================

   Proč zvlášť, když kontrola-spusteni.mjs živou databázi už osahává:
   ta se ptá „odpovídá databáze?" a „je nasazené SQL?". Tohle se ptá
   na něco jiného — „projde ČLOVĚK tou cestou až na konec?".

   Rozdíl není akademický. Zkoušky v prohlížeči (test-pridat 96
   kontrol, test-hlidani-prohlizec 73, test-zpravy) běží proti
   FALEŠNÉ Supabase a všechny procházejí. Prohlížečová polovina je
   tedy prokazatelně v pořádku. Co prokázané není, je serverová
   polovina NAŽIVO — a právě tam leží podezření: v databázi je nula
   inzerátů a majiteli se jeden přidat nepovedlo.

   NEJDŮLEŽITĚJŠÍ OTÁZKA JE „DOJDE POTVRZOVACÍ E-MAIL?". Zakládání
   inzerátu odmítne create_listing každému, kdo nemá potvrzenou
   adresu (supabase/listings-prvni-kontrola.sql). Když tedy Supabase
   potvrzovací e-mail neodešle, nemůže inzerát přidat NIKDO — a web
   přitom vypadá, že funguje. To je přesně ta tichá vada, kterou
   žádná zkouška proti falešnému serveru najít nemůže.

   CO TENHLE SKRIPT DĚLÁ SE ŽIVÝMI DATY: s přepínačem --zaloz-ucet
   založí jeden zkušební účet na adresu, která nikomu nepatří
   (zkouska+<čas>@parcelaka.cz — vlastní doména webu). Nic jiného
   nezapisuje: inzerát, zprávu ani hlídání nezakládá, protože na to
   je potřeba potvrzená adresa a potvrdit ji odsud nejde. U zbylých
   dvou cest se proto ptá jinak: jsou ty funkce a tabulky vůbec
   nasazené a odpovídají NEPŘIHLÁŠENÉMU tak, jak mají (tedy „musíte
   být přihlášeni", ne „neexistuje")?

   Spouští se ručně (.github/workflows/kontrola-cest.yml), ne podle
   hodin — zakládat účet každých šest hodin by byl nepořádek
   v databázi.
   ===================================================================== */

/* ADRESA A KLÍČ SE ČTOU Z js/config.js, NE ZE SECRETS.
   Je to týž veřejný klíč, který dostane každý návštěvník webu —
   secret by z něj neudělal tajemství, jen by přibylo místo, kde se
   ty dvě hodnoty můžou rozejít. Stejnou cestou je bere
   scripts/kontrola-spusteni.mjs (ř. 55–56). */
import { readFileSync } from 'node:fs';
import { fetchSLimitem } from './fetch-s-limitem.mjs';

const config = readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');
const ZAKLAD = ((/window\.PK_SUPABASE_URL\s*=\s*'([^']+)'/.exec(config) || [])[1] || '').replace(/\/+$/, '');
const KLIC = (/window\.PK_SUPABASE_KEY\s*=\s*'([^']*)'/.exec(config) || [])[1] || '';
const ZALOZIT_UCET = process.argv.includes('--zaloz-ucet');

if (!ZAKLAD || !KLIC) {
  console.log('::error::V js/config.js chybí PK_SUPABASE_URL nebo PK_SUPABASE_KEY.');
  process.exit(1);
}

let vad = 0, nezmereno = 0;
const nalezy = [];
const ANO = (t) => console.log('  ✓ ' + t);
const NE = (co, proc) => { vad++; nalezy.push(co + ': ' + proc); console.log('  ✕ ' + co + '\n      ' + proc); };
const NEVIM = (co, proc) => { nezmereno++; console.log('  ? ' + co + '\n      ' + proc); };

async function dotaz(cesta, volby = {}) {
  const r = await fetchSLimitem(ZAKLAD + cesta, {
    ...volby,
    headers: {
      apikey: KLIC,
      Authorization: 'Bearer ' + KLIC,
      'Content-Type': 'application/json',
      ...(volby.headers || {}),
    },
  });
  return { stav: r.status, telo: await r.text() };
}

const kus = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 200) || '(prázdné)';
/* „Funkce tam není" se pozná podle PostgRESTu, ne podle čísla stavu:
   404 umí vrátit i jiné věci a 400 umí vrátit i chybějící funkce. */
const NENI = (t) => /PGRST202|does not exist|Could not find the function|not found/i.test(t);

console.log('\nTŘI CESTY NAŽIVO — ' + ZAKLAD + '\n');

/* ---- 1. PŘIDAT INZERÁT -------------------------------------------- */
console.log('1) Přidat inzerát');

const ci = await dotaz('/rest/v1/rpc/create_listing', {
  method: 'POST',
  body: JSON.stringify({
    p_place: 'Zkouška', p_okres: 'Kolín', p_druh: null, p_parcel: null,
    p_area: 1000, p_price: 500000, p_lat: 50.02, p_lng: 15.2,
    p_description: null, p_contact: null, p_photos: [], p_features: null, p_access: null,
  }),
});
if (NENI(ci.telo)) {
  NE('create_listing není v databázi',
    'PostgREST tu funkci nenašel — pusťte supabase/00-vse.sql (workflow nasad-sql.yml). '
    + 'Dokud tam není, nepřidá inzerát nikdo. Odpověď ' + ci.stav + ': ' + kus(ci.telo));
} else if (/musíte být přihlášeni/i.test(ci.telo)) {
  ANO('create_listing je nasazená a nepřihlášeného odmítá správně');
} else if (ci.stav >= 200 && ci.stav < 300) {
  NE('create_listing pustila NEPŘIHLÁŠENÉHO',
    'funkce založila inzerát bez přihlášení — to je díra, ne vlastnost. Odpověď: ' + kus(ci.telo));
} else {
  NEVIM('create_listing', 'odpověděla ' + ci.stav + ': ' + kus(ci.telo));
}

/* ZÁSADNÍ: jde potvrzovací e-mail vůbec odeslat? Bez něj je
   zakládání inzerátu zavřené pro všechny, protože create_listing
   nepotvrzenou adresu odmítne. */
if (!ZALOZIT_UCET) {
  NEVIM('odchází potvrzovací e-mail?',
    'nespuštěno — chce to přepínač --zaloz-ucet (založí jeden zkušební účet)');
} else {
  const adresa = `zkouska+${Date.now()}@parcelaka.cz`;
  const su = await dotaz('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email: adresa, password: 'Zkouska-' + Date.now() }),
  });
  let j = null; try { j = JSON.parse(su.telo); } catch (e) { /* níž */ }

  if (su.stav >= 200 && su.stav < 300 && j && j.id && !j.confirmed_at && !j.email_confirmed_at) {
    ANO('registrace projde a Supabase potvrzovací e-mail přijal k odeslání (účet čeká na potvrzení)');
  } else if (su.stav >= 200 && su.stav < 300 && j && (j.confirmed_at || j.email_confirmed_at)) {
    NE('e-mail se nepotvrzuje',
      'účet vznikl rovnou potvrzený — adresu si tedy nikdo neověřuje a účet jde založit na cizí e-mail');
  } else if (/sending confirmation|sending email|smtp|rate limit|over_email_send_rate/i.test(su.telo)) {
    NE('potvrzovací e-mail NEODCHÁZÍ',
      'Supabase ho odmítl odeslat, takže adresu nemůže potvrdit nikdo — a bez potvrzené adresy '
      + 'create_listing zakládání odmítá. TOHLE zavírá přidávání inzerátů celému webu. '
      + 'Odpověď ' + su.stav + ': ' + kus(su.telo));
  } else {
    NEVIM('registrace', 'odpověděla ' + su.stav + ': ' + kus(su.telo));
  }
}

/* ---- 2. HLÍDÁNÍ ---------------------------------------------------- */
console.log('\n2) Hlídání');

const hl = await dotaz('/rest/v1/watch_subscriptions?select=id&limit=1');
if (NENI(hl.telo)) {
  NE('tabulka watch_subscriptions není v databázi',
    'bez ní se nemá kam uložit hlídání — pusťte supabase/00-vse.sql. Odpověď ' + hl.stav + ': ' + kus(hl.telo));
} else if (hl.stav === 200) {
  ANO('tabulka hlídání je nasazená a odpovídá');
} else {
  NEVIM('tabulka hlídání', 'odpověděla ' + hl.stav + ': ' + kus(hl.telo));
}

const ms = await dotaz('/rest/v1/rpc/my_searches', { method: 'POST', body: '{}' });
if (NENI(ms.telo)) {
  NE('my_searches není v databázi',
    'uložená hledání by se přihlášenému nenačetla. Odpověď ' + ms.stav + ': ' + kus(ms.telo));
} else {
  ANO('my_searches je nasazená (odpověď nepřihlášenému: ' + ms.stav + ')');
}

/* ---- 3. ZPRÁVY ----------------------------------------------------- */
console.log('\n3) Zprávy');

const zp = await dotaz('/rest/v1/messages?select=id&limit=1');
if (NENI(zp.telo)) {
  NE('tabulka messages není v databázi',
    'zprávy mezi lidmi by se neměly kam uložit — pusťte supabase/00-vse.sql. '
    + 'Odpověď ' + zp.stav + ': ' + kus(zp.telo));
} else {
  ANO('tabulka zpráv je nasazená (odpověď ' + zp.stav + ')');
}

const mt = await dotaz('/rest/v1/rpc/my_threads', { method: 'POST', body: '{}' });
if (NENI(mt.telo)) {
  NE('my_threads není v databázi',
    'seznam konverzací by se v zpravy.html nenačetl. Odpověď ' + mt.stav + ': ' + kus(mt.telo));
} else {
  ANO('my_threads je nasazená (odpověď nepřihlášenému: ' + mt.stav + ')');
}

/* ---- VERDIKT ------------------------------------------------------- */
console.log('');
if (vad) {
  console.log(`VERDIKT: ${vad} vad, ${nezmereno} nezměřeno.`);
  console.log('::error::Tři cesty naživo: ' + vad + ' vad. ' + nalezy.join(' | '));
  process.exit(1);
}
console.log(`VERDIKT: všechny tři cesty jsou nasazené. ${nezmereno} nezměřeno.`);
process.exit(0);
