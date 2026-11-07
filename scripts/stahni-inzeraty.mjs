/* Inzeráty od lidí z databáze do data/user-listings.json.
 *
 * Spuštění:  node scripts/stahni-inzeraty.mjs
 * Volá ho .github/workflows/update-data.yml v nočním robotovi, hned za
 * stažením dat ze zdrojů. NEPOUŠTÍ ho scripts/oprav.mjs: ten musí zůstat
 * offline a idempotentní (hlídá to test-oprav.mjs), a tohle chodí po síti.
 *
 * PROČ TO VZNIKLO. Web čte inzeráty od lidí DVĚMA cestami:
 *   1) živě přes RPC public_listings() při každém načtení stránky,
 *   2) ze statického data/user-listings.json, které se přibalí k webu.
 * Cesta 1 má strop 2,5 vteřiny (js/main.js, ZIVE_STROP): když Supabase
 * odpoví pomaleji — na mobilní síti běžné — web inzeráty POTICHU vynechá.
 * Cesta 2 to měla zachytit, jenže ten soubor nikdo neobnovoval: ležel
 * v repozitáři prázdný (`[]`) od 14. 10. 2026. Výsledkem bylo, že na
 * pomalém připojení nebyl inzerát od člověka vidět vůbec a nikde nic
 * nekřičelo.
 *
 * CO SE ZAPISUJE: surové řádky tak, jak je vrací public_listings() —
 * TEDY TENTÝŽ TVAR, jaký chodí živě. Převod na nabídku dělá na obou
 * stranách jediná funkce PKCisteni.majitele() (js/cisteni.js), aby se
 * statická a živá cesta nemohly rozejít.
 *
 * ČTE:  js/config.js (adresa projektu a VEŘEJNÝ anon klíč — tentýž, který
 *       má v sobě každý prohlížeč; servisní klíč tu nemá co dělat).
 * PÍŠE: data/user-listings.json
 *
 * PŘI VÝPADKU NEMAŽE. Když databáze neodpoví nebo vrátí nesmysl, starý
 * soubor zůstane a skript skončí varováním, ne pádem — stejné pravidlo
 * jako u výpadku zdroje (docs/optimalizace.md §220): raději včerejší
 * data než prázdný web.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSLimitem } from './fetch-s-limitem.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CIL = path.join(KOREN, 'data', 'user-listings.json');

const cfg = readFileSync(path.join(KOREN, 'js', 'config.js'), 'utf8');
const url = (process.env.SUPABASE_URL
  || (/PK_SUPABASE_URL\s*=\s*'([^']+)'/.exec(cfg) || [])[1] || '').replace(/\/+$/, '');
const klic = (/PK_SUPABASE_KEY\s*=\s*'([^']+)'/.exec(cfg) || [])[1] || '';

function varovat(proc) {
  console.log('::warning::Inzeráty od lidí se nestáhly (' + proc + ') — ponechávám starý soubor.');
  process.exit(0);
}

if (!url || !klic) varovat('v js/config.js chybí adresa nebo veřejný klíč');

let odpoved;
try {
  odpoved = await fetchSLimitem(url + '/rest/v1/rpc/public_listings', {
    method: 'POST',
    headers: { apikey: klic, Authorization: 'Bearer ' + klic, 'Content-Type': 'application/json' },
    body: '{}',
  }, 20000);
} catch (e) { varovat(e.message); }

if (!odpoved.ok) varovat('HTTP ' + odpoved.status);

let radky;
try { radky = await odpoved.json(); } catch (e) { varovat('odpověď není JSON'); }
if (!Array.isArray(radky)) varovat('odpověď není seznam');

/* Pořadí podle id, ne podle data: data/user-listings.json se komituje
   a běh robota nemá soubor měnit jen proto, že databáze vrátila řádky
   v jiném pořadí. Bez tohohle by se každou noc komitoval rozdíl, který
   žádný rozdíl není. */
radky.sort((a, b) => String(a && a.id).localeCompare(String(b && b.id)));

const stare = (() => { try { return readFileSync(CIL, 'utf8'); } catch (e) { return ''; } })();
const nove = JSON.stringify(radky, null, 2) + '\n';
if (nove === stare) {
  console.log('Inzeráty od lidí: ' + radky.length + ' — beze změny.');
} else {
  writeFileSync(CIL, nove);
  console.log('Inzeráty od lidí: ' + radky.length + ' — zapsáno do data/user-listings.json.');
}
