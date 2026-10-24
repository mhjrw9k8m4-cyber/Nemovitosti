// Test: konec nabídky není konec adresy.
//
// Spuštění: node scripts/test-ukonceno.mjs   (nepotřebuje prohlížeč)
//
// Generátor stránek pozemků dřív stránky zmizelých nabídek MAZAL
// (fs.unlinkSync). Znělo to rozumně — web nemá slibovat pozemky, které
// už nikde nejsou — jenže smazaná stránka neřekne nic: vrátí 404.
// A protože se data obnovují čtyřikrát denně a stránek je přes 1 990,
// znamenalo to nepřetržitý proud mrtvých adres. Každý výsledek ve
// vyhledávači a každý uložený odkaz na dražbu, která mezitím skončila,
// končil na chybové stránce — u webu, jehož hlavní aktivum je přes
// 2 100 zaindexovaných adres.
//
// Test staví zkušební „osiřelou" stránku, pustí generátor a ověří celý
// cyklus: přepsání na ukončenou, neindexování, odkazy na podobné
// pozemky, a po uplynutí lhůty teprve smazání.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync,
  mkdtempSync, cpSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

/* PRACUJE SE V KOPII, NE V ŽIVÉM ADRESÁŘI.
   ==================================================================
   Tahle zkouška pouští generátor stránek pozemků, a ten přepíše všech
   2 116 stránek. V živém adresáři to mělo dva následky, oba nepříjemné:

     1. mezi generátorem a sazbou (sazba se v řetězu dělá AŽ POTOM)
        stránky na dvacet sekund neměly nezlomitelné mezery a od
        23. 10. ani hlavičku CSP. Dohánělo se to tím, že si zkouška
        pustila sazbu i csp.mjs sama — záplata na vlastní nepořádek,
        ne řešení;
     2. jakmile se rychlá sada začala pouštět paralelně
        (scripts/zkousky.mjs, čtyři naráz), padaly v tom okně
        test-cestina a test-stranky-pozemku na vadě, kterou
        nezpůsobily. Naměřeno hned při prvním paralelním běhu.

   Kopie to ruší v příčině: zkouška si sahá jen na své. Stojí to pár
   sekund na zkopírování 148 MB — a to je méně, než stálo vysvětlování,
   proč „čeština" padá, když se nic nezměnilo. */
const PRAVY_KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VYNECHAT = new Set([
  '.git', 'node_modules',
  path.join('assets', 'mobilenet'),      // model na rozpoznávání fotek, 5 MB
  path.join('assets', 'nsfw-model'),     // totéž, 2,7 MB
]);
const kopie = mkdtempSync(path.join(tmpdir(), 'parcelka-ukonceno-'));
cpSync(PRAVY_KOREN, kopie, {
  recursive: true,
  filter: (zdroj) => {
    const rel = path.relative(PRAVY_KOREN, zdroj);
    return rel === '' || !VYNECHAT.has(rel);
  },
});
const KOREN = kopie;
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Čtení strukturovaných dat ze stránky. Bloků může být víc (místo
   a drobečky zvlášť) a každý může nést pole i jediný objekt. */
function ldBloky(html) {
  const ven = [];
  for (const m of String(html).matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    let j; try { j = JSON.parse(m[1]); } catch (e) { continue; }
    ven.push(...(Array.isArray(j) ? j : [j]));
  }
  return ven;
}
function ldOffers(html) {
  const ven = [];
  const projdi = (x) => {
    if (Array.isArray(x)) { x.forEach(projdi); return; }
    if (!x || typeof x !== 'object') return;
    if (x['@type'] === 'Offer') ven.push(x);
    Object.keys(x).forEach((k) => projdi(x[k]));
  };
  projdi(ldBloky(html));
  return ven;
}
function ldPlaces(html) { return ldBloky(html).filter((x) => x && x['@type'] === 'Place'); }

/* Zkušební soubor musí mít v názvu SKUTEČNÝ okres, jinak se k němu
   nenajdou podobné pozemky a zkouška níž by mlčela o ničem. */
const vzor = readdirSync(KOREN).find((f) => /^pozemek-benesov-.+\.html$/.test(f));
const ZKOUSKA = 'pozemek-benesov-zkouskatestu-9q7k2x.html';
const cesta = path.join(KOREN, ZKOUSKA);

/* DVĚ RŮZNÉ VĚCI, DVĚ FUNKCE. `uklid()` maže zkušební stránku a volá
   se i NA ZAČÁTKU (ať po spadlém běhu nezůstane); kopie se maže až na
   konci. Napoprvé jsem to slil do jedné funkce — a zkouška si tím
   hned v prvním kroku smazala podklad pod rukama. */
function uklid() { try { if (existsSync(cesta)) unlinkSync(cesta); } catch (e) {} }
/* Kopie je v /tmp, takže by ji systém uklidil sám, ale nechávat po
   sobě 148 MB na každý běh je nepořádek, který se pozná teprve, až
   disk nestačí. */
function uklidKopii() { try { rmSync(kopie, { recursive: true, force: true }); } catch (e) {} }
process.on('exit', uklidKopii);
/* GENERÁTOR SE PUSTÍ V KOPII (viz hlavička souboru) a přepíše v ní
   všech 2 116 stránek pozemků. Dřív běžel v živém adresáři a zkouška
   si po něm musela sama dohánět sazbu i hlavičku CSP, aby na tom
   nepadly jiné zkoušky. Po přechodu na kopii to není potřeba:
   změřeno, že zkouška projde stejně (28 kontrol) a je o dva běhy
   generátorů kratší. Co se nemusí dohánět, se nemá dohánět. */
function generuj() {
  execFileSync(process.execPath, [path.join(KOREN, 'scripts', 'generate-parcel-pages.mjs')],
    { cwd: KOREN, stdio: 'ignore' });
}

function hotovo() {
  console.log('\nKonec nabídky není konec adresy');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  uklid();
  if (chyb) { console.log('::error::Ukončené nabídky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

try {
  pravda('našel se vzor skutečné stránky pozemku (jinak není co kopírovat)', !!vzor,
    'v kořeni není žádná pozemek-benesov-*.html');
  if (!vzor) hotovo();

  uklid();
  writeFileSync(cesta, readFileSync(path.join(KOREN, vzor), 'utf8'));
  pravda('zkušební osiřelá stránka vznikla', existsSync(cesta), cesta);

  /* MIGRACE SKRIPTŮ NA UKONČENÉ STRÁNCE — bez prohlížeče, na čisté funkci.
     Ukončená stránka se znovu nevyrábí z dat, jen se jí dohánějí přepisy,
     které musí platit všude. Jeden z nich vyměňuje blok skriptů. Dvě vady
     v něm se naměřily, obě na skutečných stránkách:

     1) Skript, který z předlohy ZMIZEL, tu zůstával navěky — „předloha ho
        nezná" platilo pro skript ručně přidaný i pro skript odebraný.
        Po odebrání kalkulačky návratnosti si o js/min/navratnost.js
        říkalo 94 ukončených stránek, a ten soubor na disku není.
     2) Jakmile se takový mrtvý skript vyjímal PŘED prvním skriptem
        předlohy, vložil se celý blok o jeho délku dál — na jedné stránce
        o 55 znaků, doprostřed komentáře. Tím `<!--` spolklo všech
        devatenáct skriptů a stránka nespustila vůbec nic. */
  {
    const { migrujSkripty } = await import('./generate-parcel-pages.mjs');
    const sablona = readFileSync(path.join(KOREN, 'pozemek.html'), 'utf8');
    const puvodni = readFileSync(cesta, 'utf8');
    const MRTVY = '<script src="js/min/tenhle-soubor-neexistuje.js?v=deadbeef"></script>\n';
    const PRVNI = (/<script src="js\/(?:min\/)?[A-Za-z0-9_-]+\.js(?:\?v=[A-Za-z0-9]+)?"[^>]*><\/script>\n/.exec(puvodni) || [''])[0];
    pravda('ve zkušební stránce se našel první skript předlohy', !!PRVNI,
      'bez něj není kam mrtvý skript postavit a kontroly níž by mlčely');

    const cista = migrujSkripty(sablona, puvodni);
    for (const [kde, h] of [
      ['před prvním skriptem předlohy', puvodni.replace(PRVNI, MRTVY + PRVNI)],
      ['za posledním skriptem předlohy', puvodni.replace(PRVNI, PRVNI + MRTVY)]
    ]) {
      const out = migrujSkripty(sablona, h);
      pravda(`mrtvý skript ${kde} jde pryč`, out.indexOf('tenhle-soubor-neexistuje') < 0,
        'zůstal — stránka si říká o soubor, který na disku není, a dostane 404');
      pravda(`a blok skriptů se vloží na totéž místo (${kde})`, out === cista,
        'výsledek se liší od běhu bez mrtvého skriptu — místo vložení se posunulo');
      const vKomentari = (out.match(/<!--[\s\S]*?-->/g) || []).filter((x) => x.indexOf('<script src="js/') >= 0);
      pravda(`žádný skript neskončil v komentáři (${kde})`, vKomentari.length === 0,
        `v komentáři uvízlo skriptů: ${vKomentari.length} — stránka by nespustila nic`);
    }

    /* A naopak: cizí skript, který NA DISKU JE, se nesmí vyhodit.
       Rozhoduje disk, ne předloha. */
    const ZIVY = 'js/min/dotaz.js';   // existuje, ale předloha pozemku ho nemá
    pravda('podmínka má smysl: zkušební cizí skript na disku opravdu je',
      existsSync(path.join(KOREN, ZIVY)), ZIVY + ' chybí — kontrola níž by mlčela o ničem');
    pravda('cizí skript, který existuje, zůstává',
      migrujSkripty(sablona, puvodni.replace(PRVNI, '<script src="' + ZIVY + '?v=deadbeef" data-cizi></script>\n' + PRVNI))
        .indexOf('data-cizi') >= 0,
      'vyhozen — ruční doplněk na jedné stránce by se tichounce ztrácel');
  }

  generuj();

  pravda('generátor ji NESMAZAL', existsSync(cesta),
    'stránka zmizelé nabídky se smazala — každý uložený odkaz na ni teď vrací 404');
  /* DŘÍV TU BYL throw. Při sabotáži (vrácené mazání) test spadl
     výjimkou dřív, než stihl cokoli vypsat — CI sice selhalo, ale
     bez zprávy, podle které se pozná proč. Zpráva je polovina testu. */
  if (!existsSync(cesta)) hotovo();

  const h = readFileSync(cesta, 'utf8');
  pravda('nese datum ukončení', /window\.PK_UKONCENO="\d{4}-\d{2}-\d{2}"/.test(h),
    'bez data se nedá poznat, kdy ji po lhůtě smazat');
  pravda('vyhledávačům se neindexuje, ale odkazy sleduje',
    /<meta name="robots" content="noindex,follow">/.test(h),
    'dražba, která skončila, nemá hledajícímu co nabídnout');
  pravda('má pruh s vysvětlením', /class="pz-konec"/.test(h), 'pruh chybí');
  /* MEZERA V DATU MŮŽE BÝT NEZLOMITELNÁ. Tahle kontrola hlídá, že
     datum je psané lidsky („14. 10. 2026"), ne strojově
     („2026-10-14") — a od 14. 10. sazba mezery v datu mění na
     nezlomitelné, aby se datum nelámalo přes řádek. Zápis pro lidi
     to zůstává; kdyby tu stála jen obyčejná mezera, zkouška by
     hlásila chybu za typografickou opravu. */
  pravda('datum je psané pro lidi, ne pro stroje',
    /\d{1,2}\.[ \u00a0]\d{1,2}\.[ \u00a0]\d{4}/.test(h)
    && !/Zmizela ze zdroje \d{4}-\d{2}-\d{2}/.test(h),
    'na stránce stojí strojový zápis data');

  const pruh = (/<div class="pz-konec"[\s\S]*?(?=<article|<\/div>\s*<script)/.exec(h) || [''])[0];
  const odkazu = (pruh.match(/<a href=/g) || []).length;
  pravda('nabízí podobné pozemky v témže okrese i cestu na mapu', odkazu >= 2,
    `odkazů v pruhu ${odkazu} — kdo sem přijde, nemá kam jít dál`);

  pravda('a ze sitemapy vypadla',
    !readFileSync(path.join(KOREN, 'sitemap.xml'), 'utf8').includes(ZKOUSKA),
    'ukončená nabídka zůstala v mapě webu');

  /* STROJOVÁ DATA MUSÍ ŘÍKAT TOTÉŽ JAKO TEN PRUH. Pruh říká „už není
     aktuální", ale ve strukturovaných datech zůstávalo
     availability: InStock — strojové tvrzení, že nabídka platí.
     Naměřeno: 7 ze 127 ukončených stránek to tvrdilo. */
  {
    const nabidky = ldOffers(h);
    pravda('ukončená stránka má v datech nabídku, na které se to dá měřit',
      nabidky.length > 0, 'žádný Offer v ld+json — kontroly níž by měřily nic');
    pravda('a ta nabídka hlásí OutOfStock, ne InStock',
      nabidky.every((o) => o.availability === 'https://schema.org/OutOfStock'),
      'availability: ' + nabidky.map((o) => o.availability || '—').join(', '));
    pravda('a cena má napsané, do kdy platila',
      nabidky.every((o) => /^\d{4}-\d{2}-\d{2}$/.test(String(o.priceValidUntil || ''))),
      'priceValidUntil: ' + nabidky.map((o) => o.priceValidUntil || '—').join(', '));
    const misto = ldPlaces(h);
    pravda('a popis pro stroje začíná tím, že nabídka není aktuální',
      misto.every((m) => typeof m.description !== 'string'
        || m.description.indexOf('Nabídka už není aktuální.') === 0),
      misto.map((m) => String(m.description || '').slice(0, 60)).join(' | '));
  }

  // Druhý běh nesmí pruh zdvojit.
  generuj();
  const h2 = readFileSync(cesta, 'utf8');
  pravda('druhý běh pruh nezdvojí', (h2.match(/class="pz-konec"/g) || []).length === 1,
    'pruhů: ' + (h2.match(/class="pz-konec"/g) || []).length);
  pravda('a ani větu o neaktuálnosti v datech',
    ldPlaces(h2).every((m) => (String(m.description || '').match(/Nabídka už není aktuální\./g) || []).length <= 1),
    'věta se zdvojila: ' + ldPlaces(h2).map((m) => String(m.description || '').slice(0, 70)).join(' | '));

  // Po lhůtě se teprve maže doopravdy.
  writeFileSync(cesta, h2.replace(/window\.PK_UKONCENO="[^"]*"/, 'window.PK_UKONCENO="2000-01-01"'));
  generuj();
  pravda('po uplynutí lhůty se smaže doopravdy', !existsSync(cesta),
    'stránka stará přes 90 dnů zůstala — web by rostl donekonečna');
} finally {
  uklid();
}

/* ---- A TOTÉŽ NA CELÉM HOTOVÉM STROMU ------------------------------
   Nasazená stránka výš ověří cestu „nabídka právě skončila". Stránky,
   které skončily DŘÍV než se pravidlo zavedlo, chodí jinou cestou
   (migrace v generátoru), a právě tam zůstávalo sedm stránek tvrdících
   InStock. Měří se obojí: že ukončené hlásí OutOfStock a že se to
   přitom nerozlilo na živé. */
{
  let ukoncenych = 0, zivych = 0;
  const zleUkoncene = [], zleZive = [];
  for (const f of readdirSync(KOREN)) {
    if (!/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)) continue;
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    if (h.indexOf('window.PK_POZEMEK=') < 0) continue;
    /* ROZLIŠUJE SE PODLE ZNAČKY, NE PODLE VZHLEDU. Dřív tu stálo
       `class="pz-konec"` — jenže týž pruh nosí i stránka, jejíž
       pozemek se jen přestěhoval na jinou adresu (opravilo se jméno
       obce, viz prestehovanaStranka). Ta musí hlásit InStock, protože
       pozemek je dál v nabídce; kontrola ji proto brala za ukončenou
       a hlásila šestnáct chyb za správná data. */
    const presun = /window\.PK_PRESUNUTO="\d{4}-\d{2}-\d{2}"/.test(h);
    const konec = /window\.PK_UKONCENO="\d{4}-\d{2}-\d{2}"/.test(h);
    const nabidky = ldOffers(h);
    if (presun && !konec) {
      /* Přestěhovaná: pozemek platí dál, takže InStock je tu pravda. */
      if (nabidky.some((o) => o.availability === 'https://schema.org/OutOfStock')) zleZive.push(f + ' (rozcestí)');
      continue;
    }
    if (konec) {
      ukoncenych++;
      if (nabidky.some((o) => o.availability && o.availability !== 'https://schema.org/OutOfStock')) {
        zleUkoncene.push(f + ' → ' + nabidky.map((o) => o.availability).join(','));
      }
    } else {
      zivych++;
      if (nabidky.some((o) => o.availability === 'https://schema.org/OutOfStock')) zleZive.push(f);
      if (ldPlaces(h).some((m) => String(m.description || '').indexOf('Nabídka už není aktuální.') === 0)) {
        zleZive.push(f + ' (popis)');
      }
    }
  }
  pravda('ukončených i živých stránek je dost, aby to něco znamenalo',
    ukoncenych >= 20 && zivych >= 500, `ukončených ${ukoncenych}, živých ${zivych}`);
  pravda('ani jedna ukončená stránka strojově netvrdí, že nabídka platí',
    zleUkoncene.length === 0, zleUkoncene.slice(0, 4).join(' | '));
  pravda('a žádné živé stránce se to pravidlo nerozlilo',
    zleZive.length === 0, zleZive.slice(0, 4).join(' | '));
}

hotovo();
