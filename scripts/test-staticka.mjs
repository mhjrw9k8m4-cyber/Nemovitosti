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

console.log(`\nStatická kontrola: ${souboru} souborů, ${podezreni ? podezreni + ' podezřelých volání' : 'žádné osiřelé volání'}.`);
// Nepadáme — jsou to podezření, ne jistoty. Padá se jen tehdy, když by
// bylo podezření nápadně moc (to už znamená, že se rozbil rozbor sám).
if (podezreni > 40) {
  console.error('::error::Podezřelých volání je nezvykle moc — zkontrolujte skripty.');
  process.exit(1);
}
