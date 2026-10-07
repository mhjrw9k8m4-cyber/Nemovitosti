// Test: nasazení databáze jedním tlačítkem (scripts/nasad-sql.mjs).
//
// Spuštění: node scripts/test-nasad-sql.mjs   (bez prohlížeče a bez sítě)
//
// Skript posílá celou databázi do ostrého projektu. Dvě věci se u něj
// musí hlídat, protože obě selžou tiše:
//  • KAM se to pošle. Označení projektu se odvozuje z adresy; kdyby se
//    odvodilo špatně, odešlo by SQL do cizího projektu nebo nikam.
//  • CO se pošle. Prázdný nebo osekaný soubor by databázi nepoškodil,
//    ale běh by skončil zeleně a vypadalo by to na nasazeno.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { oznaceniProjektu, popisSQL } from './nasad-sql.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Odkud se pozná projekt ------------------------------------- */
pravda('z běžné adresy se pozná označení projektu',
  oznaceniProjektu('https://tcinuzftgmkvjjgvadky.supabase.co') === 'tcinuzftgmkvjjgvadky');
pravda('a nevadí mezera okolo',
  oznaceniProjektu('  https://abcdefgh.supabase.co  ') === 'abcdefgh');
pravda('ani lomítko na konci',
  oznaceniProjektu('https://abcdefgh.supabase.co/') === 'abcdefgh');

/* Prázdno a nesmysly musí vrátit null, ne hádat. Skript na null skončí
   s hláškou; kdyby místo toho vymyslel označení, poslal by SQL pryč. */
for (const [co, popis] of [
  ['', 'prázdná adresa'],
  [undefined, 'chybějící adresa'],
  ['abcdefgh', 'samotné označení bez adresy'],
  ['https://example.com', 'cizí doména'],
  ['https://supabase.co', 'adresa bez projektu'],
  ['localhost:8310', 'místní server'],
]) {
  pravda(`${popis} nedá žádné označení`, oznaceniProjektu(co) === null,
    `vyšlo „${oznaceniProjektu(co)}"`);
}

/* --- 2) Co se vlastně pošle ---------------------------------------- */
{
  const sql = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
  const p = popisSQL(sql);
  // PŘEDPOKLAD: bez souboru nemá smysl měřit nic dalšího
  pravda('supabase/00-vse.sql existuje a není prázdný', p.bajtu > 1000,
    `má ${p.bajtu} bajtů`);
  pravda('zakládá tabulky', p.tabulek > 0, `tabulek: ${p.tabulek}`);
  pravda('a definuje funkce', p.funkci > 0, `funkcí: ${p.funkci}`);
  pravda('a nastavuje pravidla přístupu k řádkům',
    p.pravidel > 0, `pravidel: ${p.pravidel}`);
  /* Poznámky na účtu jsou to, kvůli čemu se tohle nasazení dělá —
     kdyby v balíku nebyly, nasadilo by se všechno kromě nich. */
  pravda('a je v něm tabulka poznámek (kvůli ní se to nasazuje)',
    /create table if not exists poznamky/i.test(sql));
  pravda('a funkce, která chyběla a kvůli které chodil denní e-mail z CI',
    /function hlidani_k_odeslani/i.test(sql));
}

/* --- 3) Workflow na to musí umět sáhnout --------------------------- */
{
  const w = readFileSync(path.join(KOREN, '.github', 'workflows', 'nasad-sql.yml'), 'utf8');
  pravda('workflow volá tenhle skript', /node scripts\/nasad-sql\.mjs/.test(w));
  /* Ruční spuštění, žádný cron: nasazení databáze, které se rozjede samo
     po pushnutí, je přesně to, co se nemá stát. */
  pravda('a pouští se JEN ručně, žádný cron',
    /workflow_dispatch:/.test(w) && !/^\s*schedule:/m.test(w),
    'v souboru je schedule — databáze by se nasazovala sama');
  pravda('a výchozí volba je nasucho, ne nasadit',
    /opravdu:[\s\S]*?default:\s*false/.test(w));
  pravda('a bere token z tajných klíčů, ne z kódu',
    /SUPABASE_PAT:\s*\$\{\{\s*secrets\.SUPABASE_PAT\s*\}\}/.test(w));
  /* Soubor se před odesláním skládá znovu — jinak by se dala nasadit
     verze, která se rozešla s jednotlivými soubory v supabase/. */
  pravda('a před odesláním databázi složí znovu ze zdrojů',
    /node scripts\/build-sql\.mjs/.test(w));
}

console.log('\nNasazení databáze');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Nasazení databáze: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
