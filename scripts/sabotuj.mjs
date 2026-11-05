#!/usr/bin/env node
/* SABOTÁŽNÍ STROJ — AŤ SI HLÍDAČE PROKÁŽE STROJ SÁM
   ==================================================================
   Spuštění:
     node scripts/sabotuj.mjs test-uzsvm.mjs        prokáže jednu zkoušku
     node scripts/sabotuj.mjs --strop=3 test-…      nejvýš tři sabotáže
     node scripts/sabotuj.mjs --vypis test-…        jen vypíše, co by zkusil

   PROČ. Pravidlo z CLAUDE.md je jasné: každý nový hlídač se prokáže
   SABOTÁŽÍ — rozbije se měřená věc a hlídač to musí chytit. Dělal jsem
   to ručně a §369 ukázal, co to stojí: dvě sabotáže byly PRÁZDNÉ
   (záplata se nenašla, soubor se nezměnil) a já si je odškrtl jako
   „hlídač nedrží". Zeleně přitom svítilo něco, co se nikdy nezměřilo.

   Dnes se to stalo ještě dvakrát jinak: sabotáž proběhla, soubor se
   změnil — a zkouška přesto prošla, protože měla slepé místo (fixtura
   bez adresy rozhodovala místo verdiktu; vyřazení zapojených zdrojů má
   dvě větve a měřila se jedna). Obojí je nález o ZKOUŠCE, ne o kódu.

   Tenhle stroj dělá týž postup, jen bez mojí nepozornosti:
     1. vybere soubor, který zkouška hlídá (podle jejích importů),
     2. vyrobí seznam MECHANICKÝCH sabotáží (obrátí porovnání, zahodí
        pojistku, posune konstantu, zruší `filter(Boolean)`, zamění
        `&&` za `||`),
     3. každou zvlášť zapíše, OVĚŘÍ DIFFEM, že se soubor opravdu
        změnil, pustí zkoušku a soubor vrátí z gitu,
     4. zapíše, co zkouška chytila a co ne.

   CO NEUMÍ A NEPŘEDSTÍRÁ. Mechanická sabotáž není promyšlená: nerozumí
   tomu, co kód znamená, takže umí vyrobit i nesmysl, který spadne na
   syntaxi (to se počítá jako „nepoužitelná", ne jako „chycená").
   Nenahrazuje sabotáž promyšlenou — ukazuje SLEPÁ MÍSTA: hlídače,
   kteří nechytí ani obrácené porovnání, a to je nález sám pro sebe.

   ŠEST POJISTEK, PROTOŽE TENHLE STROJ PÍŠE DO ZDROJE:
     1. Jen `scripts/*.mjs` a `js/*.js`. Nikdy data, nikdy generované
        stránky, nikdy workflow.
     2. Jen nad ČISTÝM souborem. Když má soubor rozdělanou změnu,
        sabotáž se nespustí — jinak by se vracelo cizí.
     3. Vrací se z gitu (`git show HEAD:soubor`), ne z paměti.
     4. Po každé sabotáži se ověří, že soubor je zpátky bitově shodný.
     5. Nikdy sám v sobě: značka v prostředí, ať se stroj nepustí
        ve zkoušce, kterou sám pouští.
     6. Časový limit na zkoušku; co nedoběhne, je „nerozhodnuto", ne
        „chycená".
   ================================================================== */
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { ocistiJs } from './minifikace.mjs';
import { fileURLToPath } from 'node:url';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const UVNITR = 'SABOTUJ_UVNITR';
export const CAS_LIMIT_MS = 300000;
export const STROP_SABOTAZI = 4;

/* ------------------------------------------------------------------
   KATALOG SABOTÁŽÍ. Každá je { jmeno, najdi, nahrad, proc }. `najdi`
   je regulární výraz; bere se PRVNÍ výskyt, aby byla změna malá a
   srozumitelná.
   ------------------------------------------------------------------ */
export const SABOTAZE = [
  { jmeno: 'obrácené porovnání (>= na >)', najdi: /\s>=\s/, nahrad: ' > ',
    proc: 'Mez o jeden stupeň: hlídač s mezí „aspoň" nesmí projít s „víc než".' },
  { jmeno: 'obrácené porovnání (<= na <)', najdi: /\s<=\s/, nahrad: ' < ',
    proc: 'Táž mez z druhé strany.' },
  { jmeno: 'obrácená rovnost (=== na !==)', najdi: /\s===\s/, nahrad: ' !== ',
    proc: 'Rovnost obráceně je nejhrubší vada, jakou kód může mít.' },
  { jmeno: 'zahozená pojistka (if … continue)', najdi: /\n\s*if \([^\n]{3,120}\) \{? ?continue; ?\}?\n/,
    nahrad: '\n', proc: 'Krok, který něco zahazuje, se vypne — hlídač to má poznat.' },
  { jmeno: 'zahozený filter(Boolean)', najdi: /\.filter\(Boolean\)/, nahrad: '',
    proc: 'Prázdné hodnoty projdou dál (přesně vada z dnešní prázdné distribuce).' },
  { jmeno: 'a místo nebo (&& na ||)', najdi: /\s&&\s/, nahrad: ' || ',
    proc: 'Podmínka, která měla platit celá, stačí napůl.' },
  { jmeno: 'posunutá konstanta (+1)', najdi: /=\s(\d{1,6});/, nahrad: null,
    proc: 'Číslo v kódu o jedničku jinak: mez, strop ani počet se nesmí dát posunout bez povšimnutí.' },
];

/* Kandidáti pro jeden soubor: co z katalogu se na něj vůbec dá použít. */
export function kandidatiSabotazi(telo, katalog = SABOTAZE) {
  const ven = [];
  for (const s of (katalog || [])) {
    const m = String(telo || '').match(s.najdi);
    if (!m) continue;
    let nahrad = s.nahrad;
    if (nahrad === null) {
      /* Posunutá konstanta: hodnota se dopočítá z nálezu. */
      const cislo = Number(m[1]);
      if (!isFinite(cislo)) continue;
      nahrad = '= ' + (cislo + 1) + ';';
    }
    ven.push({ jmeno: s.jmeno, proc: s.proc, najdi: s.najdi, nahrad, ukazka: m[0].trim().slice(0, 80) });
  }
  return ven;
}

/* Co ta zkouška vlastně hlídá: její importy z vlastního kódu. Bere se
   první, který není zkouška ani pomůcka — a schválně se nehádá: když
   zkouška nic takového neimportuje, vrací se nic a sabotáž se nedělá. */
export const POMOCNE = /^(chyby-hlaska|zkouska-|pomocne|falesn)/;

export function coHlidá(teloZkousky) {
  const ven = [];
  /* I DYNAMICKÝ IMPORT SE POČÍTÁ. Naměřeno 4. 11.: `test-vypadek-zdroje`
     si bere `fetch-opportunities.mjs` přes `await import('./…')`, protože
     ten modul je velký a načítá se až v těle zkoušky. Stroj v něm proto
     „neviděl nic z našeho kódu" a hlásil „mechanická sabotáž tu nemá co
     rozbít" — u zkoušky s 89 kontrolami nad nočním robotem. Ticho
     z nedohledu vypadá úplně stejně jako ticho z toho, že není co
     rozbít, a to je ten nejhorší druh ticha. */
  for (const m of String(teloZkousky || '')
    .matchAll(/(?:from\s+|import\s*\(\s*)['"]\.\/([a-z0-9-]+\.mjs)['"]/g)) {
    const f = m[1];
    if (/^test-/.test(f) || POMOCNE.test(f)) continue;
    if (!ven.includes('scripts/' + f)) ven.push('scripts/' + f);
  }
  for (const m of String(teloZkousky || '').matchAll(/['"`]\.\.\/(js\/[a-z0-9.-]+\.js)['"`]/g)) {
    if (!ven.includes(m[1])) ven.push(m[1]);
  }
  return ven;
}

/* ROVNOCENNÁ MUTACE — SABOTÁŽ, KTERÁ NEMŮŽE NIC ZMĚNIT.
   ==================================================================
   Některou mechanickou mutaci nechytí ŽÁDNÁ zkouška, protože nemění
   výsledek. Naměřený případ (scripts/archiv.mjs): v
   `first_seen <= den ? first_seen : den` dá obrácení na `<` pro
   first_seen rovné dnešku tentýž den — obě varianty vracejí `den`.
   Taková mutace není slepé místo zkoušky, je to mutace bez následku.

   A PROČ TO NENECHAT PROSTĚ ČERVENÉ. Protože falešný nález je drahý
   jinak než chybějící: učí člověka hlášení nečíst, a tím zabije
   i nálezy, které pravdivé jsou (§375). Hlášení, ve kterém dvě
   položky navždy svítí „NECHYTILA" a nedá se s nimi nic udělat, je
   přesně tenhle případ.

   TŘI POJISTKY, ABY SE TÍM NEDALO JEN MLČET:
     1. Prohlášení stojí U KÓDU, ne ve stroji ani v seznamu vedle —
        prochází tedy stejnou revizí jako ten řádek, kterého se týká.
     2. Musí JMENOVAT sabotáž přesně tak, jak ji stroj jmenuje, takže
        se nedá napsat „tenhle soubor nehlídáme".
     3. Musí nést DŮVOD aspoň o `MIN_DUVOD` znacích. Když chybí nebo je
        krátký, prohlášení se neuzná a položka zůstane „NECHYTILA" —
        plus se připíše, že důvod chybí.
   Rovnocenné mutace se v hlášení VYPISUJÍ (znakem „="), nezmizí.
   ================================================================== */
/* Cesta k účtu se tu počítá znovu, místo importu ze samorozvoj.mjs:
   ten tenhle soubor importuje, a kruh v importech by stroj zasekl. */
export const UCET = join(KOREN, 'data', 'samorozvoj.json');

export const ZNACKA_ROVNOCENNE = 'ROVNOCENNÁ SABOTÁŽ:';
export const MIN_DUVOD = 60;

export function rovnocenna(telo, jmenoSabotaze) {
  const jm = String(jmenoSabotaze || '');
  if (!jm) return null;
  for (const r of String(telo || '').split('\n')) {
    const i = r.indexOf(ZNACKA_ROVNOCENNE);
    if (i < 0) continue;
    const zbytek = r.slice(i + ZNACKA_ROVNOCENNE.length).trim();
    if (zbytek.slice(0, jm.length) !== jm) continue;
    const duvod = zbytek.slice(jm.length).replace(/^[\s—-]+/, '').replace(/\*\/\s*$/, '').trim();
    if (duvod.length < MIN_DUVOD) {
      return { jmeno: jm, duvod: '', kratky: true };
    }
    return { jmeno: jm, duvod };
  }
  return null;
}

/* NA ČEM SE ZKOUŠKA SOUDÍ NEJDŘÍV.
   `coHlidá` vrací VŠECHNY moduly, které si zkouška importuje — a to je
   v pořádku pro hledání, ne pro soud. Naměřeno 4. 11.: `test-uzsvm`
   dostala do seznamu i `cti-nabidky-statu.mjs`, odkud si půjčuje dvě
   funkce (čtení výměry a druhu), a slepé místo v CIZÍM modulu se
   připsalo JÍ — přitom ten modul má vlastní zkoušku
   (`test-nabidky-statu`), která ho hlídá.
   Soudit zkoušku za cizí modul je falešný nález (§375) z třetí strany:
   neříká nepravdu o kódu, ale o tom, KDO má co opravit.
   Pořadí proto dává dopředu modul, podle kterého je zkouška
   pojmenovaná: `test-uzsvm.mjs` → `cti-uzsvm.mjs`. Jméno se hledá
   oběma směry (zkouška `test-archiv` hlídá `archiv.mjs`, zkouška
   `test-uzsvm` modul `cti-uzsvm.mjs`), a půjčené moduly zůstávají
   v seznamu za ním — jen se na ně dojde, až když zbude strop. */
/* SABOTÁŽ, KTERÁ SE K PRODUKTU VŮBEC NEDOSTANE
   ------------------------------------------------------------------
   Stroj zapíše mutaci do `js/pozemek.js` — ale stránky servírují
   `js/min/pozemek.js` a ten se po sabotáži nepřestaví (minifikaci dělá
   `scripts/oprav.mjs`, kterou by stroj spouštět nesměl: přepsala by
   `?v=` otisky na třech tisících stránek). Zkouška v prohlížeči tedy
   tu mutaci NEMOHLA vidět — a kdyby se takový výsledek hlásil jako
   „NECHYTILA", stroj by hlídači křivdil a smyčka sebevývoje by ho
   poslala opravovat něco, co je v pořádku.

   Změřeno 4. 11. na vlastní kůži: oprava `posunDomov` v
   `js/pozemek.js` neudělala v prohlížeči NIC, dokud neproběhla
   `oprav.mjs`; hlídač padal dál se stejnou hláškou.

   Hlásí se proto zvlášť jako „nedoručená" — ani důkaz, ani slepé
   místo. Když ji zkouška přesto chytí, je to pravý úlovek: čte si ten
   zdroj z disku sama (několik zkoušek to dělá schválně, aby hlídaly
   tvar kódu, ne jen jeho projev).  */
export function minifikovanaKopie(cil) {
  const m = /^js\/([^/]+\.js)$/.exec(String(cil || ''));
  if (!m) return '';
  const min = 'js/min/' + m[1];
  return existsSync(join(KOREN, min)) ? min : '';
}
/* OTISK ZKOUŠKY: DŮKAZ STÁRNE SPOLU S KÓDEM.
   ------------------------------------------------------------------
   Naměřeno na sobě 4. 11.: účet vedl `test-bloky` a
   `test-cenova-historie` jako „se slepým místem" i po tom, co jsem ta
   slepá místa zavřel — zápis byl z měření PŘED opravou a nikdo mu
   neřekl, že zestárl. Záznam o hlídači platí jen pro to tělo zkoušky,
   nad kterým se měřilo; jak se zkouška změní, je ten záznam tvrzení
   o kódu, který už není.
   Otisk je kryptografický, aby nešlo o shodu náhodou, a krátký, aby
   se účet nenafoukl. */
export function otiskZkousky(zkouska, cti = readFileSync) {
  try {
    const telo = cti(join(KOREN, 'scripts', String(zkouska || '')), 'utf8');
    return createHash('sha1').update(telo).digest('hex').slice(0, 12);
  } catch { return ''; }
}
export function jeProhlizecova(teloZkousky) {
  return /playwright/.test(String(teloZkousky || ''));
}

/* PROHLÍŽEČ, KTERÝ TENHLE STROJ MÁ.
   ------------------------------------------------------------------
   Zkoušky v prohlížeči si Chromium berou z `PW_CHROMIUM`, a když tam
   nic není, zkusí si ho najít playwright sám — jenže ten hledá verzi,
   podle které byl zabalen. Naměřeno 4. 11.: stroj má
   /opt/pw-browsers/chromium-1194, playwright-core hledá
   chromium_headless_shell-1148 a spuštění skončí hláškou
   „Executable doesn't exist". Sabotážní stroj pouští zkoušky jako
   podproces, takže bez tohohle hledání by každá zkouška v prohlížeči
   padla rovnou na startu — a stroj by z toho vinil hlídače.

   Hledá se proto totéž, co dělá člověk: nejdřív `PW_CHROMIUM`, pak
   nejvyšší nalezená složka chromium-<číslo>. Když se nenajde nic,
   nevrací se nic a rozhodne se o tom výš (viz NELZE TADY). */
export const SLOZKA_PROHLIZECU = '/opt/pw-browsers';
export function prohlizecNaStroji({ je = existsSync, slozka = SLOZKA_PROHLIZECU,
  vypis = readdirSync } = {}) {
  const zEnv = String(process.env.PW_CHROMIUM || '');
  if (zEnv && je(zEnv)) return zEnv;
  let jmena = [];
  try { jmena = vypis(slozka); } catch { return ''; }
  const verze = jmena
    .map((d) => /^chromium-(\d+)$/.exec(String(d)))
    .filter(Boolean)
    .sort((a, b) => Number(b[1]) - Number(a[1]));
  for (const v of verze) {
    const cesta = slozka + '/' + v[0] + '/chrome-linux/chrome';
    if (je(cesta)) return cesta;
  }
  return '';
}

/* NELZE TADY: hláška, podle které se pozná, že zkouška nespadla na
   kontrole, ale na tom, že na tomhle stroji není prohlížeč. Bez
   tohohle rozlišení by stroj psal „zkoušku nejdřív opravit" o zkoušce,
   která je v pořádku a v CI zelená — tedy falešné obvinění (§384). */
export const BEZ_PROHLIZECE = /browserType\.launch|Executable doesn't exist|playwright install/i;

/* Prostředí podprocesu: značka proti nekonečné rekurzi a cesta
   k prohlížeči, pokud se nějaká našla. */
export function prostrediZkousky(env) {
  const e = Object.assign({}, env || process.env, { [UVNITR]: '1' });
  const p = prohlizecNaStroji();
  if (p) e.PW_CHROMIUM = p;
  return e;
}

export function poradiCilu(zkouska, cile) {
  const jmeno = String(zkouska || '').replace(/^test-/, '').replace(/\.mjs$/, '');
  if (!jmeno) return (cile || []).slice();
  const skore = (c) => {
    const zaklad = String(c).replace(/^.*\//, '').replace(/\.(mjs|js)$/, '');
    if (zaklad === jmeno) return 0;                       // archiv.mjs ↔ test-archiv
    if (zaklad.endsWith('-' + jmeno) || zaklad.endsWith(jmeno)) return 1;   // cti-uzsvm ↔ test-uzsvm
    if (jmeno.endsWith(zaklad)) return 2;
    return 3;                                             // půjčený modul
  };
  return (cile || []).slice().sort((a, b) => skore(a) - skore(b));
}

/* POMŮCKA ZKOUŠEK NENÍ PRODUKT.
   ------------------------------------------------------------------
   Naměřeno 4. 11. na test-barvy: stroj obrátil `&&` na `||`
   v `scripts/adresa-pozemku.mjs` (ta funkce vybírá, na kterém pozemku
   se bude měřit), zkouška si toho nevšimla a stroj to zapsal jako
   SLEPÉ MÍSTO zkoušky. Jenže ten modul není produkt — nenosí ho na web
   žádná stránka a neimportuje si ho žádný ostrý skript, používají ho
   jen zkoušky, aby si našly cíl. Rozbít zkoušce vlastní pomůcku
   neměří hlídače; měří to nanejvýš sebe. A protože ten modul berou
   skoro všechny zkoušky v prohlížeči, bylo by takových falešných
   obvinění postupně sto (zase §384).

   Pomůcka se pozná měřením, ne seznamem: modul ve scripts/, který si
   někdo bere, a všichni, kdo si ho berou, jsou zkoušky. Jak se ho
   chytí první ostrý skript, přestane být pomůckou sám. Soubory z js/
   pomůcky nejsou nikdy — ty nese web. */
export const STROJ = new Set(['sabotuj.mjs', 'samorozvoj.mjs', 'nalezce.mjs']);
export function modulyVeScripts(cti = readFileSync, vypis = readdirSync) {
  const mapa = {};
  let jmena = [];
  try { jmena = vypis(join(KOREN, 'scripts')); } catch { return mapa; }
  for (const f of jmena) {
    if (!/^[a-z0-9-]+\.mjs$/.test(String(f))) continue;
    try { mapa[f] = cti(join(KOREN, 'scripts', f), 'utf8'); } catch { /* nečitelný */ }
  }
  return mapa;
}
/* A JEŠTĚ JEDNA VĚC, BEZ KTERÉ BY PRAVIDLO LHALO: modul, který se
   nikde neimportuje, protože se SPOUŠTÍ. Naměřeno vzápětí na
   scripts/archiv.mjs — nočního archivu nabídek si žádný .mjs nebere,
   pouští ho řádek `node scripts/archiv.mjs` v update-data.yml, a jediný
   importér je jeho zkouška. Podle importů by vyšel jako pomůcka, a stroj
   by přestal hlídat kus ostrého robota. Spouštěné moduly se proto čtou
   z postupů v .github/workflows a z package.json. */
export function spousteneZvenku(cti = readFileSync, vypis = readdirSync) {
  const ven = new Set();
  const pridej = (text) => {
    for (const m of String(text || '').matchAll(/([a-z0-9-]+\.mjs)/g)) ven.add(m[1]);
  };
  /* Celé .github, ne jen workflows: ohlas-selhani.mjs pouští
     .github/actions/ohlas-selhani/action.yml, a podle samotných
     workflows by vyšel jako pomůcka. */
  const projdi = (kde, hloubka) => {
    if (hloubka > 3) return;
    let jmena = [];
    try { jmena = vypis(kde, { withFileTypes: true }); } catch { return; }
    for (const d of jmena) {
      const cesta = join(kde, d.name);
      if (d.isDirectory()) { projdi(cesta, hloubka + 1); continue; }
      if (!/\.(ya?ml|sh|mjs|js)$/.test(d.name)) continue;
      try { pridej(cti(cesta, 'utf8')); } catch { /* nečitelný */ }
    }
  };
  projdi(join(KOREN, '.github'), 0);
  try {
    const pj = JSON.parse(cti(join(KOREN, 'package.json'), 'utf8'));
    pridej(Object.values(pj.scripts || {}).join('\n'));
  } catch { /* není, nebo není čitelný */ }
  return ven;
}
export function pomuckaZkousek(cil, soubory, spoustene) {
  const m = /^scripts\/([a-z0-9-]+\.mjs)$/.exec(String(cil || ''));
  if (!m) return false;
  const jmeno = m[1];
  if (/^test-/.test(jmeno)) return false;      // zkouška sama není pomůcka
  const ven = spoustene || spousteneZvenku();
  if (ven.has(jmeno)) return false;            // spouští se v postupu = ostrý kód
  const mapa = soubory || modulyVeScripts();
  /* VSTUPNÍ BOD NENÍ POMŮCKA. Shebang znamená „tohle se spouští" —
     prvni-videno.mjs a doplnit-obce.mjs se pouští rukou a žádný .mjs
     si je nebere; podle importů by vyšly jako pomůcky. */
  if (/^#!/.test(String(mapa[jmeno] || ''))) return false;
  /* Hledá se JAKÁKOLI zmínka jména, ne jen `from './x.mjs'`. Naměřeno
     na generate-rss.mjs a dalších osmi: ostrý řetěz si je nebere
     importem, pouští je jako podproces (`['scripts/generate-rss.mjs']`),
     takže podle importů by vyšly jako pomůcky — a stroj by přestal
     hlídat devět kusů sestavení. Zmínka v komentáři se počítá taky:
     tenhle soud má být opatrný. Nechat omylem sabotovat ostrý modul
     stojí nejvýš jedno falešné obvinění zkoušky; prohlásit omylem
     ostrý modul za pomůcku znamená přestat ho hlídat úplně. */
  const bere = new RegExp(jmeno.replace(/\./g, '\\.'));
  const kdo = [];
  for (const f of Object.keys(mapa)) {
    if (f === jmeno) continue;
    /* STROJ SÁM SE NEPOČÍTÁ. Tenhle soubor o měřených modulech PÍŠE
       (jmenovitě, aby se vědělo, kde se co naměřilo), a kdyby se jeho
       vlastní komentáře počítaly za užití, stačila by jedna věta
       v dokumentaci a modul by přestal být pomůckou. Naměřeno na sobě:
       jmenovaný adresa-pozemku.mjs vypadl ze seznamu ve chvíli, kdy
       jsem o něm napsal komentář výš. */
    if (STROJ.has(f)) continue;
    if (bere.test(String(mapa[f] || ''))) kdo.push(f);
  }
  return kdo.length > 0 && kdo.every((f) => /^test-[a-z0-9-]+\.mjs$/.test(f));
}

/* KDO JEŠTĚ TEN SOUBOR HLÍDÁ.
   ------------------------------------------------------------------
   Naměřeno 4. 11., hned jak se sabotáž začala dostávat k prohlížeči
   (§396): stroj obrátil `>=` v js/main.js, `test-barvy` mlčela a
   stroj to zapsal jako šest slepých míst TÉ ZKOUŠKY. Jenže js/main.js
   hlídá přes čtyřicet zkoušek a `test-barvy` z něj čte barvy — mez
   o jeden stupeň v logice hledání není její předmět. Pravda, kterou
   stroj v té chvíli zná, je jiná: „tuhle mutaci nechytila TAHLE
   zkouška", ne „tuhle mutaci nechytí nikdo".

   Proto se u každého cíle spočítá, které další zkoušky ho hlídají.
   Když je soubor jenom její, je obvinění pevné. Když ho hlídá ještě
   někdo, zapíše se mlčení do soupisu po souborech a nález vznikne
   teprve ve chvíli, kdy mlčí druhá — viz samorozvoj.mjs. */
export function kdoHlidaCil(cil, moduly) {
  const mapa = moduly || modulyVeScripts();
  const ven = [];
  for (const f of Object.keys(mapa)) {
    if (!/^test-[a-z0-9-]+\.mjs$/.test(f)) continue;
    if (coHlidá(mapa[f]).includes(cil)) ven.push(f);
  }
  return ven.sort();
}

export function smiSabotovat(cesta) {
  const c = String(cesta || '');
  if (/\.\./.test(c)) return false;
  if (/^js\/min\//.test(c)) return false;              // generované
  return /^scripts\/[a-z0-9-]+\.mjs$/.test(c) || /^js\/[a-z0-9.-]+\.js$/.test(c);
}

/* ------------------------------------------------------------------
   ŽIVÁ ČÁST: zapsat, ověřit diffem, pustit zkoušku, vrátit z gitu.
   ------------------------------------------------------------------ */
function git(args) {
  return execFileSync('git', args, { cwd: KOREN, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
}

export function cistySoubor(cesta) {
  try { return git(['status', '--porcelain', '--', cesta]).trim() === ''; }
  catch { return false; }
}

export function vratZGitu(cesta) {
  const z = git(['show', 'HEAD:' + cesta]);
  writeFileSync(join(KOREN, cesta), z);
}

export function zmenilSe(cesta) {
  try { return git(['diff', '--numstat', '--', cesta]).trim() !== ''; }
  catch { return false; }
}

export async function prokazZkousku(zkouska, { strop = STROP_SABOTAZI, casLimit = CAS_LIMIT_MS, vypis = false } = {}) {
  const cestaZkousky = 'scripts/' + zkouska;
  let teloZkousky = '';
  try { teloZkousky = readFileSync(join(KOREN, cestaZkousky), 'utf8'); }
  catch { return { zkouska, chyba: 'zkoušku nejde přečíst' }; }
  const vse = poradiCilu(zkouska, coHlidá(teloZkousky).filter(smiSabotovat));
  if (!vse.length) {
    return { zkouska, hlidá: [], sabotaze: [],
      poznamka: 'zkouška neimportuje nic z našeho kódu — mechanická sabotáž tu nemá co rozbít' };
  }
  /* Pomůcky zkoušek se nesabotují (viz POMŮCKA ZKOUŠEK NENÍ PRODUKT). */
  const moduly = modulyVeScripts();
  const spoustene = spousteneZvenku();
  const pomucky = vse.filter((c) => pomuckaZkousek(c, moduly, spoustene));
  const cile = vse.filter((c) => !pomucky.includes(c));
  if (!cile.length) {
    return { zkouska, hlidá: [], sabotaze: [], pomucky,
      poznamka: `zkouška si bere jen vlastní pomůcky (${pomucky.join(', ')}) —`
        + ' rozbít je neměří hlídače, měří to zkoušku samu' };
  }
  const prohlizecova = jeProhlizecova(teloZkousky);
  /* NEJDŘÍV SE ZKOUŠKA MUSÍ ZELENĚ PROJÍT BEZ SABOTÁŽE.
     ------------------------------------------------------------------
     Nalezeno 4. 11. na vlastní kůži, a je to nejhorší vada, jakou
     tenhle stroj měl: když zkouška padá UŽ BEZ MUTACE, skončí každý
     sabotovaný běh taky nenulově — a stroj všechny mutace odškrtne
     jako „chycené". Naměřeno doslova: `test-hlidani` padala na jedné
     kontrole s nezlomitelnou mezerou a stroj vydal „6 z 6 chyceno",
     ačkoli jedna z těch šesti (mez množného čísla 2–4) ve skutečnosti
     chycená není. Falešný důkaz je horší než žádný: podle něj se
     hlídač odškrtne jako prokázaný a nikdo se k němu nevrátí.
     Proto se nejdřív pustí nesabotovaná zkouška. Když padne, nedělá se
     nic a vrátí se to jako chyba — opravit zkoušku je první krok,
     teprve pak má smysl ji prokazovat. */
  try {
    execFileSync(process.execPath, [cestaZkousky], {
      cwd: KOREN, encoding: 'utf8', timeout: casLimit,
      env: prostrediZkousky(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    const kod = e && e.status;
    const vse = String((e && (e.stdout || '')) || '') + '\n' + String((e && (e.stderr || '')) || '');
    const vystup = String((e && (e.stdout || '')) || '').split('\n').slice(-3).join(' ').slice(-300);
    /* NELZE TADY. Zkouška v prohlížeči, která se nespustila proto, že
       na stroji není Chromium, není padající zkouška — je to hranice
       stroje. Hlásí se zvlášť a smyčka na ní nestojí. */
    if (prohlizecova && BEZ_PROHLIZECE.test(vse)) {
      return { zkouska, hlidá: cile, pomucky, nelzeTady: true,
        chyba: 'tahle zkouška potřebuje prohlížeč a tenhle stroj ho nemá'
          + ' (hledáno v PW_CHROMIUM i v ' + SLOZKA_PROHLIZECU + ') — není to vada hlídače,'
          + ' prokázat ji může jen běh, kde prohlížeč je' };
    }
    return { zkouska, hlidá: cile, pomucky,
      chyba: e && e.killed
        ? `zkouška nedoběhla do ${Math.round(casLimit / 1000)} s ani bez sabotáže`
        : `zkouška padá UŽ BEZ SABOTÁŽE (konec ${kod}) — nejdřív ji opravit,`
          + ` prokazovat se dá jen zelená zkouška. Konec výpisu: ${vystup}` };
  }
  const vysledky = [];
  /* CO SE NEMĚŘILO, SE MUSÍ NAPSAT. Dřív stroj vypsal čtyři verdikty
     a pátá mutace z katalogu zmizela beze slova — ať už proto, že se
     její tvar v souboru nevyskytuje, nebo proto, že na ni nezbyl strop.
     Čtenář pak nemohl poznat, jestli je hlídač prokázaný celý.
     Naměřeno na generate-data-rezy.mjs: hlášení ukazovalo čtyři z pěti
     a vypadalo úplně. */
  const merene = new Set();
  let kandidatu = 0;
  for (const cil of cile) {
    if (vysledky.length >= strop) break;
    if (!cistySoubor(cil)) {
      vysledky.push({ cil, jmeno: '—', stav: 'nelze', proc: 'soubor má rozdělanou změnu' });
      continue;
    }
    const puvodni = readFileSync(join(KOREN, cil), 'utf8');
    const kand = kandidatiSabotazi(puvodni);
    kandidatu += kand.length;
    for (const k of kand) {
      if (vysledky.length >= strop) break;
      merene.add(k.jmeno);
      if (vypis) { vysledky.push({ cil, jmeno: k.jmeno, stav: 'vypis', ukazka: k.ukazka }); continue; }
      /* 1) zapsat */
      writeFileSync(join(KOREN, cil), puvodni.replace(k.najdi, k.nahrad));
      /* 1b) A PŘESTAVĚT TO, CO STRÁNKY OPRAVDU SERVÍRUJÍ.
         ------------------------------------------------------------
         Tohle byla největší hranice tohohle stroje: zkouška
         v prohlížeči si otevře stránku, stránka si stáhne
         js/min/main.js — a tam byl pořád PŮVODNÍ kód, protože
         sabotáž zapsala js/main.js a nikdo minifikaci nepustil.
         Mutace se k produktu nedostala a hlídač ji neměl jak vidět
         (verdikt „nedoručená"). Naměřeno: z 307 hlídačů je přes sto
         v prohlížeči, takže tak zůstala neprokazatelná třetina
         repozitáře.
         Minifikace je čistá funkce a dává bitově totéž, co je
         zapsané v repozitáři (změřeno na main.js, pozemek.js
         a ceny.js: shoda do jednoho bajtu). Dá se proto pustit na
         JEDEN soubor a hned po zkoušce ho vrátit z gitu — se stejným
         ověřením diffem a bitovou shodou jako u zdroje. */
      const min = minifikovanaKopie(cil);
      let minPuvodni = '', doruceno = false;
      if (min && cistySoubor(min)) {
        try {
          minPuvodni = readFileSync(join(KOREN, min), 'utf8');
          writeFileSync(join(KOREN, min),
            ocistiJs(readFileSync(join(KOREN, cil), 'utf8'), basename(cil)));
          /* Doručeno je jen to, co je vidět v diffu. Mutace, která
             z minifikovaného souboru vypadne (třeba v komentáři),
             doručená není — a verdikt zůstane „nedoručená". */
          doruceno = zmenilSe(min);
        } catch { doruceno = false; }
      }
      /* 2) OVĚŘIT DIFFEM — bez tohohle kroku sabotáž nic nedokazuje (§369) */
      const opravduZmeneno = zmenilSe(cil);
      let stav = 'neznámo', vystup = '';
      if (!opravduZmeneno) {
        stav = 'prázdná';
      } else {
        try {
          execFileSync(process.execPath, [cestaZkousky], {
            cwd: KOREN, encoding: 'utf8', timeout: casLimit,
            env: prostrediZkousky(),
            stdio: ['ignore', 'pipe', 'pipe'],
          });
          /* Zkouška prošla nad rozbitým kódem. Buď je to slepé místo —
             nebo mutace, která nic nezměnila a kód to u sebe přiznává
             (viz ROVNOCENNÁ MUTACE výš). Rozhoduje prohlášení
             v původním, NEsabotovaném těle. */
          const rov = rovnocenna(puvodni, k.jmeno);
          if (rov && !rov.kratky) { stav = 'rovnocenná'; k.proc = rov.duvod; }
          else if (rov && rov.kratky) {
            stav = 'NECHYTILA';
            k.proc = 'u kódu je prohlášení o rovnocenné mutaci, ale bez důvodu aspoň o '
              + MIN_DUVOD + ' znacích — neuznává se';
          } else stav = 'NECHYTILA';
          /* A ještě jedna otázka, než se to zapíše jako slepé místo:
             DOSTALA SE TA SABOTÁŽ VŮBEC K PRODUKTU? */
          if (stav === 'NECHYTILA' && prohlizecova && min && !doruceno) {
            stav = 'nedoručená';
            k.proc = `stránky servírují ${min}, a to se po sabotáži nepřestavělo`
              + ' — zkouška v prohlížeči tu mutaci nemohla vidět; není to slepé místo'
              + ' zkoušky, ale hranice tohohle stroje';
          }
        } catch (e) {
          const kod = e && e.status;
          vystup = String((e && (e.stdout || '')) || '').slice(-400);
          if (e && e.killed) stav = 'nerozhodnuto';
          else if (kod === 1) stav = 'chytila';
          else stav = 'nepoužitelná';   // spadlo na syntaxi, ne na kontrole
        }
      }
      /* 3) vrátit z gitu a 4) ověřit, že je soubor zpátky.
         Vrací se OBOJÍ — zdroj i minifikovaná kopie — a obojí se
         kontroluje na bitovou shodu. Kdyby v repozitáři zůstala
         přestavěná kopie, byla by to změna, o které nikdo neví;
         přesně proto se tady zastavuje. */
      vratZGitu(cil);
      let vraceno = readFileSync(join(KOREN, cil), 'utf8') === puvodni;
      let coNevratil = cil;
      if (vraceno && min && minPuvodni) {
        vratZGitu(min);
        if (readFileSync(join(KOREN, min), 'utf8') !== minPuvodni) { vraceno = false; coNevratil = min; }
      }
      /* U nechycené sabotáže se přiloží, kdo další ten soubor hlídá —
         bez toho se z „tahle zkouška mlčela" stane „nikdo to nechytí",
         a to je jiné tvrzení. */
      const hlidajiJeste = stav === 'NECHYTILA'
        ? kdoHlidaCil(cil, moduly).filter((f) => f !== zkouska) : [];
      vysledky.push({ cil, jmeno: k.jmeno, proc: k.proc, ukazka: k.ukazka, stav, vraceno,
        hlidajiJeste,
        doruceno: min ? doruceno : undefined,
        vystup: stav === 'NECHYTILA' ? '' : vystup.split('\n').slice(-2).join(' ') });
      if (!vraceno) {
        return { zkouska, hlidá: cile, pomucky, sabotaze: vysledky,
          chyba: `soubor ${coNevratil} se nevrátil do původní podoby — zastavuji` };
      }
    }
  }
  const chytila = vysledky.filter((v) => v.stav === 'chytila').length;
  const nechytila = vysledky.filter((v) => v.stav === 'NECHYTILA').length;
  const rovnocenne = vysledky.filter((v) => v.stav === 'rovnocenná').length;
  const nedorucene = vysledky.filter((v) => v.stav === 'nedoručená').length;
  /* ŽÁDNÝ KANDIDÁT NENÍ VÝSLEDEK, NE MLČENÍ. Naměřeno na prvním běhu
     smyčky: `scripts/rozbal-hledani.mjs` má 2 146 znaků a není v něm
     ani jedno `>=`, `===`, `if … continue`, `filter(Boolean)` ani
     konstanta — mechanická sabotáž tam nemá co rozbít. Bez téhle věty
     by hlášení vypsalo jen hlavičku a vypadalo to na vadu stroje. */
  if (!vysledky.length) {
    return { zkouska, hlidá: cile, pomucky, sabotaze: [], chytila: 0, nechytila: 0,
      poznamka: 'v hlídaném kódu není co mechanicky rozbít — žádný tvar z katalogu se v něm'
        + ' nevyskytuje; promyšlená sabotáž tu zůstává na člověku' };
  }
  /* Mutace z katalogu, na které v hlídaném kódu není tvar (`nesedi`),
     a mutace, na které nezbyl strop (`odlozeno`). Obojí patří do
     hlášení: bez toho vypadá částečné měření jako celé. */
  const nesedi = SABOTAZE.map((s) => s.jmeno).filter((j) => !merene.has(j));
  const odlozeno = Math.max(0, kandidatu - vysledky.filter((v) => v.jmeno !== '—').length);
  return { zkouska, hlidá: cile, pomucky, sabotaze: vysledky, chytila, nechytila, rovnocenne,
    nedorucene, nesedi, odlozeno };
}

/* Česká čísla i ve výpisu stroje: „2 zkoušek" se nepíše. */
export function mnozneZkousky(n) {
  const k = Math.abs(Number(n) || 0);
  if (k === 1) return 'zkouška';
  return (k >= 2 && k <= 4) ? 'zkoušky' : 'zkoušek';
}
export function hlaseniProkazu(v) {
  if (!v) return [];
  if (v.chyba) return [`${v.zkouska}: ${v.chyba}`];
  if (v.poznamka) return [`${v.zkouska}: ${v.poznamka}`];
  const radky = [`${v.zkouska} hlídá ${v.hlidá.join(', ')}`];
  /* Vynechané pomůcky se píšou nahlas. Bez toho by se účet nedal
     přečíst: zkouška, která si bere pět modulů, by vypadala, že hlídá
     dva, a nebylo by vidět proč. */
  if ((v.pomucky || []).length) {
    radky.push(`  (vynecháno jako pomůcka zkoušek: ${v.pomucky.join(', ')} —`
      + ' nenosí je web a neimportuje si je žádný ostrý skript)');
  }
  for (const s of v.sabotaze) {
    const znak = s.stav === 'chytila' ? '✓'
      : (s.stav === 'NECHYTILA' ? '✕'
        : (s.stav === 'rovnocenná' ? '=' : (s.stav === 'nedoručená' ? '~' : '·')));
    radky.push(`  ${znak} ${s.stav.padEnd(13)} ${s.jmeno}  (${s.cil})`);
    if (s.stav === 'NECHYTILA' || s.stav === 'rovnocenná' || s.stav === 'nedoručená') {
      radky.push(`        ${s.proc}`);
    }
  }
  if (v.rovnocenne) {
    radky.push(`  ${v.rovnocenne} mutace nemůže nic změnit a kód to u sebe přiznává (viz důvod výš).`);
  }
  if (v.nedorucene) {
    radky.push(`  ${v.nedorucene} sabotáží se k prohlížeči nedostalo (minifikovaná kopie se`
      + ' nepřestavuje) — ani důkaz, ani slepé místo.');
  }
  /* NEMĚŘENÉ MUTACE SE PŘIZNÁVAJÍ. Jinak vypadá částečné měření jako
     celé: čtenář vidí čtyři verdikty a neví, že katalog má pět tvarů. */
  if ((v.nesedi || []).length) {
    radky.push(`  (neměřeno, tvar v kódu není: ${v.nesedi.join(', ')})`);
  }
  if (v.odlozeno) {
    radky.push(`  (${v.odlozeno} dalších sabotáží se vejde až nad strop — pusťte s --strop=`
      + `${(v.sabotaze || []).length + v.odlozeno})`);
  }
  /* A TÁŽ VĚTA SE MUSÍ ROZDĚLIT PODLE TOHO, CO O NÍ VÍME (§397):
     „slepé místo" je pevné obvinění jen tam, kde ten soubor nehlídá
     nikdo jiný. U půjčeného modulu, který má vlastní zkoušku, je to
     zatím jen mlčení a rozhodne se po souborech. */
  const pevna = (v.sabotaze || []).filter((s) => s.stav === 'NECHYTILA'
    && !(s.hlidajiJeste || []).length);
  const mlceni = (v.sabotaze || []).filter((s) => s.stav === 'NECHYTILA'
    && (s.hlidajiJeste || []).length);
  if (pevna.length) {
    radky.push(`  SLEPÉ MÍSTO: ${pevna.length} sabotáží zkouška nechytila`
      + ' — a ten soubor nehlídá nikdo jiný, takže je to nález o téhle zkoušce.');
  }
  for (const s of mlceni) {
    radky.push(`  MLČENÍ: ${s.jmeno} v ${s.cil} nechytila, ale týž soubor hlídá`
      + ` ještě ${s.hlidajiJeste.length} ${mnozneZkousky(s.hlidajiJeste.length)}`
      + ` (${s.hlidajiJeste.slice(0, 3).join(', ')})`
      + ' — zapsáno do soupisu po souborech, nález vznikne, až mlčí druhá.');
  }
  return radky;
}

async function main() {
  if (process.env[UVNITR] === '1') {
    console.log('Sabotážní stroj se nepouští sám v sobě.');
    return;
  }
  const vypis = process.argv.includes('--vypis');
  const zapsat = process.argv.includes('--zapis');
  const strop = (() => {
    const a = process.argv.find((x) => x.startsWith('--strop='));
    const n = a ? parseInt(a.slice(8), 10) : NaN;
    return isFinite(n) && n > 0 ? n : STROP_SABOTAZI;
  })();
  const zkouska = process.argv.slice(2).find((a) => /^test-[a-z0-9-]+\.mjs$/.test(a));
  if (!zkouska) {
    console.error('Řekněte, kterou zkoušku prokázat: node scripts/sabotuj.mjs test-uzsvm.mjs');
    process.exit(2);
  }
  const v = await prokazZkousku(zkouska, { strop, vypis });
  for (const r of hlaseniProkazu(v)) console.log(r);
  /* RUČNÍ DŮKAZ SE TAKY POČÍTÁ — JEN O NĚM MUSÍ ÚČET VĚDĚT.
     Smyčka sebevývoje (scripts/samorozvoj.mjs) si vede účet, kolik
     hlídačů je prokázaných, a vybírá podle něj, co prokázat příště.
     Jenže zapisovala do něj jen ona sama: když jsem 4. 11. prokázal
     ručně test-zkus-portal (9 z 9) a test-ceny (6 z 6), účet dál
     tvrdil „1 z 307 prokázáno" a smyčka by si je znovu vzala na řadu.
     S `--zapis` tedy výsledek sahá do TÉHOŽ účtu a v TÉMŽE tvaru.
     Bez přepínače se nezapisuje nic — stroj, který píše do dat při
     každém spuštění, by se nedal použít na pokusy. */
  if (zapsat && !vypis && !v.chyba) {
    const dnes = new Date().toISOString().slice(0, 10);
    let ucet = { zkousky: {} };
    try { ucet = JSON.parse(readFileSync(UCET, 'utf8')); } catch { /* první zápis */ }
    if (!ucet.zkousky) ucet.zkousky = {};
    ucet.zkousky[zkouska] = {
      kdy: dnes,
      hlidá: (v.hlidá || []).length,
      chytila: v.chytila || 0,
      nechytila: v.nechytila || 0,
      rovnocenne: (v.sabotaze || []).filter((x) => x.stav === 'rovnocenná').map((x) => x.jmeno),
      slepa: (v.sabotaze || []).filter((x) => x.stav === 'NECHYTILA').map((x) => x.jmeno),
      nedorucene: (v.sabotaze || []).filter((x) => x.stav === 'nedoručená').map((x) => x.jmeno),
      poznamka: v.poznamka || '',
      rucne: true,
    };
    ucet.updated = dnes;
    writeFileSync(UCET, JSON.stringify(ucet, null, 1));
    console.log(`\nZapsáno do ${UCET} (ručně prokázáno).`);
  } else if (!vypis && !v.chyba) {
    console.log('\n(Nic se nezapsalo. S --zapis se důkaz uloží do účtu samorozvoje.)');
  }
  if (v.chyba) process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Sabotáž spadla:', e && e.message ? e.message : e); process.exit(1); });
}
