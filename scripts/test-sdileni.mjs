#!/usr/bin/env node
/* NÁHLED ODKAZU PATŘÍ K VLASTNÍ STRÁNCE
   ------------------------------------------------------------------
   Značky pro sdílení (og:*, twitter:*) nikdo na webu neuvidí. Projeví se
   teprve tam, kde web není: v chatu, v e-mailu, na sociální síti. Proto
   se vada v nich pozná nejpozději ze všech — a přitom je vidět přesně ve
   chvíli, kdy někdo odkaz posílá dál, tedy v tom nejdražším okamžiku.

   Takhle vznikla: data.html se generuje z moje-data.html jako předlohy.
   Generátor přepisoval <title>, popis a canonical — ale og:* ne. Stránka
   o datech tedy do náhledu hlásila „Moje data" a adresu moje-data.html.
   A moje-data.html samo mělo twitter:title z porovnani.html, protože
   vzniklo zkopírováním té stránky. Jedna chyba zkopírovaná dvakrát.

   Kontroluje se trojí:
     1. že se adresa v og:url jmenuje jako vlastní soubor (a souhlasí
        s canonical),
     2. že stránka, která se smí indexovat, značky vůbec má,
     3. že si nepůjčila titulek nebo popis od JINÉ stránky webu.

   Bod 3 se dělá jen na RUČNĚ psaných stránkách: generované stránky
   pozemků mají titulek složený z druhu, výměry a místa a dvě různé
   nabídky ve stejné obci mohou mít shodný — tam by se z kontroly stal
   falešný poplach. Adresa (bod 1) se naopak kontroluje všude, protože
   ta je u každé stránky jiná vždycky. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const JE_POZEMEK = /^pozemek-.+-[0-9a-z]{5,8}\.html$/;
const znacka = (s, re) => { const m = re.exec(s); return m ? m[1] : null; };

const vse = [];
for (const f of fs.readdirSync(ROOT).filter((x) => x.endsWith('.html')).sort()) {
  const s = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const druh = JE_POZEMEK.test(f) ? 'pozemek'
    : f.startsWith('pozemky-okres-') ? 'okres'
      : f.endsWith('-kraj.html') ? 'kraj' : 'ruční';
  vse.push({
    f,
    druh,
    titulek: znacka(s, /<title>([^<]*)<\/title>/),
    popis: znacka(s, /<meta name="description" content="([^"]*)"/),
    ogTitulek: znacka(s, /<meta property="og:title" content="([^"]*)"/),
    ogPopis: znacka(s, /<meta property="og:description" content="([^"]*)"/),
    ogUrl: znacka(s, /<meta property="og:url" content="([^"]*)"/),
    twTitulek: znacka(s, /<meta name="twitter:title" content="([^"]*)"/),
    canonical: znacka(s, /<link rel="canonical" href="([^"]*)"/),
    robots: znacka(s, /<meta name="robots" content="([^"]*)"/) || '',
    ogObrazek: znacka(s, /<meta property="og:image" content="([^"]*)"/),
    twObrazek: znacka(s, /<meta name="twitter:image" content="([^"]*)"/),
  });
}
const rucni = vse.filter((z) => z.druh === 'ruční');

/* Nejdřív se ověří, že je vůbec co měřit. Kdyby se někdy změnila
   podoba značek nebo se stránky přesunuly do podadresáře, kontroly níž
   by prošly na prázdnu — a mlčící kontrola je horší než žádná. */
pravda(`našly se stránky (${vse.length} celkem, z toho ${rucni.length} ručních)`,
  vse.length > 1500 && rucni.length >= 30, `celkem ${vse.length}, ručních ${rucni.length}`);
pravda('a mají značky pro sdílení (jinak se nic nekontroluje)',
  vse.filter((z) => z.ogUrl).length > 1500, `og:url má jen ${vse.filter((z) => z.ogUrl).length}`);

/* 1. Adresa v náhledu ukazuje na vlastní stránku.
   POROVNÁVÁ SE POSLEDNÍ ÚSEK CESTY, ne konec textu: „…/moje-data.html"
   KONČÍ na „data.html", takže s endsWith by vada v data.html prošla.
   Právě tak jsem si první verzi téhle kontroly rozbil. */
const uzel = (u) => String(u || '').replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop();
const jinam = vse.filter((z) => z.ogUrl && uzel(z.ogUrl) !== (z.f === 'index.html' ? 'www.parcelaka.cz' : z.f));
pravda('og:url každé stránky ukazuje na ni samu',
  jinam.length === 0,
  `${jinam.length} stránek ukazuje jinam: ` + jinam.slice(0, 4).map((z) => `${z.f} → ${uzel(z.ogUrl)}`).join(', '));

const rozpor = vse.filter((z) => z.ogUrl && z.canonical && z.ogUrl !== z.canonical);
pravda('og:url a canonical se nerozcházejí',
  rozpor.length === 0,
  `${rozpor.length} stránek: ` + rozpor.slice(0, 3).map((z) => `${z.f} (${z.ogUrl} vs ${z.canonical})`).join(', '));

/* 2. Co se smí indexovat, má mít náhled. Stránky s noindex (404,
   diagnostika, předloha) se nesdílejí a značky mít nemusí. */
const indexovane = vse.filter((z) => !/noindex/.test(z.robots));
const bezZnacek = indexovane.filter((z) => !z.ogTitulek || !z.ogPopis || !z.ogUrl || !z.twTitulek);
pravda(`indexovaná stránka má náhled celý (${indexovane.length} indexovaných)`,
  bezZnacek.length === 0,
  `${bezZnacek.length} bez úplného náhledu: ` + bezZnacek.slice(0, 4).map((z) => z.f).join(', '));

/* 2a. OBRÁZEK V NÁHLEDU MUSÍ EXISTOVAT.
   Je to nejtišší vada ze všech: na webu se obrázek pro sdílení nikde
   neukazuje, takže překlep v názvu souboru se pozná teprve tak, že
   odkaz poslaný do zprávy přijde bez obrázku. A protože generátor sahá
   po `assets/og/<jméno>.png` a při chybějícím souboru mlčky použije
   společný og.png, nepozná se ani to, že se zamýšlený obrázek
   nepoužívá — jen bude celý web ve zprávách vypadat stejně. */
{
  const naSoubor = (u) => {
    const m = /^https:\/\/www\.parcelaka\.cz\/(.+?)(?:[?#].*)?$/.exec(String(u || ''));
    return m ? m[1] : null;
  };
  const obrazky = new Map();
  for (const z of vse) {
    for (const u of [z.ogObrazek, z.twObrazek]) {
      const rel = naSoubor(u);
      if (rel) obrazky.set(rel, (obrazky.get(rel) || 0) + 1);
    }
  }
  pravda(`náhledové obrázky se našly (${obrazky.size} různých)`, obrazky.size >= 10,
    `různých obrázků ${obrazky.size} — při jednom by to znamenalo, že si je stránky nerozlišují`);
  const chybi = [...obrazky.keys()].filter((rel) => !fs.existsSync(path.join(ROOT, rel)));
  pravda('každý náhledový obrázek v repozitáři existuje', chybi.length === 0,
    chybi.slice(0, 5).join(', '));
  /* A pojistka na druhou stranu: obrázek, který existuje, ale na který
     neodkazuje ani jedna stránka, je zbytečný kus v repozitáři. */
  const vAssets = fs.existsSync(path.join(ROOT, 'assets', 'og'))
    ? fs.readdirSync(path.join(ROOT, 'assets', 'og')).filter((x) => x.endsWith('.png')) : [];
  const osirele = vAssets.filter((x) => !obrazky.has('assets/og/' + x));
  pravda(`žádný vyrobený náhled neleží ladem (${vAssets.length} v assets/og)`,
    osirele.length === 0,
    `${osirele.length} bez odkazu: ` + osirele.slice(0, 5).join(', '));
}

/* 2b. CO SE SMÍ INDEXOVAT, MÁ BÝT V MAPĚ WEBU.
   Seznam ručních stránek v sitemap.xml se píše rukou (scripts/
   generate-region-pages.mjs, staticUrls) — a ruční seznam se dá
   přehlédnout. Přesně to se stalo s data.html: stránka indexovatelná,
   odkazovaná z patičky všech 33 stránek, a v mapě webu nebyla, takže
   vyhledávač ji měl najít jen náhodou.
   Generované stránky (okresy, kraje, druhy, pozemky) se do mapy
   přidávají cyklem, ty hlídá test-stranky-pozemku.mjs; tady jde o ty
   ručně psané. Výjimky se píšou s důvodem, ne mlčením. */
const VMAPE_NE = new Map([
  ['pozemek.html', 'prázdná skořápka: obsah dodá až ?p=… z mapy a canonical '
    + 'ukazuje na sebe bez parametrů. V mapě webu by to byla stránka bez obsahu. '
    + 'Vlastní adresu má každý pozemek ve svém pozemek-*.html.'],
]);
{
  const mapa = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  const vMape = new Set([...mapa.matchAll(/<loc>https:\/\/www\.parcelaka\.cz\/([^<]*)<\/loc>/g)]
    .map((m) => m[1] || 'index.html'));
  pravda(`mapa webu se přečetla (${vMape.size} adres)`, vMape.size > 100, `adres ${vMape.size}`);
  const chybi = rucni
    .filter((z) => !/noindex/.test(z.robots))
    .filter((z) => !vMape.has(z.f) && !VMAPE_NE.has(z.f))
    .map((z) => z.f);
  pravda('každá indexovatelná ruční stránka je v mapě webu',
    chybi.length === 0, `${chybi.length} chybí: ` + chybi.slice(0, 5).join(', '));
  const vyjimkaNavic = [...VMAPE_NE.keys()].filter((f) => vMape.has(f));
  pravda('a výjimka se nepíše na stránku, která v mapě je',
    vyjimkaNavic.length === 0, vyjimkaNavic.join(', '));
  const vyjimkaNeexistuje = [...VMAPE_NE.keys()].filter((f) => !rucni.some((z) => z.f === f));
  pravda('a ani na stránku, která neexistuje',
    vyjimkaNeexistuje.length === 0, vyjimkaNeexistuje.join(', '));
}

/* 3. Vypůjčený titulek nebo popis od jiné stránky. */
const jadro = (t) => String(t || '').replace(/\s*[|—–-]\s*Parcelka\s*$/, '').trim().toLowerCase();
function pujcene(stranky) {
  const podleTitulku = new Map();
  const podlePopisu = new Map();
  for (const z of stranky) {
    if (z.titulek) podleTitulku.set(jadro(z.titulek), z.f);
    if (z.popis) podlePopisu.set(z.popis, z.f);
  }
  const nalez = [];
  for (const z of stranky) {
    for (const [pole, hodnota] of [['og:title', z.ogTitulek], ['twitter:title', z.twTitulek]]) {
      if (!hodnota || jadro(hodnota) === jadro(z.titulek)) continue;
      const kdo = podleTitulku.get(jadro(hodnota));
      if (kdo && kdo !== z.f) nalez.push(`${z.f}: ${pole} je titulek ${kdo} („${hodnota}")`);
    }
    if (z.ogPopis && z.ogPopis !== z.popis) {
      const kdo = podlePopisu.get(z.ogPopis);
      if (kdo && kdo !== z.f) nalez.push(`${z.f}: og:description je popis ${kdo}`);
    }
  }
  return nalez;
}
const pujcky = pujcene(rucni);
pravda('žádná ruční stránka nemá v náhledu titulek nebo popis jiné stránky',
  pujcky.length === 0, pujcky.slice(0, 4).join('; '));

/* A pojistka na kontrolu samu: na vymyšlené dvojici musí vada vyjít.
   Bez ní by stačilo, aby se `jadro()` rozsypalo, a bod 3 by mlčel. */
const zkouska = pujcene([
  { f: 'a.html', titulek: 'Alfa | Parcelka', popis: 'popis A', ogTitulek: 'Beta | Parcelka', twTitulek: 'Alfa — Parcelka', ogPopis: 'popis A' },
  { f: 'b.html', titulek: 'Beta | Parcelka', popis: 'popis B', ogTitulek: 'Beta | Parcelka', twTitulek: 'Beta — Parcelka', ogPopis: 'popis B' },
]);
pravda('kontrola vypůjčeného titulku na zkušební dvojici vadu najde (jinak nic neměří)',
  zkouska.length === 1 && zkouska[0].startsWith('a.html'),
  'na zkušební dvojici našla: ' + JSON.stringify(zkouska));

console.log('\nNáhled odkazu patří k vlastní stránce');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Sdílení: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
