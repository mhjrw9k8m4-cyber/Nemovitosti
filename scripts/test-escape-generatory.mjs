/* Test: nálož v datech nesmí projít GENERÁTORY do hotové stránky.
   ==================================================================
   Spuštění: node scripts/test-escape-generatory.mjs   (bez prohlížeče)

   PROČ ZVLÁŠŤ. scripts/test-escape-dom.mjs a test-escape-zpravy.mjs
   měří cesty, kde text skládá PROHLÍŽEČ. Okresní, krajské a pozemkové
   stránky ale skládá SESTAVENÍ: generátory vezmou táž data a napíšou
   z nich hotové HTML, které se pak servíruje jako soubor. Tam
   escapování v js/ nepomůže ani CSP nic nenapraví — co se do souboru
   zapíše, to prohlížeč dostane.

   JAK SE MĚŘÍ. V dočasné kopii repozitáře se otráví VŠECHNY nabídky
   v data/opportunities.json (obrázek s onerror, svg s onload, značka
   script v polích place, extra, parcel a description), pustí se
   generátory a hotové stránky se prohlédnou. Nic se nepřepisuje:
   skutečný strom zůstane, jak byl.

   ČTYŘI VĚCI, KTERÉ MUSÍ PLATIT NARÁZ:
     1. nálož v souborech JE — ale jen zneškodněná (jinak by zkouška
        měřila prázdno a tvrdila, že je vše v pořádku),
     2. nikde není v hrubé podobě („<img src=x onerror=" a spol.),
     3. žádný blok <script> nejde ukončit zvenčí — počet otevíracích
        a zavíracích značek musí být shodný,
     4. datové ostrůvky (JSON-LD, application/json, window.PK_POZEMEK)
        se dají přečíst jako JSON.

   NAMĚŘENO 23. 10. (1 956 otrávených nabídek → 1 932 stránek pozemků
   + 77 okresních + 14 krajských): hrubá nálož **0 souborů**, zneškodněná
   **2 102 souborů**, značky <script> vyvážené 26 : 26, všechny ostrůvky
   čitelné. Ve skriptech se nálož zapisuje jako `\\u003c` a `\\u003e`,
   tedy tak, že blok nejde ukončit — to je ta nejpevnější cesta a
   kontrola 3 ji hlídá. V prohlížeči se nad tím buildem nespustilo nic
   (window.__XSS nedefinované, 0 nebezpečných prvků).
   ================================================================== */
import { cpSync, rmSync, mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ČTYŘI NÁLOŽE, PROTOŽE KAŽDÁ MÍŘÍ JINAM. První tři jsou na text
   v HTML (značka, značka s obsluhou, konec bloku skriptu). Čtvrtá je
   na ATRIBUT a chyběla: do atributu se text dostane v popisku stránky
   (`<meta name="description" content="…">`), v `title` a v `data-*`,
   a tam značku nepotřebuje — stačí zavřít uvozovku a připsat obsluhu.
   Naměřeno při psaní téhle zkoušky: bez čtvrté nálože se cesta „text
   v atributu" nezkoušela vůbec, a zkouška přitom byla zelená. */
const NALOZE = [
  '<img src=x onerror="window.__XSS=1">',
  '"><svg onload="window.__XSS=2"></svg>',
  '</b><script>window.__XSS=3</script>',
  '" onerror="window.__XSS=4',
];
const HRUBE = [/<img src=x onerror=/, /<svg onload=/, /<script>window\.__XSS/];

/* Velké složky se nekopírují — generátory je nečtou (týž seznam jako
   v scripts/test-oprav.mjs, a ze stejného důvodu: kopie se tím zkrátí
   z minut na sekundy). */
const VYNECHAT = new Set(['.git', 'node_modules',
  path.join('assets', 'mobilenet'), path.join('assets', 'nsfw-model')]);

const kopie = mkdtempSync(path.join(tmpdir(), 'parcelka-escape-'));
try {
  cpSync(KOREN, kopie, { recursive: true,
    filter: (zdroj) => { const rel = path.relative(KOREN, zdroj); return rel === '' || !VYNECHAT.has(rel); } });
  /* node_modules se NEKOPÍRUJE. Oba generátory berou jen to, co umí
     Node sám (fs, path, url) — změřeno čtením jejich importů, a běh
     to potvrdil. Kopírovat kvůli nim stovky megabajtů by zkoušku
     prodloužilo o minuty a nic nepřineslo. */

  /* ---- otrávit data ---- */
  const dataSoubor = path.join(kopie, 'data', 'opportunities.json');
  const d = JSON.parse(readFileSync(dataSoubor, 'utf8'));
  const nabidky = Array.isArray(d) ? d : d.opportunities;
  pravda(`je co otrávit — nabídek je ${nabidky ? nabidky.length : 0}`,
    Array.isArray(nabidky) && nabidky.length > 100, 'v datech nejsou nabídky');
  nabidky.forEach((x, i) => {
    const n = NALOZE[i % NALOZE.length];
    x.place = n + ' Zkouskov';
    x.extra = n;
    x.parcel = n;
    if (x.description != null) x.description = n;
  });
  writeFileSync(dataSoubor, JSON.stringify(d));

  /* ---- pustit generátory ---- */
  let spadlo = null;
  for (const g of ['generate-region-pages.mjs', 'generate-parcel-pages.mjs']) {
    try {
      execFileSync('node', [path.join(kopie, 'scripts', g)],
        { cwd: kopie, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 900000 });
    } catch (e) { spadlo = `${g}: ${String(e.stderr || e.message).trim().split('\n').slice(-2).join(' | ')}`; break; }
  }
  pravda('generátory nad otrávenými daty proběhnou', !spadlo, spadlo);

  /* ---- prohlédnout hotové stránky ---- */
  const stranky = readdirSync(kopie).filter((f) => f.endsWith('.html'));
  const OSTRUVEK = /<script([^>]*)>([\s\S]*?)<\/script>/g;
  let sNalozi = 0, hrube = [], nevyvazene = [], rozbite = [], obsluhy = [], vAtributu = 0;
  for (const f of stranky) {
    const s = readFileSync(path.join(kopie, f), 'utf8');
    if (s.indexOf('Zkouskov') < 0) continue;      // na té stránce nálož není
    sNalozi++;
    for (const vzor of HRUBE) if (vzor.test(s)) { hrube.push(f); break; }
    /* Blok <script> nejde ukončit zvenčí: kdyby se do něj dostalo
       „</script>", zbytek bloku by se stal HTML a nálož by se spustila. */
    /* Dostala se čtvrtá nálož (ta na atribut) opravdu DO atributu, a
       zneškodněná? Bez tohohle by v seznamu mohla být nálož, která
       nikam nedojde — a zkouška by o atributech nevěděla nic. */
    if (/&quot; onerror=&quot;window\.__XSS=4/.test(s)) vAtributu++;
    const otv = (s.match(/<script\b/gi) || []).length;
    const zav = (s.match(/<\/script>/gi) || []).length;
    if (otv !== zav) nevyvazene.push(`${f} (${otv} : ${zav})`);
    /* Obslužný atribut na stránce nemá co dělat vůbec (změřeno: web
       žádný nepoužívá), takže jeho výskyt by znamenal, že nálož
       vyskočila z atributu nebo z textu — třeba tím, že se escapovalo
       < a > a NE uvozovka.
       HLEDÁ SE JEN MIMO SKRIPTY. Uvnitř <script type="application/
       ld+json"> ten text „ onerror=\"" stojí jako obsah JSON řetězce
       (nálož je tam zapsaná jako \u003c a \u003e, takže blok nejde
       ukončit) — a kontrola na něj hlásila poplach: naměřeno 23. 10.
       na třech stránkách, a žádný atribut to nebyl.
       A HLEDÁ SE UVNITŘ ZNAČEK, ne v textu. Zneškodněná nálož stojí na
       stránce jako VIDITELNÝ TEXT („&quot;&gt;&lt;svg onload=&quot;…"),
       takže slova „ onload=" se tam vyskytují po právu — a druhá
       podoba téhle kontroly na ně hlásila poplach taky. Atribut se
       pozná tím, že leží mezi < a > jedné značky; kdyby nálož
       vyskočila z atributu (escapované < >, neescapovaná uvozovka),
       octne se právě tam. */
    const bezSkriptu = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    for (const znacka of bezSkriptu.match(/<[a-zA-Z][^>]*>/g) || []) {
      /* A JEN NA JMÉNA ATRIBUTŮ, ne na jejich hodnoty. Zneškodněná
         nálož leží i v hodnotách (`content="… &lt;img src=x
         onerror=&quot;…&quot;&gt; …"`), kde je po právu — uvozovka je
         escapovaná, takže z atributu nevyskočí. Třetí podoba téhle
         kontroly na to hlásila poplach na stránkách pozemků, a nebyla
         to vada. Hodnoty v uvozovkách se proto vyprázdní; kdyby nálož
         z atributu VYSKOČILA, octne se `onerror=` mimo uvozovky —
         a tam se hledá. */
      const bezHodnot = znacka.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''");
      if (/\son(error|load|click|mouseover)\s*=/i.test(bezHodnot)) { obsluhy.push(`${f} → ${znacka.slice(0, 70)}`); break; }
    }
    OSTRUVEK.lastIndex = 0;
    let m;
    while ((m = OSTRUVEK.exec(s))) {
      const typ = (m[1] || '');
      if (!/application\/(ld\+)?json/i.test(typ)) continue;
      try { JSON.parse(m[2]); } catch (e) { rozbite.push(`${f} (${typ.trim().slice(0, 40)})`); break; }
    }
  }
  pravda(`nálož se do hotových stránek dostala (${sNalozi} z ${stranky.length})`,
    sNalozi > 100, `jen ${sNalozi} — zkouška by měřila prázdno`);
  pravda(`nálož mířená na atribut v atributech opravdu je, a escapovaná (${vAtributu} stránek)`,
    vAtributu > 10, `jen ${vAtributu} — cesta „text v atributu" se tím nezkouší`);
  pravda('ale v žádné není v hrubé podobě', hrube.length === 0,
    `hrubě v: ${hrube.slice(0, 3).join(', ')} (celkem ${hrube.length})`);
  pravda('žádný blok <script> nejde ukončit zvenčí (značky jsou vyvážené)',
    nevyvazene.length === 0, nevyvazene.slice(0, 3).join(' | '));
  pravda('a nevznikl ani jeden obslužný atribut (onerror, onload…)',
    obsluhy.length === 0, obsluhy.slice(0, 3).join(', '));
  pravda('datové ostrůvky se dají přečíst jako JSON',
    rozbite.length === 0, rozbite.slice(0, 3).join(' | '));

  /* ---- SABOTÁŽ: najde to vůbec něco? ---- */
  /* Bez tohohle by zkouška mohla být zelená proto, že se špatně
     prohlíží, a ne proto, že generátory escapují. */
  {
    const vzorek = stranky.find((f) => readFileSync(path.join(kopie, f), 'utf8').indexOf('Zkouskov') >= 0);
    const cesta = path.join(kopie, vzorek);
    const puvodni = readFileSync(cesta, 'utf8');
    writeFileSync(cesta, puvodni.replace('</head>', '<img src=x onerror="window.__XSS=1"></head>'));
    const s = readFileSync(cesta, 'utf8');
    const bezSkriptu = s.replace(/<script[\s\S]*?<\/script>/gi, '');
    const znacky = (bezSkriptu.match(/<[a-zA-Z][^>]*>/g) || [])
      .map((z) => z.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''"));
    const naslo = HRUBE.some((v) => v.test(s)) && znacky.some((z) => /\son(error|load)\s*=/i.test(z));
    writeFileSync(cesta, puvodni);
    pravda('kontrola sabotáží: podstrčená nálož v hotové stránce se pozná', naslo,
      'prohlížení stránek nenašlo ani nálož, kterou jsem tam dal sám');

    /* DRUHÝ SMĚR, A TEN JE REALISTIČTĚJŠÍ. Opravdová díra v generátoru
       nevypadá jako hrubá značka — vypadá jako escapované < a > a
       ZAPOMENUTÁ UVOZOVKA. Nálož pak z atributu vyskočí, aniž by se
       v souboru objevilo „<img". Tohle je ta podoba, kterou kontrola
       jmen atributů musí poznat; bez téhle sabotáže by o ní nikdo
       nevěděl. */
    /* Pozor na podobu: uvozovka SAMA atribut nerozbije. Z
       `content="x" window.__XSS=1 ""` prohlížeč udělá jen nesmyslná
       jména atributů a nic nespustí — naměřeno, první podoba téhle
       sabotáže byla přesně taková a nic nedokazovala. Opravdová díra
       vypadá takhle: uvozovka, mezera, obsluha. */
    writeFileSync(cesta, puvodni.replace('</head>',
      '<meta name="description" content="popis" onerror="window.__XSS=1"></head>'));
    const s2 = readFileSync(cesta, 'utf8');
    const bezSkriptu2 = s2.replace(/<script[\s\S]*?<\/script>/gi, '');
    const naslo2 = (bezSkriptu2.match(/<[a-zA-Z][^>]*>/g) || [])
      .map((z) => z.replace(/"[^"]*"/g, '""').replace(/'[^']*'/g, "''"))
      .some((z) => /\son(error|load)\s*=/i.test(z));
    writeFileSync(cesta, puvodni);
    pravda('a pozná se i únik z atributu (escapované < > a zapomenutá uvozovka)', naslo2,
      'kontrola jmen atributů tu podobu nepozná — a právě takhle vypadá opravdová vada');
  }
} finally {
  try { rmSync(kopie, { recursive: true, force: true }); } catch (e) {}
}

console.log('\nNálož v datech neprojde generátory');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Escapování v generátorech: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
