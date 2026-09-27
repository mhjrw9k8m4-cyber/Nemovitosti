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
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
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

  const spatnaUloha = [];
  for (const cesta of vBez) {
    /* Hledá se IMPORT, ne slovo kdekoli v souboru — tenhle soubor sám
       o playwrightu mluví v komentáři a hlásil by chybu na sebe. */
    if (/from\s+['"]playwright-core['"]/.test(fs.readFileSync(cesta, 'utf8'))) spatnaUloha.push(cesta);
  }
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
  console.log(`Zařazení zkoušek: ${vBez.size} bez prohlížeče, ${vProh.size} s prohlížečem`
    + (zle ? '' : ' — všechny na svém místě, žádná dvakrát, na žádnou se nezapomnělo.'));
  if (zle) process.exit(1);
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

console.log(`\nStatická kontrola: ${souboru} souborů, ${podezreni ? podezreni + ' podezřelých volání' : 'žádné osiřelé volání'}.`);
// Nepadáme — jsou to podezření, ne jistoty. Padá se jen tehdy, když by
// bylo podezření nápadně moc (to už znamená, že se rozbil rozbor sám).
if (podezreni > 40) {
  console.error('::error::Podezřelých volání je nezvykle moc — zkontrolujte skripty.');
  process.exit(1);
}
