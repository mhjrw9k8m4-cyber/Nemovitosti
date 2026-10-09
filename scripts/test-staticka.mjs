// Statická kontrola skriptů v js/.
//
// Hledá volání funkce, která v souboru nikde není definovaná. Přesně tahle
// chyba tu už jednou byla: `closeFeedback()` se volal na dvou místech, ale
// funkce neexistovala (zbyla po odstraněném okně), takže každé stisknutí
// Escape skončilo výjimkou — a nikdo o tom nevěděl, protože se to projeví
// jen v konzoli návštěvníka.
//
// Je to hrubá kontrola nad textem, ne opravdový rozbor kódu: neumí sledovat
// import ani globální proměnné mezi soubory. Proto vypisuje podezření
// a padá jen u jmen, o kterých víme jistě, že nikde nevznikají.
//
// Spuštění: node scripts/test-staticka.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const JS = path.join(ROOT, 'js');

// Co je k dispozici samo od sebe (jazyk, prohlížeč, knihovny na stránce).
const ZNAME = new Set([
  'if', 'for', 'while', 'switch', 'catch', 'return', 'typeof', 'function', 'else', 'this',
  'fetch', 'parseInt', 'parseFloat', 'decodeURIComponent', 'encodeURIComponent', 'encodeURI', 'decodeURI',
  'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'requestAnimationFrame', 'cancelAnimationFrame',
  'require', 'isNaN', 'isFinite', 'alert', 'confirm', 'prompt', 'define', 'queueMicrotask', 'structuredClone',
  'getComputedStyle', 'matchMedia', 'atob', 'btoa', 'escape', 'unescape', 'importScripts'
]);

/* Komentáře a texty v uvozovkách musí pryč, jinak kontrola „najde" každé
   české slovo, za kterým je v komentáři závorka („kontrola (viz níž)"). */
function ocisti(kod) {
  return kod
    .replace(/\/\*[\s\S]*?\*\//g, ' ')          // /* … */
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')        // // … (dvojlomítko v URL necháme)
    .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
    .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    /* A VZORKY TAKY. Tahle kontrola hlásila „belektro() se volá, ale
       v souboru není definované" — js/vybaveni.js hledá vybavení pozemku
       vzorkem …|\belektro(?:pripojk|mer)\w*|… a `\b` + `elektro` + `(`
       se od volání funkce nedá rozeznat. Falešný poplach, který se dva
       měsíce vypisoval při každém běhu, je horší než žádná kontrola:
       člověk si zvykne výpis přeskakovat a přehlédne i ten pravý.
       Vzorky se odstraňují TEPRVE PO textech v uvozovkách: v opačném
       pořadí by se lomítko v 'http://…' vzalo za začátek vzorku. */
    .replace(/(^|[(,=:[!&|?{};]|\breturn|\btypeof)(\s*)\/(?:\\.|\[(?:\\.|[^\]\\\n])*\]|[^/\\\n])+\/[gimsuyd]*/g, '$1$2/./');
}

function osireleVolani(zdroj) {
  const src = ocisti(zdroj);
  const definovane = new Set();
  for (const m of src.matchAll(/function\s+([A-Za-z_$][\w$]*)/g)) definovane.add(m[1]);
  for (const m of src.matchAll(/(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=/g)) definovane.add(m[1]);
  for (const m of src.matchAll(/([A-Za-z_$][\w$]*)\s*:\s*function/g)) definovane.add(m[1]);
  for (const m of src.matchAll(/function\s*[A-Za-z_$\w]*\s*\(([^)]*)\)/g)) {
    for (const p of m[1].split(',')) {
      const n = p.trim().split(/[\s=]/)[0];
      if (n) definovane.add(n);
    }
  }
  const volane = new Set();
  for (const m of src.matchAll(/(?:^|[^.\w$'"`])([a-z][A-Za-z0-9_$]{3,})\s*\(/gm)) volane.add(m[1]);

  const osirele = [];
  for (const v of volane) {
    if (definovane.has(v) || ZNAME.has(v)) continue;
    if (new RegExp('[.$]' + v + '\\b').test(src)) continue;
    if (new RegExp('\\b' + v + '\\s*[:=][^=]').test(src)) continue;
    osirele.push(v);
  }
  return osirele;
}

// Kontrola kontroly: na vymyšleném úryvku musí najít přesně to jedno volání.
const zkouska = osireleVolani("function closeWatch(){} document.addEventListener('keydown', function(e){ closeWatch(); closeFeedback(); });");
if (!zkouska.includes('closeFeedback') || zkouska.length !== 1) {
  console.error('::error::Statická kontrola nefunguje — na zkušebním úryvku měla najít closeFeedback(), našla: ' + JSON.stringify(zkouska));
  process.exit(1);
}

let podezreni = 0, souboru = 0;

for (const jmeno of fs.readdirSync(JS).filter((f) => f.endsWith('.js'))) {
  const src = fs.readFileSync(path.join(JS, jmeno), 'utf8');
  souboru++;

  for (const v of osireleVolani(src)) {
    console.log(`  ? js/${jmeno}: ${v}() se volá, ale v souboru není definované`);
    podezreni++;
  }
}

/* ---------- Odkaz na soubor, který neexistuje ----------
   Komentáře a dokumentace v tomhle repozitáři nesou hodně informací —
   proto je tak podrobná. Tím spíš ale škodí, když lže.
   Skutečný případ: supabase/watch-alerts.sql, 00-vse.sql a tři soubory
   v docs/ tvrdily, že e-maily rozesílá `scripts/send-alerts.mjs` přes
   GitHub Action. Ten skript v repozitáři nikdy nebyl a žádná akce ho
   nespouštěla. Podle takového popisu se dá půl hodiny hledat chyba
   v něčem, co neexistuje — a hlavně se podle něj nedá poznat, že
   e-mailové hlídání prostě neběží.
   Tohle je tvrdá chyba, ne podezření: buď ten soubor je, nebo není. */
{
  const zdroje = [];
  const projdi = (dir, hloubka) => {
    for (const j of fs.readdirSync(dir)) {
      if (j === 'node_modules' || j === '.git' || j.startsWith('.')) continue;
      const cesta = path.join(dir, j);
      const st = fs.statSync(cesta);
      if (st.isDirectory()) { if (hloubka > 0) projdi(cesta, hloubka - 1); continue; }
      if (/\.(mjs|js|sql|md|ya?ml|html)$/.test(j)) zdroje.push(cesta);
    }
  };
  projdi(ROOT, 2);
  const chybejici = new Map();
  /* Zmínit chybějící soubor SE SMÍ — pokud se na témž řádku říká, že
     chybí. Právě to je totiž ta užitečná informace („e-maily neposílá
     nikdo, protože rozesílač tu není"). Zakázané je tvrdit opak. */
  const priznanaAbsence = /nen[ií]|chyb[ií]|neexistuj|nebyl|nemá|není v repozitáři/i;
  for (const f of zdroje) {
    const rel_f = path.relative(ROOT, f);
    if (rel_f === 'scripts/test-staticka.mjs') continue;   // vlastní vzorek
    const text = fs.readFileSync(f, 'utf8');
    for (const radek of text.split('\n')) {
      for (const m of radek.matchAll(/\b(scripts|js|api|supabase)\/([\w-]+\.(?:mjs|js|sql))\b/g)) {
        const rel = m[1] + '/' + m[2];
        if (fs.existsSync(path.join(ROOT, rel))) continue;
        if (priznanaAbsence.test(radek)) continue;
        if (!chybejici.has(rel)) chybejici.set(rel, new Set());
        chybejici.get(rel).add(rel_f);
      }
    }
  }
  if (chybejici.size) {
    console.error('\nOdkaz na soubor, který v repozitáři není:');
    for (const [rel, kde] of chybejici) console.error(`  ✕ ${rel}  ← zmiňuje: ${[...kde].join(', ')}`);
    console.error('::error::Dokumentace nebo komentář odkazuje na neexistující soubor.');
    process.exit(1);
  }
  console.log(`Odkazy na soubory: ${zdroje.length} souborů prohledáno, všechny zmíněné skripty existují.`);
}

/* ---- ZKOUŠKY MUSÍ BÝT VE SPRÁVNÉ ÚLOZE -----------------------------
 *
 * Tohle je pojistka na chybu, která se opravdu stala: scripts/test-verdikt.mjs
 * potřebuje prohlížeč, ale byla zapsaná do úlohy „testy", kde se Playwright
 * neinstaluje. V CI proto padala na „Cannot find package 'playwright-core'"
 * a protože se tím zastavil celý běh, NIC dalšího už se nespustilo — od
 * 24. září byl každý běh červený, zatímco lokálně všechno procházelo.
 * Červené CI, kterého si nikdo nevšímá, nehlídá vůbec nic.
 *
 * Kontroluje se trojí: že zkouška s prohlížečem je v úloze s prohlížečem,
 * že žádná není zapsaná dvakrát (běžela by zbytečně dvakrát) a že na
 * žádnou se nezapomnělo. Soubory, které si spouští jiný workflow
 * (test-chat.yml sahá na živý Supabase), i pomocný server se nepočítají.
 */
{
  const wf = fs.readFileSync('.github/workflows/testy.yml', 'utf8');
  const jinde = fs.readdirSync('.github/workflows')
    .filter((f) => f !== 'testy.yml')
    .map((f) => fs.readFileSync('.github/workflows/' + f, 'utf8')).join('\n');
  const iT = wf.indexOf('\n  testy:'), iP = wf.indexOf('\n  v-prohlizeci:');
  const ulohaBez = iT < iP ? wf.slice(iT, iP) : wf.slice(iT);
  const ulohaProh = iT < iP ? wf.slice(iP) : wf.slice(iP, iT);
  /* Počítají se jen SPOUŠTĚNÉ zkoušky, tedy řádky s „run:". Kdyby se bralo
     celé znění souboru, počítala by se i zmínka v komentáři v hlavičce
     workflow — a hlásilo by se, že zkouška běží dvakrát, i když běží jednou.
     (Přesně na tohle jsem naletěl při psaní téhle kontroly.) */
  const jmena = (blok) => blok.split('\n')
    .filter((r) => !/^\s*#/.test(r))
    .join('\n')
    .split('\n')
    .filter((r) => /\bnode\s+scripts\/test-/.test(r))
    .flatMap((r) => r.match(/scripts\/test-[a-z0-9-]+\.mjs/g) || []);
  const vBez = new Set(jmena(ulohaBez));
  const vProh = new Set(jmena(ulohaProh));
  const vsechny = jmena(wf);

  /* Hledá se IMPORT, ne slovo kdekoli v souboru — tenhle soubor sám
     o playwrightu mluví v komentáři a hlásil by chybu na sebe.
     POČÍTÁ SE I LÍNÝ IMPORT. Dřív tu stálo jen `from 'playwright-core'`,
     a zkoušky, které si prohlížeč berou až uvnitř funkce přes
     `await import('playwright-core')`, se tím jevily jako zkoušky bez
     prohlížeče — tedy přesně ta chyba, na kterou je tahle pojistka
     (test-doporuceni.mjs to tak dělá a do rychlé úlohy nesmí).
     A ČTE SE ZDROJ BEZ KOMENTÁŘŮ. Rozšířený vzorek začal okamžitě hlásit
     chybu na tenhle soubor sám — v komentáři o dva řádky výš je napsané
     `import('playwright-core')` jako příklad. Varování v původním
     komentáři platilo dál, jen se na něj při rozšíření vzorku dalo
     zapomenout; proto se komentáře odstraňují, ne obchází. */
  const CHCE_PROHLIZEC = /(?:from|import)\s*\(?\s*['"]playwright-core['"]/;
  const bezKomentaru = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  const chceProhlizec = (cesta) => CHCE_PROHLIZEC.test(bezKomentaru(fs.readFileSync(cesta, 'utf8')));

  const spatnaUloha = [...vBez].filter(chceProhlizec);
  /* DRUHÁ STRANA TÉHOŽ. Zkouška, která prohlížeč nepotřebuje a přesto
     sedí v úloze s ním, nic nerozbije — jen čeká. Úloha „v-prohlizeci"
     nejdřív instaluje chromium (asi minuta) a pak jede jednu zkoušku po
     druhé; obyčejná uzlová kontrola tam jen prodlužuje frontu, místo aby
     běžela současně v rychlé úloze. Naměřeno 23 takových z 87, než se
     přesunuly. Výjimky se píšou sem, s důvodem — ne zamlčením. */
  const PATRI_K_PROHLIZECI = new Set([
    // scripts/test-neco.mjs  (důvod, proč patří do pomalé úlohy)
  ]);
  const zbytecneProh = [...vProh].filter((c) => !chceProhlizec(c) && !PATRI_K_PROHLIZECI.has(c));
  const dvakrat = [...new Set(vsechny.filter((x, i) => vsechny.indexOf(x) !== i))];
  // Pomocný server není zkouška, jen kulisa pro scripts/test-kontrola-e2e.mjs.
  const POMOCNE = new Set(['scripts/test-server.mjs']);
  const zapomenute = fs.readdirSync('scripts')
    .filter((f) => /^test-[a-z0-9-]+\.mjs$/.test(f))
    .map((f) => 'scripts/' + f)
    .filter((c) => !POMOCNE.has(c) && !vBez.has(c) && !vProh.has(c) && !jinde.includes(c));

  let zle = 0;
  if (spatnaUloha.length) {
    zle++;
    console.error('::error::Zkouška potřebuje prohlížeč, ale je v úloze bez něj: ' + spatnaUloha.join(', '));
  }
  if (dvakrat.length) {
    zle++;
    console.error('::error::Zkouška je ve workflow zapsaná dvakrát: ' + dvakrat.join(', '));
  }
  if (zapomenute.length) {
    zle++;
    console.error('::error::Zkouška existuje, ale nikdo ji nespouští: ' + zapomenute.join(', '));
  }
  if (zbytecneProh.length) {
    zle++;
    console.error(`::error::Zkouška prohlížeč nepotřebuje, ale čeká v úloze s ním (${zbytecneProh.length}): `
      + zbytecneProh.join(', '));
  }
  console.log(`Zařazení zkoušek: ${vBez.size} bez prohlížeče, ${vProh.size} s prohlížečem`
    + (zle ? '' : ' — všechny na svém místě, žádná dvakrát, na žádnou se nezapomnělo.'));
  if (zle) process.exit(1);
}

/* ---- ZKOUŠKA SI NESMÍ SPUSTIT TO, CO ZKOUŠÍ ------------------------
 *
 * scripts/test-data-rezy.mjs si z generátoru řezů bralo jen slug().
 * Jenže ten generátor měl práci na nejvyšší úrovni modulu, takže ji
 * prostý `import` SPUSTIL: zkouška si řezy přestavěla a teprve pak je
 * kontrolovala. Všechny čtyři sabotáže prošly — kontrola si je sama
 * spravila dřív, než se podívala. Tohle je ta nejnepříjemnější podoba
 * nefunkční zkoušky: svítí zeleně a nehlídá nic.
 *
 * Pravidlo: kdo z build skriptu importuje, ten skript musí mít svou
 * práci pod stráží `if (import.meta.url === …)`. Kontroluje se jen
 * u skriptů, které si nějaká zkouška opravdu importuje — stráž sama
 * o sobě povinná není.
 *
 * A JEN U TĚCH, KTERÉ NĚCO ZAPISUJÍ. Napoprvé tu stálo „chybí stráž"
 * na pěti dvojicích, a byly to samé knihovny bez vlastní práce
 * (okres-podle-gps.mjs, json-do-stranky.mjs, mail-sklad.mjs — jen
 * exporty, nic se při importu nestane). Takové hlášení by se naučilo
 * přeskakovat a s ním i to pravé. Nebezpečný je modul, který při
 * importu SÁHNE NA DISK; pozná se podle writeFileSync/mkdirSync.
 */
{
  const testy = fs.readdirSync('scripts').filter((f) => /^test-[a-z0-9-]+\.mjs$/.test(f));
  const bezStraze = [];
  let dvojic = 0;
  for (const t of testy) {
    const zdroj = fs.readFileSync(path.join('scripts', t), 'utf8');
    for (const m of zdroj.matchAll(/from\s+'\.\/([a-z0-9-]+\.mjs)'/g)) {
      const cil = m[1];
      if (/^test-/.test(cil) || !fs.existsSync(path.join('scripts', cil))) continue;
      dvojic++;
      const kod = fs.readFileSync(path.join('scripts', cil), 'utf8');
      const zapisuje = /\b(?:writeFileSync|mkdirSync|rmSync|unlinkSync)\s*\(/.test(kod);
      if (zapisuje && !/import\.meta\.url === /.test(kod)) bezStraze.push(`${t} → ${cil}`);
    }
  }
  console.log(`Importy mezi skripty: ${dvojic} dvojic zkouška → skript`
    + (bezStraze.length ? '' : ', žádný se importem nespustí.'));
  if (bezStraze.length) {
    console.error('::error::Zkouška importuje skript, který se importem SPUSTÍ '
      + '(chybí stráž if (import.meta.url === …)): ' + bezStraze.join(', '));
    process.exit(1);
  }
}

/* ------------------------------------------------------------------
   WEB SMÍ RADIT JEDINÝ SQL SOUBOR
   ------------------------------------------------------------------
   supabase/ je hromada migrací a create_listing je v nich v osmi
   podobách. Pustit kteroukoli z nich samostatně znamená přepsat si
   funkci starší verzí: listings-auth.sql zná deset parametrů, web
   posílá třináct — a přidání inzerátu skončí chybou 404, kterou člověk
   vidí jen jako „nepovedlo se". Právě takovou radu dávala
   /diagnostika.html na třech místech (schema.sql, listings-auth.sql,
   aktualizace.sql), tedy stránka, na kterou se chodí, když něco nejde.
   Jediné, co se má pouštět, je 00-vse.sql: skládá se ze všech migrací
   ve správném pořadí a jde pustit opakovaně.
   Hledá se jen text UKÁZANÝ ČLOVĚKU, tedy <code>supabase/…</code> —
   tak se na webu píšou názvy souborů v hláškách. Napoprvé tahle
   kontrola sahala na celý soubor a našla tři komentáře ve zdrojáku
   (hlidani.html, muj-inzerat.html), které jen poctivě říkají, odkud
   která funkce pochází. To je poznámka pro programátora, ne rada pro
   návštěvníka — a mazat ji by bylo horší než nechat být. */
{
  const strankyHtml = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const spatne = [];
  for (const f of strankyHtml) {
    const obsah = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of obsah.matchAll(/<code>supabase\/([A-Za-z0-9._-]+\.sql)<\/code>/g)) {
      if (m[1] !== '00-vse.sql') spatne.push(`${f} → supabase/${m[1]}`);
    }
  }
  if (spatne.length) {
    console.error('::error::Stránka radí pustit jednotlivou migraci místo supabase/00-vse.sql: '
      + spatne.join(', '));
    process.exit(1);
  }
  console.log(`SQL v nápovědě: ${strankyHtml.length} stránek, všechny odkazují jen na 00-vse.sql.`);
}

/* ------------------------------------------------------------------
   NA CO SE FORMULÁŘ PTÁ, TO MUSÍ NĚKAM DOJÍT
   ------------------------------------------------------------------
   Přidání pozemku je jediná cesta, kudy se na web dostane vlastní
   obsah — a zrovna tam se ptalo na věci, které se zahazovaly:
     • „Vaše jméno" bylo POVINNÉ a create_listing ho nebere,
     • „Odkaz na inzerát nebo katastr" taky nikam nešel (a kontrola
       popisu do něj lidi sama posílala),
     • popis se sice posílal, ale cestou k zobrazení se stříhal.
   Nikde přitom nebyla chyba: formulář vesele odeslal, server uložil, co
   znal, a zbytek se ztratil. Tahle kontrola to hlídá mechanicky —
   každé viditelné pole formuláře se musí objevit v těle publishListing
   (tedy v tom, co se posílá do create_listing), nebo mít napsaný důvod,
   proč ne. Přidat pole a zapomenout ho odeslat už tiše nejde. */
{
  const html = fs.readFileSync(path.join(ROOT, 'pridat.html'), 'utf8');
  const js = fs.readFileSync(path.join(ROOT, 'js', 'pridat.js'), 'utf8');
  const zacF = html.indexOf('<form class="add-form" id="form-prodej"');
  const telo = html.slice(zacF, html.indexOf('</form>', zacF));
  const zacP = js.indexOf('function publishListing()');
  const odesila = js.slice(zacP, js.indexOf('\n  }', zacP));
  /* Co se do create_listing neposílá, a proč to nevadí. Kdo sem něco
     přidá, musí napsat důvod — o to tu jde. */
  const VYJIMKY = {
    'p-souhlas': 'souhlas s pravidly — potvrzení, ne údaj o pozemku',
    'p-fotky': 'fotky se nahrávají zvlášť do úložiště a posílají jako p_photos',
    'p-zvyraznit': 'placené zvýraznění, na formuláři schválně skryté (platba není hotová)',
    'p-fotky-preview': 'jen náhled vybraných fotek',
  };
  const pole = [...telo.matchAll(/<(?:input|select|textarea)([^>]*)>/g)]
    .map((m) => ({
      id: (m[1].match(/id="([^"]+)"/) || [])[1] || '',
      skryte: /\bhidden\b/.test(m[1]) || /type="hidden"/.test(m[1]),
      site: /name="site"/.test(m[1]),
    }))
    .filter((x) => x.id && !x.skryte && !x.site);
  const ztracena = pole.filter((x) => !VYJIMKY[x.id] && odesila.indexOf("'" + x.id + "'") < 0);
  if (!pole.length || zacP < 0 || odesila.length < 400) {
    console.error('::error::Kontrola polí formuláře nic nenašla — zkontrolujte pridat.html a publishListing.');
    process.exit(1);
  }
  if (ztracena.length) {
    console.error('::error::Formulář se ptá na pole, které se neodesílá: '
      + ztracena.map((x) => x.id).join(', ')
      + ' (buď ho poslat do create_listing, nebo dopsat důvod do VYJIMKY v této zkoušce)');
    process.exit(1);
  }
  console.log(`Pole formuláře: ${pole.length} viditelných, všechna se odesílají `
    + `(+${Object.keys(VYJIMKY).length} s napsaným důvodem).`);
}

/* --- KDO SE TVÁŘÍ JAKO APLIKACE, MUSÍ JÍ BÝT --------------------------
 *
 * Web má manifest.webmanifest, takže se dá nainstalovat jako aplikace —
 * a Hlídání, Upozornění i Zprávy o sobě samy píšou „přímo v aplikaci".
 * Zrovna ty tři ho ale v hlavičce neměly: kdo na nich stál, neměl si co
 * nainstalovat. Bylo to opomenutí při kopírování hlavičky, ne záměr, a
 * poznalo se to jedině tím, že se stránky porovnaly mezi sebou.
 *
 * Pravidlo je proto vnitřní: kdo má ikonu pro domovskou obrazovku
 * (apple-touch-icon), má i manifest. Přesměrování ze starých adres,
 * chybová stránka ani předloha ikonu nemají, takže se jich to netýká —
 * a kdyby někdo takovou stránku přidal, nespadne to na ní zbytečně.
 */
{
  const KOREN2 = ROOT;
  const stranky = fs.readdirSync(KOREN2)
    .filter((f) => f.endsWith('.html') && !/^pozemek-|^pozemky-okres|^pozemky-kraj/.test(f));
  const chybi = stranky.filter((f) => {
    const h = fs.readFileSync(path.join(KOREN2, f), 'utf8');
    return /apple-touch-icon/.test(h) && !/rel="manifest"/.test(h);
  });
  if (!stranky.length) {
    console.error('::error::Nenašly se žádné stránky — kontrola manifestu by nic neměřila.');
    process.exit(1);
  }
  if (chybi.length) {
    console.error('::error::Stránka se tváří jako aplikace (apple-touch-icon), ale nemá manifest: '
      + chybi.join(', '));
    process.exit(1);
  }
  console.log(`Manifest aplikace: ${stranky.filter((f) => /rel="manifest"/.test(fs.readFileSync(path.join(KOREN2, f), 'utf8'))).length} z ${stranky.length} hlavních stránek (zbytek ho mít nemá).`);

  /* A kdo se tváří jako aplikace, musí se dát použít i bez signálu.
     Registrace service workeru se musí stát na KAŽDÉ stránce: většina
     návštěv přichází z vyhledávače přímo na stránku pozemku, ne na úvod,
     a kdo se na úvod nikdy nedostane, offline režim by nedostal. */
  const vsechnyStranky = fs.readdirSync(KOREN2).filter((f) => f.endsWith('.html'));
  const bezOffline = vsechnyStranky.filter((f) => {
    const h = fs.readFileSync(path.join(KOREN2, f), 'utf8');
    return /rel="manifest"/.test(h) && !/<script src="js\/(?:min\/)?offline\.js/.test(h);
  });
  if (bezOffline.length) {
    console.error('::error::Stránka má manifest, ale nepřihlašuje service worker (bez signálu neukáže nic): '
      + bezOffline.slice(0, 5).join(', ') + (bezOffline.length > 5 ? ` a ${bezOffline.length - 5} dalších` : ''));
    process.exit(1);
  }
  const sOffline = vsechnyStranky.filter((f) => /<script src="js\/(?:min\/)?offline\.js/.test(fs.readFileSync(path.join(KOREN2, f), 'utf8'))).length;
  if (sOffline < 2000) {
    console.error(`::error::Service worker se přihlašuje jen na ${sOffline} stránkách — čekáno přes 2 000.`);
    process.exit(1);
  }
  /* SERVICE WORKER SE NESMÍ STAMPOVAT ANI MINIFIKOVAT, a je to tiché
     riziko: kdyby sw.js někdo přidal do scripts/minifikace.mjs nebo do
     scripts/orazitkuj-verze.mjs, registrace by ukazovala na adresu, která
     neexistuje — a offline režim by beze slova přestal fungovat.
     Prohlížeč navíc pozná novou verzi workeru tím, že porovná BAJTY na
     TÉŽE adrese; s ?v=… v adrese by se nová verze tvářila jako jiný
     worker a přestal by platit i postup na vypnutí, který je v hlavičce
     sw.js popsaný (náhrada obsahu za verzi, co se sama odhlásí). */
  if (!fs.existsSync(path.join(KOREN2, 'sw.js'))) {
    console.error('::error::sw.js chybí — offline režim by nefungoval.');
    process.exit(1);
  }
  if (fs.existsSync(path.join(KOREN2, 'js', 'min', 'sw.js'))) {
    console.error('::error::sw.js se minifikuje do js/min/ — registrace ukazuje na sw.js v korenu, takže by přestala platit.');
    process.exit(1);
  }
  const reg = fs.readFileSync(path.join(KOREN2, 'js', 'offline.js'), 'utf8');
  const regMin = fs.existsSync(path.join(KOREN2, 'js', 'min', 'offline.js'))
    ? fs.readFileSync(path.join(KOREN2, 'js', 'min', 'offline.js'), 'utf8') : '';
  for (const [kde, text] of [['js/offline.js', reg], ['js/min/offline.js', regMin]]) {
    if (!text) continue;
    if (!/register\('sw\.js'\)/.test(text)) {
      console.error(`::error::${kde} už neregistruje 'sw.js' — offline režim by nefungoval.`);
      process.exit(1);
    }
    if (/sw\.js\?v=/.test(text)) {
      console.error(`::error::${kde} registruje sw.js s verzí v adrese — prohlížeč pozná novou verzi podle bajtů na téže adrese, takže by to rozbilo i vypnutí workeru.`);
      process.exit(1);
    }
  }
  console.log(`Offline režim: service worker se přihlašuje na ${sOffline} stránkách, sw.js se nestampuje.`);
}

/* --- ŽÁDNÁ STRÁNKA SI NESMÍ ŘÍKAT O SKRIPT, KTERÝ NEEXISTUJE -------
 *
 * Tohle se stalo: kalkulačka návratnosti šla na přání pryč i se svým
 * js/navratnost.js, jenže 94 už UKONČENÝCH stránek pozemků (ty, co
 * čekají devadesát dní, než se smažou) si o něj dál říkalo. Generátor je
 * nepřepisuje celé — záměrně, už jsou to náhrobky — a jeho migrace
 * skriptů nechávala na pokoji všechno, co nezná předloha. Týž popis
 * ale sedí na ručně přidaný skript i na skript, který z předlohy zmizel.
 * Výsledek: 94 stránek, z nichž každá posílala požadavek končící 404.
 *
 * Kontrola je záměrně hloupá: vezme každý <script src="js/…">
 * a podívá se, jestli ten soubor na disku je. */
{
  const chybejici = new Map();
  const zakomentovane = [];
  let stranek = 0, odkazu = 0;
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    stranek++;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const m of h.matchAll(/<script[^>]+src="(js\/[^"?]+\.js)/g)) {
      odkazu++;
      if (fs.existsSync(path.join(ROOT, m[1]))) continue;
      if (!chybejici.has(m[1])) chybejici.set(m[1], []);
      chybejici.get(m[1]).push(f);
    }
    /* A DRUHÁ POLOVINA TÉŽE KONTROLY: soubor sice existuje, ale stránka
       ho nespustí, protože celý odkaz leží v komentáři. Naměřeno na
       pozemek-beroun-beroun-cpw8uy.html: migrace skriptů vložila blok
       o 55 znaků dál, doprostřed vysvětlivky, takže `<!--` spolklo
       všech devatenáct skriptů. Soubory přitom na disku všechny byly,
       takže kontrola výš mlčela — a stránka nedělala vůbec nic.
       Takový stav se navíc sám nespraví: ukončená stránka se nevyrábí
       z dat, jen se jí dohánějí přepisy, a migrace skriptů komentáře
       nerozlišuje — vyjme devatenáct skriptů a vloží je zpátky na
       totéž místo, tedy znovu dovnitř komentáře. Zastavit to musí
       tahle kontrola, než se to dostane do commitu. */
    for (const k of h.matchAll(/<!--[\s\S]*?-->/g)) {
      const kolik = (k[0].match(/<script[^>]+src="js\//g) || []).length;
      if (kolik) zakomentovane.push({ f, kolik });
    }
  }
  if (zakomentovane.length) {
    for (const { f, kolik } of zakomentovane.slice(0, 5)) {
      console.error(`::error::${f}: ${kolik} odkazů na skripty uvízlo v HTML komentáři — stránka je nespustí.`);
    }
    if (zakomentovane.length > 5) console.error(`::error::… a dalších ${zakomentovane.length - 5} stránek.`);
    process.exit(1);
  }
  if (!odkazu) {
    console.error('::error::Na žádné stránce není odkaz na skript js/ — kontrola by prošla naprázdno.');
    process.exit(1);
  }
  if (chybejici.size) {
    for (const [adr, kde] of chybejici) {
      console.error(`::error::Stránky si říkají o ${adr}, který neexistuje (${kde.length}×, např. ${kde[0]}).`);
    }
    process.exit(1);
  }
  console.log(`Odkazy na skripty: ${odkazu} na ${stranek} stránkách, všechny soubory existují.`);
}

/* ----------------------------------------------------------------------
 * A TOTÉŽ NA ODKAZY. Mrtvý <script src> se našel měřením; mrtvý <a href>
 * by se nenašel vůbec — nikdo nekontroloval, že cíl odkazu existuje.
 * Je to přesně ten druh vady, který vzniká odebráním: stránka se smaže
 * nebo přejmenuje, odkazy na ni zůstanou, a návštěvník dostane 404.
 * U webu, jehož hlavní aktivum je přes 2 100 zaindexovaných adres, je
 * rozbitý vnitřní odkaz dražší než kdekoli jinde.
 *
 * Skripty a komentáře se odstřihnou PŘED hledáním. Uvnitř nich bývají
 * skládané adresy (href="' + params + '") a vypnuté úryvky — adresa
 * z nich není adresa stránky a kontrola by hlásila pět vad, které
 * žádné vady nejsou. Naměřeno: s nimi 105 118 odkazů a 5 planých
 * nálezů, bez nich 63 082 odkazů a nula. */
{
  const chybi = new Map();
  let stranek = 0, odkazu = 0;
  for (const f of fs.readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    stranek++;
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, '')
      .replace(/<!--[\s\S]*?-->/g, '');
    for (const m of h.matchAll(/(?:href|src)="([^"]+)"/g)) {
      const cil = m[1].split('#')[0].split('?')[0];
      if (!cil || /^(https?:|mailto:|tel:|data:|javascript:|\/\/)/i.test(cil)) continue;
      odkazu++;
      const rel = cil.startsWith('/') ? cil.slice(1) : cil;
      if (fs.existsSync(path.join(ROOT, rel))) continue;
      if (!chybi.has(rel)) chybi.set(rel, []);
      chybi.get(rel).push(f);
    }
  }
  /* Pojistka: kdyby se změnil zápis atributů a vzor přestal sedět,
     kontrola by prošla s nulou odkazů — a mlčela by navždy. */
  if (odkazu < 1000) {
    console.error(`::error::Vnitřních odkazů se našlo jen ${odkazu} — kontrola by prošla naprázdno.`);
    process.exit(1);
  }
  if (chybi.size) {
    for (const [cil, kde] of [...chybi].sort((a, b) => b[1].length - a[1].length).slice(0, 8)) {
      console.error(`::error::Odkaz na ${cil} nikam nevede (${kde.length}×, např. ${kde[0]}).`);
    }
    if (chybi.size > 8) console.error(`::error::… a dalších ${chybi.size - 8} cílů.`);
    process.exit(1);
  }
  console.log(`Vnitřní odkazy: ${odkazu} na ${stranek} stránkách, všechny cíle existují.`);
}

/* ----------------------------------------------------------------------
 * A TOTÉŽ NA DOKUMENTACI. Dokumentace stárne tiše: funkce se odebere,
 * soubor se smaže, a text o něm mluví dál v přítomném čase. Naměřeno
 * při úklidu: ze 66 odkazů na soubory v docs/*.md mířily dva na
 * js/upozorneni.js a upozorneni.html — funkci Upozornění přitom
 * majitel webu nechal odebrat celou. Roadmapa k tomu tvrdila, že
 * „centrum upozornění je v aplikaci hotové a běží".
 *
 * Kontrola je stejně hloupá jako ty dvě nad ní: vezme každý název
 * souboru v `zpětných uvozovkách` a podívá se, jestli existuje.
 * Holý název bez složky (00-vse.sql) se hledá i podle jména, protože
 * dokumentace píše o souborech lidsky, ne cestou od kořene. */
{
  const vzor = /`([a-z0-9][a-z0-9._/-]*\.(?:mjs|js|html|css|sql|json|yml|md))`/g;
  const vsechny = new Map();          // jméno souboru → kolik jich v repozitáři je
  (function projdi(adr) {
    for (const f of fs.readdirSync(path.join(ROOT, adr), { withFileTypes: true })) {
      if (f.name === 'node_modules' || f.name === '.git') continue;
      const rel = adr ? adr + '/' + f.name : f.name;
      if (f.isDirectory()) projdi(rel);
      else vsechny.set(f.name, (vsechny.get(f.name) || 0) + 1);
    }
  }('')); 
  const chybi = new Map();
  let odkazu = 0;
  const dokumenty = fs.readdirSync(path.join(ROOT, 'docs')).filter((f) => f.endsWith('.md'));
  for (const f of dokumenty) {
    const s = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
    for (const m of s.matchAll(vzor)) {
      const cil = m[1];
      odkazu++;
      if (fs.existsSync(path.join(ROOT, cil))) continue;
      if (fs.existsSync(path.join(ROOT, 'docs', cil))) continue;
      if (vsechny.has(cil.split('/').pop())) continue;   // holé jméno, soubor existuje jinde
      if (!chybi.has(f)) chybi.set(f, new Set());
      chybi.get(f).add(cil);
    }
  }
  if (odkazu < 20) {
    console.error(`::error::V dokumentaci se našlo jen ${odkazu} odkazů na soubory — kontrola by prošla naprázdno.`);
    process.exit(1);
  }
  if (chibi(chybi)) {
    for (const [f, cile] of chybi) {
      console.error(`::error::docs/${f} mluví o souborech, které nejsou: ${[...cile].join(', ')}`);
    }
    process.exit(1);
  }
  console.log(`Dokumentace: ${odkazu} odkazů na soubory v ${dokumenty.length} textech, všechny existují.`);
}
function chibi(m) { return m.size > 0; }

console.log(`\nStatická kontrola: ${souboru} souborů, ${podezreni ? podezreni + ' podezřelých volání' : 'žádné osiřelé volání'}.`);
// Nepadáme — jsou to podezření, ne jistoty. Padá se jen tehdy, když by
// bylo podezření nápadně moc (to už znamená, že se rozbil rozbor sám).
if (podezreni > 40) {
  console.error('::error::Podezřelých volání je nezvykle moc — zkontrolujte skripty.');
  process.exit(1);
}

/* --- Každý testovací skript musí být aspoň přeložitelný ----------------
 *
 * Tohle se stalo: odstranění tmavého režimu smazalo z test-rozvrzeni.mjs
 * blok, který otvíral prohlížeč, ale nechalo tam jeho poslední dva řádky
 * (`await rozbor.close();` a závorku). Soubor přestal být přeložitelný —
 * a dávka ho dál hlásila jako spuštěný, protože jsem čtl výpis z běhu
 * před tím commitem. Dva commity tak odešly s testem, který se ani
 * nenačte. Nejde o to, že test neprošel; nešel ani spustit.
 *
 * Kontrola je schválně hloupá: nic nespouští, jen se zeptá Node, jestli
 * tomu rozumí. To stačí — tahle vada je vždycky syntaktická.
 */
{
  const { execFileSync } = await import('node:child_process');
  const testy = fs.readdirSync(path.join(ROOT, 'scripts'))
    .filter((f) => f.endsWith('.mjs'))
    .map((f) => path.join('scripts', f));
  /* Pojistka proti měření prázdna: kdyby se adresář přejmenoval, seznam
     by byl prázdný a kontrola by „prošla" s nulou souborů. */
  if (testy.length < 100) {
    console.error(`::error::Ke kontrole přeložitelnosti se našlo jen ${testy.length} skriptů — seznam se nenaplnil, kontrola nic neměřila.`);
    process.exit(1);
  }
  const nepreloziltelne = [];
  for (const rel of testy) {
    try {
      execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
    } catch (e) {
      const prvni = String(e.stderr || '').split('\n').find((r) => /Error/.test(r)) || 'nepřeložitelné';
      nepreloziltelne.push(`${rel}: ${prvni.trim()}`);
    }
  }
  if (nepreloziltelne.length) {
    console.error('::error::Tyhle skripty se ani nenačtou:');
    for (const z of nepreloziltelne) console.error('  ✕ ' + z);
    process.exit(1);
  }
  console.log(`Přeložitelnost: ${testy.length} skriptů ve scripts/ se načte.`);
}

/* ---- POČET, KTERÝ SE MĚNÍ SÁM OD SEBE, NEPATŘÍ DO KOMENTÁŘE -------
   Pravidlo je zapsané v hlavičce sw.js: „Stálo tu — ‚na 2 125
   stránkách' — a za pár týdnů jich bylo 2 158, protože stránek pozemku
   přibývá a ubývá s nabídkami. Počet, který se mění sám od sebe, se do
   komentáře psát nemá: nikdo ho neopraví a začne lhát."

   Dodržené to nebylo ani v tom samém souboru. Naměřeno: dvě místa
   tvrdila v přítomném čase „stránek je 2 130" (sw.js) a „stránek je
   2 105" (js/hlavicka.js), zatímco jich bylo 2 207 — tedy obě lhala,
   přesně jak ta hlavička předpovídá.

   Hlídá se jen PŘÍTOMNÝ ČAS s číslem („stránek je 2 105"). Naměřený
   stav v minulém čase („na 2 105 stránkách", „naměřeno na 2 001
   nabídkách") je něco jiného: ten se měnit NEMÁ, protože popisuje, co
   se tehdy změřilo. */
{
  const zdroje = [];
  const projdi = (adresar) => {
    for (const f of fs.readdirSync(path.join(ROOT, adresar), { withFileTypes: true })) {
      if (f.isDirectory()) continue;
      if (!/\.(js|mjs)$/.test(f.name)) continue;
      if (/^test-/.test(f.name)) continue;
      zdroje.push(path.join(adresar, f.name));
    }
  };
  projdi('js'); projdi('scripts');
  zdroje.push('sw.js');
  /* Jen počet STRÁNEK, protože právě o něm to pravidlo je. U nabídek se
     táž slova používají v naměřených větách („z 2 014 nabídek je 1 852
     na prodej"), a ty se měnit nemají — lint na ně narazil hned při
     prvním běhu a správná odpověď byla zúžit lint, ne přepisovat
     poctivě naměřené číslo. */
  const PRITOMNY = /(stránek|stránky) (je|jsou) [0-9][0-9\s\u00a0]{2,}/gi;
  const lzi = [];
  for (const rel of zdroje) {
    let s;
    try { s = fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch (e) { continue; }
    for (const m of s.matchAll(PRITOMNY)) {
      lzi.push(`${rel}:${s.slice(0, m.index).split('\n').length} „${m[0].trim()}"`);
    }
  }
  if (lzi.length) {
    console.error('::error::Počet, který se mění sám od sebe, nepatří do komentáře: '
      + lzi.slice(0, 4).join(' | '));
    process.exit(1);
  }
  console.log(`Komentáře: ${zdroje.length} zdrojů, žádný netvrdí v přítomném čase počet, který se mění sám.`);
}
