/* Test: zkrácený stylopis vypadá bajt na bajt stejně jako plný.
   ==================================================================
   Spuštění: node scripts/test-rozdeleni-stylu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   scripts/rozdel-styly.mjs vyjímá ze stylopisu pravidla, o kterých
   STATICKY tvrdí, že na stránce bez mapy zabrat nemohou. Takové
   tvrzení si nestačí odvodit — to by se kontrolovalo samo sebou.
   Proto se tady měří následek, a to tím nejsurovějším způsobem:

     stránka se otevře DVAKRÁT, pokaždé jinak nastylovaná
       A) zkrácený stylopis (to, co si opravdu vezme návštěvník),
       B) plný stylopis (stejný soubor, jen podstrčený přes route),
     a u KAŽDÉHO prvku se porovná CELÝ vypočtený styl — všech ~340
     vlastností, jak je vrátí getComputedStyle. Jediný rozdíl = chyba.

   Proč to nejde ošidit:
     • porovnává se počet prvků (jinak by prázdná stránka prošla),
     • porovnává se počet vlastností na prvek (jinak by prošla
       nula vlastností),
     • u nálezu se dopočítá, KTERÁ vlastnost a jaké dvě hodnoty,
       takže hlášení ukazuje příčinu, ne jen „liší se".

   Co to NEPOKRÝVÁ: stavy, které vzniknou až klikáním (otevřené okno
   hlídání, :hover). Pravidla pro ně se v základu nechávají, protože
   do tokenů stránky se počítají i všechna slova z jejích skriptů —
   třída, kterou skript někde v textu zmiňuje, se nevyjímá.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

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

/* Zástupci všech rodin stránek bez mapy. Kdyby se rozdělení pokazilo,
   pokazí se nejspíš u té, která má nejvíc vlastního vzhledu. */
const STRANKY = [
  'pozemek-benesov-benesov-rsg5bb.html',  /* detail pozemku (2 054 stránek) */
  'pozemky-okres-tabor.html',             /* okresní rozcestník (99 stránek) */
  'pozemky-jihocesky-kraj.html',          /* krajský rozcestník */
  'cena-pozemku.html',                    /* obsahová stránka s grafem */
  'kontakt.html',                         /* obsahová stránka s formulářem */
  'muj-inzerat.html',                     /* účet */
  'hlidani.html',                         /* účet */
  'zpravy.html',                           /* účet */
  'pridat.html',                          /* nejdelší formulář na webu */
  'porovnani.html',                       /* tabulky */
  'kupni-smlouva-pozemek.html',           /* rádce */
  'drazby-pozemku-nabidky.html',          /* výpis z dat */
].filter((f) => fs.existsSync(path.join(KOREN, f)));

const PLNY = fs.readFileSync(path.join(KOREN, 'css', 'styles.min.css'), 'utf8');

/* Posbírá u každého prvku celý vypočtený styl. Vrací cestu v DOM
   (ať je v hlášení vidět, o co jde) a hodnoty v pevném pořadí. */
const SBER = () => {
  const prvky = Array.from(document.querySelectorAll('*'))
    .filter((e) => !/^(SCRIPT|STYLE|META|LINK|TITLE|HEAD)$/.test(e.tagName));
  const vzor = getComputedStyle(document.body);
  const jmena = [];
  for (let i = 0; i < vzor.length; i++) jmena.push(vzor[i]);
  jmena.sort();
  const kebab = (j) => j.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const out = [];
  let vynechano = 0;
  for (const e of prvky) {
    const s = getComputedStyle(e);
    const hodnoty = jmena.map((j) => s.getPropertyValue(j));
    /* Běžící animace hýbe hodnotou mezi dvěma snímky: čekací kolečko má
       při každém načtení jiný úhel otočení. Takové vlastnosti se neporovnávají —
       ale JEN ty, které ta animace opravdu hýbe, a je jich vidět počet. */
    const animovane = [];
    try {
      for (const a of e.getAnimations()) {
        const ram = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
        for (const r of ram) for (const k of Object.keys(r)) {
          if (k === 'offset' || k === 'computedOffset' || k === 'easing' || k === 'composite') continue;
          animovane.push(kebab(k));
        }
      }
    } catch (err) { /* getAnimations nemusí být – pak se porovná všechno */ }
    const preskoc = new Set(animovane);
    vynechano += preskoc.size;
    let cesta = e.tagName.toLowerCase();
    if (e.id) cesta += '#' + e.id;
    else if (e.className && typeof e.className === 'string') cesta += '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.');
    out.push({ cesta, hodnoty, preskoc: Array.from(preskoc) });
  }
  return { jmena, prvky: out, vynechano };
};

async function zmer(page, stranka, plny) {
  await page.unroute('**/css/zaklad.min.css*').catch(() => {});
  if (plny) {
    await page.route('**/css/zaklad.min.css*', (r) =>
      r.fulfill({ status: 200, contentType: 'text/css', body: PLNY }));
  }
  await page.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await page.waitForTimeout(900);
  return page.evaluate(SBER);
}

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});
/* Servisní pracovník MUSÍ být vypnutý. Jinak si první načtení uloží
   zkrácený stylopis do mezipaměti a druhé načtení dostane TOTÉŽ —
   podstrčení plného stylopisu přes route se k němu nedostane a
   kontrola je zeleně slepá. (Vyzkoušeno sabotáží: s pracovníkem
   prošlo i vyjmutí všech pravidel pro .wrap.) */
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  serviceWorkers: 'block',
});
/* PÍSMA SE V OBOU NAČTENÍCH ZAHAZUJÍ — jinak tahle zkouška neměří
   stylopis, ale časování.
   Od přechodu na `font-display: optional` (viz bod 3v v docs/co-chybi.md)
   platí, že vlastní písmo se použije jen tehdy, když dojede do asi
   100 ms od začátku vykreslování. To je u každého načtení jinak, takže
   se stávalo, že jedno načtení vykreslilo Interem a druhé záložním
   písmem — a šířky textu se rozešly o desetiny pixelu. V CI to spadlo
   na `zpravy.html`: „a.btn-primary.header-cta: inline-size = 74px
   zkrácený / 73.4531px plný". Se stylopisem to nemělo nic společného.
   Zahozením obou souborů woff2 kreslí obě načtení týmž záložním
   písmem. Rozdíl ve stylopisu to nezakryje: kdyby zkrácený stylopis
   přišel o @font-face nebo o font-family, vlastnost `font-family` se
   v porovnání rozejde jako kterákoli jiná. */
await ctx.route('**/*.woff2', (r) => r.abort());
const page = await ctx.newPage();

/* Že se vůbec měří zkrácený stylopis, a ne omylem plný. */
pravda(`zástupci rodin stránek se našli (${STRANKY.length})`, STRANKY.length >= 10, `jen ${STRANKY.length}`);
pravda('zkrácený stylopis je menší než plný',
  fs.statSync(path.join(KOREN, 'css', 'zaklad.min.css')).size * 1.2
    < fs.statSync(path.join(KOREN, 'css', 'styles.min.css')).size,
  'zaklad.min.css není ani o pětinu menší — rozdělení nic nedělá');

for (const stranka of STRANKY) {
  const html = fs.readFileSync(path.join(KOREN, stranka), 'utf8');
  if (!/href="css\/zaklad\.min\.css/.test(html)) {
    pravda(`${stranka} si bere zkrácený stylopis`, false, 'odkazuje na něco jiného');
    continue;
  }
  const a = await zmer(page, stranka, false);   /* zkrácený */
  const b = await zmer(page, stranka, true);    /* plný */

  if (a.prvky.length !== b.prvky.length) {
    pravda(`${stranka}: stejný strom`, false,
      `zkrácený ${a.prvky.length} prvků, plný ${b.prvky.length} — stránka se staví nestejně, měření nemá smysl`);
    continue;
  }
  if (a.prvky.length < 20) {
    pravda(`${stranka}: je co měřit`, false, `jen ${a.prvky.length} prvků`);
    continue;
  }
  if (a.jmena.length !== b.jmena.length || a.jmena.length < 100) {
    pravda(`${stranka}: měří se celý styl`, false,
      `vlastností ${a.jmena.length} / ${b.jmena.length}`);
    continue;
  }

  const celkem = a.prvky.length * a.jmena.length;
  pravda(`${stranka}: animace nespolkly měření`
    + ` (vynecháno ${a.vynechano + b.vynechano} z ${2 * celkem} hodnot)`,
    a.vynechano + b.vynechano < celkem / 50,
    `vynecháno ${a.vynechano + b.vynechano} z ${2 * celkem} — to už není výjimka`);

  const rozdily = [];
  for (let i = 0; i < a.prvky.length && rozdily.length < 6; i++) {
    const x = a.prvky[i], y = b.prvky[i];
    const preskoc = new Set([...x.preskoc, ...y.preskoc]);
    for (let j = 0; j < a.jmena.length; j++) {
      if (x.hodnoty[j] === y.hodnoty[j]) continue;
      if (preskoc.has(a.jmena[j])) continue;
      rozdily.push(`${x.cesta}: ${a.jmena[j]} = „${x.hodnoty[j]}" zkrácený / „${y.hodnoty[j]}" plný`);
      break;
    }
  }
  pravda(`${stranka}: ${a.prvky.length} prvků × ${a.jmena.length} vlastností stejně`,
    rozdily.length === 0, rozdily.join('\n      '));
}

await browser.close();
console.log('\nZkrácený stylopis se chová jako plný');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Rozdělení stylopisu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
