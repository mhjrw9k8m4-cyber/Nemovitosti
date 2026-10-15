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

   MĚŘÍ SE VE DVOU PROFILECH, A TO JE DŮLEŽITĚJŠÍ, NEŽ VYPADÁ.
   Do 15. 10. se měřilo jen v okně 390 × 844 bez dotyku — tedy
   „telefon s myší", což je zařízení, které neexistuje. Pravidla za
   `@media (pointer: coarse)` a `(hover: none)` se v takovém kontextu
   NEVYHODNOTÍ, takže je tahle zkouška nikdy nesrovnala: naměřeno
   36 pravidel ve stylopisu, o kterých nic netvrdila. (Našlo se to
   jinde: pojistka na překryv ovladačů mapy prošla i se sabotovaným
   CSS, viz bod 3da v docs/co-chybi.md.) Profily jsou proto dva —
   telefon S DOTYKEM a monitor bez dotyku — a pokrývají obě větve
   každého takového dotazu i dvě šířky okna.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { BALIKY } from './rozdel-styly.mjs';

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
  'index.html',                           /* mapa — od 14. 10. má taky svůj balík */
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
  /* Páry (selektor, vlastnost) s `!important` — ty jediné přebijí
     atribut style, a čtou se z opravdových stylopisů té stránky,
     ne z naší představy o nich. */
  const DULEZ = [];
  for (const ss of Array.from(document.styleSheets)) {
    let korene; try { korene = ss.cssRules; } catch (e) { continue; }
    const chod = (pravidla) => {
      for (const pr of Array.from(pravidla)) {
        if (pr.style && pr.selectorText) {
          for (let i = 0; i < pr.style.length; i++) {
            const j = pr.style[i];
            if (pr.style.getPropertyPriority(j) === 'important') DULEZ.push([pr.selectorText, j]);
          }
        }
        if (pr.cssRules) chod(pr.cssRules);
      }
    };
    chod(korene);
  }
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
    /* VLASTNOST, KTEROU PRVKU NASTAVUJE SKRIPT DO ATRIBUTU style,
       NEŘÍKÁ O STYLOPISU NIC: v kaskádě vyhrává nad ním bez ohledu
       na to, co v něm stojí, takže vypočtená hodnota je stejná se
       zkráceným i s plným stylopisem — a kdykoli ji skript zrovna
       mění, rozejde se měření v čase, ne ve stylu.
       Našlo se to na úvodní stránce: Leaflet prolíná dlaždice tím, že
       jim po snímcích přepisuje `style.opacity` (0,675 · 0,925 · 0,93
       · 0,94 · 1 v jednom měření). Není to animace podle CSS, takže
       getAnimations() o ní neví.
       VÝJIMKA, bez které by to byla díra: deklarace s `!important`
       ve stylopisu atribut style PŘEBÍJÍ. Nestačí přitom hlídat jméno
       vlastnosti — `opacity:1 !important` tu je, ale jen na
       `header:focus-within`, takže na dlaždici mapy by to nic
       neznamenalo. Rozhoduje se tedy podle TOHO PRVKU: přeskočí se
       jen vlastnost, kterou žádné důležité pravidlo pasující na něj
       nevynucuje. */
    for (let i = 0; i < e.style.length; i++) {
      const j = e.style[i];
      let vynuceno = false;
      for (const [sel, vl] of DULEZ) {
        if (vl !== j) continue;
        try { if (e.matches(sel)) { vynuceno = true; break; } } catch (err) { vynuceno = true; break; }
      }
      if (!vynuceno) preskoc.add(j);
    }
    vynechano += preskoc.size;
    let cesta = e.tagName.toLowerCase();
    if (e.id) cesta += '#' + e.id;
    else if (e.className && typeof e.className === 'string') cesta += '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.');
    out.push({ cesta, hodnoty, preskoc: Array.from(preskoc) });
  }
  return { jmena, prvky: out, vynechano };
};

/* Který balík si stránka bere. Od 14. 10. nejsou balíky dva, ale
   čtyři (plný pro mapu, pozemek, region, zbytek) — zkouška proto
   nehlídá jedno jméno souboru, ale čte ho ze stránky. */
function balikStranky(stranka) {
  const html = fs.readFileSync(path.join(KOREN, stranka), 'utf8');
  const m = /href="(css\/[a-z]+\.min\.css)/.exec(html);
  return m ? m[1] : null;
}

async function zmer(page, stranka, plny, balik) {
  await page.unroute('**/css/*.min.css*').catch(() => {});
  if (plny) {
    await page.route('**/' + balik + '*', (r) =>
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
/* Profily, ve kterých se celé měření projede. Dotyk se MUSÍ zapnout
   výslovně: šířka okna o `pointer: coarse` nerozhoduje. */
const PROFILY = [
  { jmeno: 'telefon', viewport: { width: 390, height: 844 }, dotyk: true },
  { jmeno: 'monitor', viewport: { width: 1280, height: 900 }, dotyk: false },
];
async function kontext(profil) {
  const ctx = await browser.newContext(Object.assign(
    { viewport: profil.viewport, serviceWorkers: 'block' },
    profil.dotyk ? { isMobile: true, hasTouch: true, locale: 'cs-CZ' } : {}));
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
  return ctx;
}

/* Že se vůbec měří zkrácený stylopis, a ne omylem plný. */
pravda(`zástupci rodin stránek se našli (${STRANKY.length})`, STRANKY.length >= 10, `jen ${STRANKY.length}`);
/* Každý zkrácený balík musí být opravdu menší. Kdyby rozdělovač
   přestal dělit, soubory by tu dál byly — jen by v každém bylo
   všechno, a tahle zkouška by to jinak nepoznala. */
const PLNY_B = fs.statSync(path.join(KOREN, 'css', 'styles.min.css')).size;
/* SEZNAM BALÍKŮ SE NEPÍŠE NAZPAMĚŤ. Stálo tu ['zaklad','pozemek','region']
   — a `uvod` chybělo, takže jeho velikost (137 kB z 215) nikdo
   nekontroloval; pátý balík by se do seznamu taky nedostal sám.
   Jména se proto berou z rozdělovače. */
for (const b of BALIKY) {
  const c = path.join(KOREN, b.soubor);
  pravda(`${b.soubor} je aspoň o pětinu menší než plný stylopis`,
    fs.existsSync(c) && fs.statSync(c).size * 1.2 < PLNY_B,
    fs.existsSync(c) ? `${(fs.statSync(c).size / 1024).toFixed(1)} kB proti ${(PLNY_B / 1024).toFixed(1)} kB`
      : 'soubor neexistuje');
}

for (const profil of PROFILY) {
const ctx = await kontext(profil);
const page = await ctx.newPage();
for (const stranka of STRANKY) {
  const kde = `${stranka} (${profil.jmeno})`;
  const balik = balikStranky(stranka);
  if (!balik || balik === 'css/styles.min.css') {
    pravda(`${kde} si bere zkrácený stylopis`, false, `odkazuje na ${balik || 'nic'}`);
    continue;
  }
  const a = await zmer(page, stranka, false, balik);   /* zkrácený */
  const b = await zmer(page, stranka, true, balik);    /* plný */

  if (a.prvky.length !== b.prvky.length) {
    pravda(`${kde}: stejný strom`, false,
      `zkrácený ${a.prvky.length} prvků, plný ${b.prvky.length} — stránka se staví nestejně, měření nemá smysl`);
    continue;
  }
  if (a.prvky.length < 20) {
    pravda(`${kde}: je co měřit`, false, `jen ${a.prvky.length} prvků`);
    continue;
  }
  if (a.jmena.length !== b.jmena.length || a.jmena.length < 100) {
    pravda(`${kde}: měří se celý styl`, false,
      `vlastností ${a.jmena.length} / ${b.jmena.length}`);
    continue;
  }

  const celkem = a.prvky.length * a.jmena.length;
  pravda(`${kde}: animace nespolkly měření`
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
  pravda(`${kde}: ${a.prvky.length} prvků × ${a.jmena.length} vlastností stejně`,
    rozdily.length === 0, rozdily.join('\n      '));
}
await ctx.close();
}

await browser.close();
console.log('\nZkrácený stylopis se chová jako plný');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Rozdělení stylopisu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
