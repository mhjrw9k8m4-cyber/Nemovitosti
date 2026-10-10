/* KDO SMÍ PSÁT DO DATABÁZE S VEŘEJNÝM KLÍČEM
 * ------------------------------------------
 * Veřejný („publishable") klíč je v js/config.js a to je správně — chrání
 * ho řádková bezpečnost (RLS). Celá ta ochrana ale stojí na podmínkách
 * v pravidlech, a `with check (true)` nehlídá NIC: kdo klíč má, vloží
 * řádek s jakýmikoli hodnotami.
 *
 * Takhle se našlo, že do watch_subscriptions šlo vložit řádek, který už
 * má `confirmed = true` — tedy obejít dvojí potvrzení e-mailu, u kterého
 * v schema.sql stojí „zákon vyžaduje souhlas". Nebo si zvolit vlastní
 * `confirm_token` a poslat ho do veřejné funkce confirm_watch().
 *
 * Zkouška čte HOTOVÝ balík supabase/00-vse.sql — tedy to, co majitel
 * opravdu spustí — a u každého pravidla bere jeho POSLEDNÍ podobu
 * v souboru, protože pozdější `create policy` tu dřívější přepíše.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0; let chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* VOLNÝ ZÁPIS S DŮVODEM. Kontaktní formulář pošle zprávu bez účtu, takže
   u něj `with check (true)` smysl má — čtení té tabulky má jen majitel
   (service_role) a žádný sloupec se tam netváří jako povolení k něčemu
   dalšímu. Kdyby takových tabulek mělo být víc, patří sem i s důvodem;
   prázdný důvod se nepočítá. */
const VOLNY_ZAPIS = {
  messages: 'kontaktní formulář bez účtu; čtení má jen majitel (service_role) '
    + 'a žádný sloupec nic nepovoluje',
};

const sql = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
const posledni = new Map();
for (const m of sql.matchAll(/create policy "([^"]+)"\s+on ([a-z_0-9.]+) for ([a-z]+) to ([^\s]+)([\s\S]*?);/gi)) {
  const [, jmeno, tabulka, prikaz, role, zbytek] = m;
  posledni.set(tabulka + '|' + jmeno, { tabulka, jmeno, prikaz: prikaz.toLowerCase(),
    role, podminka: zbytek.replace(/\s+/g, ' ').trim() });
}
const vsechna = [...posledni.values()];
const zapisAnon = vsechna.filter((p) => /anon/.test(p.role)
  && ['insert', 'update', 'delete', 'all'].indexOf(p.prikaz) !== -1);

pravda(`pravidel v balíku je dost, aby to něco znamenalo (${vsechna.length})`,
  vsechna.length >= 10, `nalezeno ${vsechna.length} — vzorec na pravidla nejspíš nesedí`);
pravda(`a aspoň nějaké pouští zápis s veřejným klíčem (${zapisAnon.length})`,
  zapisAnon.length >= 1, 'žádné — kontrola níž by měřila prázdno');

{
  const volna = zapisAnon.filter((p) => /with check \(\s*true\s*\)/i.test(p.podminka));
  const bezDuvodu = volna.filter((p) => !VOLNY_ZAPIS[p.tabulka]);
  pravda('každý volný zápis (with check (true)) má u sebe napsaný důvod',
    bezDuvodu.length === 0,
    bezDuvodu.map((p) => `${p.tabulka} · ${p.jmeno}`).join(' | '));
}
{
  /* A naopak: důvod bez pravidla je stará poznámka, která přežila to,
     co popisovala. */
  const zbytecne = Object.keys(VOLNY_ZAPIS)
    .filter((t) => !zapisAnon.some((p) => p.tabulka === t));
  pravda('a žádný zapsaný důvod nezůstal po pravidle, které už není',
    zbytecne.length === 0, zbytecne.join(', '));
}

/* --- A TO KONKRÉTNÍ, CO SE OPRAVILO ------------------------------- */
{
  const p = zapisAnon.find((x) => x.tabulka === 'watch_subscriptions' && x.prikaz === 'insert');
  pravda('veřejný zápis hlídání v balíku je (jinak se neměří nic)', !!p,
    'pravidlo pro watch_subscriptions se nenašlo');
  if (p) {
    pravda('a nedovolí vložit už potvrzenou přihlášku',
      /confirmed\s*=\s*false/i.test(p.podminka), p.podminka.slice(0, 160));
    pravda('ani si zvolit vlastní potvrzovací token',
      /confirm_token\s+is\s+null/i.test(p.podminka), p.podminka.slice(0, 160));
    pravda('a drží délku e-mailu', /length\(email\)/i.test(p.podminka), p.podminka.slice(0, 160));
  }
}

console.log('\nZápis do databáze s veřejným klíčem');
console.log(zpravy.join('\n'));
console.log(`\nPravidel celkem: ${vsechna.length}, z toho zápis pro anon: ${zapisAnon.length}`);
if (chyb) {
  console.log('::error::Veřejný zápis: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
console.log(`\n${ok} v pořádku, 0 chyb\n`);
