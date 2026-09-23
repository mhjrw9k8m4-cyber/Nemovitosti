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

console.log(`\nStatická kontrola: ${souboru} souborů, ${podezreni ? podezreni + ' podezřelých volání' : 'žádné osiřelé volání'}.`);
// Nepadáme — jsou to podezření, ne jistoty. Padá se jen tehdy, když by
// bylo podezření nápadně moc (to už znamená, že se rozbil rozbor sám).
if (podezreni > 40) {
  console.error('::error::Podezřelých volání je nezvykle moc — zkontrolujte skripty.');
  process.exit(1);
}
