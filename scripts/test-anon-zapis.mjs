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

/* VOLNÝ ZÁPIS S DŮVODEM. Dnes žádný takový není a je to tak správně;
   kdyby přibyl, patří sem i s důvodem (prázdný důvod se nepočítá).

   STÁL TU `messages` — kontaktní formulář bez účtu — s důvodem „čtení té
   tabulky má jen majitel (service_role) a žádný sloupec nic nepovoluje".
   OBĚ POLOVINY TÉ VĚTY PLATILY a díra tam přesto byla: nad `messages`
   visí spouštěč `trg_notify_new_message`, který každým vložením pošle
   e-mail přes Resend. Z práva vložit řádek se tím stalo právo poslat
   e-mail — tisíc dotazů veřejným klíčem = tisíc e-mailů majiteli
   a vyčerpaná kvóta poštovní služby, kterou se posílá i hlídání nabídek.
   Důvod tedy nebyl chybný; byl neúplný o to, co se tou tabulkou SPUSTÍ.
   Z toho pravidlo níž: u volného zápisu nerozhoduje jen to, kdo řádek
   přečte, ale i co jeho vložení rozpohybuje.
   Opraveno v supabase/zpravy-strop.sql (§469). */
const VOLNY_ZAPIS = {};

/* Tabulky, nad kterými visí spouštěč. Zápis do nich nesmí být volný ani
   bez stropu, protože se jím něco DĚJE — tady se posílá pošta. */
const SE_SPOUSTECEM = ['messages'];

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

/* --- ZÁPIS, KTERÝM SE NĚCO DĚJE, MUSÍ MÍT STROP (§469) ----------- */
{
  const spoustece = [...sql.matchAll(/create\s+trigger\s+(\w+)[\s\S]{0,120}?\son\s+([a-z_0-9]+)/gi)]
    .map((m) => m[2].toLowerCase());
  pravda(`spouštěče se v balíku dají najít (${spoustece.length})`, spoustece.length >= 1,
    'vzorec na „create trigger … on tabulka" nesedí — kontrola níž by měřila prázdno');
  for (const tab of SE_SPOUSTECEM) {
    pravda(`nad ${tab} opravdu spouštěč visí (jinak je tahle kontrola mrtvá)`,
      spoustece.indexOf(tab) >= 0, `v balíku žádný spouštěč na ${tab} není`);
    const p = zapisAnon.find((x) => x.tabulka === tab);
    pravda(`veřejný zápis do ${tab} v balíku je`, !!p, `pravidlo pro ${tab} se nenašlo`);
    if (!p) continue;
    pravda(`a NENÍ volný — ${tab} spouští poštu, takže „with check (true)" nestačí`,
      !/with check \(\s*true\s*\)/i.test(p.podminka), p.podminka.slice(0, 160));
    pravda(`${tab}: drží délku textu (nikdo nepošle megabajtový řádek)`,
      /length\(coalesce\(message/i.test(p.podminka), p.podminka.slice(0, 200));
    pravda(`${tab}: drží POČET za hodinu (strop proti zahlcení)`,
      /zprav_poslednich\(\s*60\s*\)\s*<\s*\d+/i.test(p.podminka), p.podminka.slice(0, 200));
  }
  /* A strop na POŠTU je jiný strop než na zápis: zpráva se uloží, i když
     se o ní neupozorní, takže se při nálezu nic neztratí. */
  /* POSLEDNÍ PODOBA, ne první. Balík funkci definuje dvakrát —
     zprava-upozorneni.sql ji zakládá a zpravy-strop.sql ji přepisuje —
     a platí ta pozdější. Vzorek bez `g` bral tu první a hlásil, že
     strop chybí, i když v balíku byl. */
  const vsechnaTela = [...sql.matchAll(/create or replace function notify_new_message\(\)[\s\S]*?\nend \$\$;/g)];
  const telo = vsechnaTela.length ? vsechnaTela[vsechnaTela.length - 1][0] : '';
  pravda('a spouštěč sám přestane posílat, když zpráv přijde příliš',
    /count\(\*\)\s*from messages[\s\S]{0,120}interval '1 hour'[\s\S]{0,40}>\s*\d+[\s\S]{0,60}return new/i.test(telo),
    telo.slice(0, 400) || 'funkce notify_new_message se v balíku nenašla');
  pravda('a ten strop stojí PŘED čtením tajemství z Vaultu',
    telo.indexOf('interval \'1 hour\'') > 0
    && telo.indexOf('interval \'1 hour\'') < telo.indexOf('decrypted_secrets'),
    'při zahlcení se nemá číst ani klíč');
}

console.log('\nZápis do databáze s veřejným klíčem');
console.log(zpravy.join('\n'));
console.log(`\nPravidel celkem: ${vsechna.length}, z toho zápis pro anon: ${zapisAnon.length}`);
if (chyb) {
  console.log('::error::Veřejný zápis: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
console.log(`\n${ok} v pořádku, 0 chyb\n`);
