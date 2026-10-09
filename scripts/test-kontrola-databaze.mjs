/* Test: kontrola databáze opravdu kontroluje.
   ==================================================================
   Spuštění: node scripts/test-kontrola-databaze.mjs  (bez prohlížeče
   a BEZ PŘIPOJENÍ — databáze se tu předstírá, takže zkouška běží
   i v CI, kde žádný servisní klíč není a být nemá.)

   PROČ. scripts/kontrola-databaze.mjs je nástroj, který se pouští
   jednou za čas ručně — tedy přesně ten druh kódu, který tiše
   přestane fungovat a nikdo si toho nevšimne, protože „vždycky to
   napsalo, že je všechno v pořádku". Zkouška proto databázi
   předstírá a ptá se opačně: když je v ní něco rozbité, ŘEKNE TO?

   Nejdřív se ale ověřuje, že se ze skutečného supabase/00-vse.sql dá
   vůbec něco vyčíst. Kdyby ten vzorek přestal chytat (změní se zápis
   v SQL), vracel by prázdné seznamy, všechno by se srovnalo s ničím
   a kontrola by hlásila „v pořádku" nad prázdnou databází.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { zkontroluj, ocekavaneZeSQL, zeSpecifikace, bezKlicu, VEREJNE_TABULKY }
  from './kontrola-databaze.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) ze skutečného SQL se dá číst --------------------------- */
const SQL = readFileSync(new URL('../supabase/00-vse.sql', import.meta.url), 'utf8');
const ma = ocekavaneZeSQL(SQL);
pravda(`v SQL se našly tabulky (${ma.tabulky.length})`, ma.tabulky.length >= 15,
  'vzorek na „create table if not exists" nechytá — kontrola by srovnávala s prázdnem');
pravda(`a funkce (${ma.funkce.length})`, ma.funkce.length >= 30,
  'vzorek na „create ... function" nechytá');
pravda(`a funkce se zakázaným spuštěním pro veřejnost (${ma.zavrene.length})`,
  ma.zavrene.length >= 8, 'vzorek na „revoke all on function" nechytá');
pravda('mezi tabulkami je navstevnost (bod 0 ze seznamu pro majitele)',
  ma.tabulky.indexOf('navstevnost') >= 0, ma.tabulky.join(', '));
pravda('a mezi zakázanými je prehled_navstevnosti (díra, kvůli které to vzniklo)',
  ma.zavrene.indexOf('prehled_navstevnosti') >= 0, ma.zavrene.join(', '));
pravda('veřejně čitelné jsou jen zveřejněné inzeráty',
  VEREJNE_TABULKY.length === 1 && VEREJNE_TABULKY[0] === 'listings',
  VEREJNE_TABULKY.join(', '));

/* ---- 2) předstíraná databáze ----------------------------------- */
const SQL_ZK = `
create table if not exists listings (x int);
create table if not exists messages (x int);
create table if not exists navstevnost (x int);
create or replace function my_listings() returns void as $$ $$ language sql;
create or replace function prehled_navstevnosti(dni integer) returns void as $$ $$ language sql;
revoke all on function prehled_navstevnosti(integer) from public, anon, authenticated;
`;
const PLNA = { tabulky: ['listings', 'messages', 'navstevnost'],
  funkce: ['my_listings', 'prehled_navstevnosti'] };
const VEREJNA = { tabulky: ['listings'], funkce: ['my_listings'] };

function spec(x) {
  const paths = {};
  for (const t of x.tabulky) paths['/' + t] = {};
  for (const f of x.funkce) paths['/rpc/' + f] = {};
  return { paths };
}
/** Předstíraná Supabase. `jak` říká, co je v ní rozbité. */
function falesna(jak = {}) {
  return async (url, cesta, klic, token) => {
    const role = token ? 'prihlaseny' : (klic === 'SERVICE' ? 'sluzba' : 'anon');
    if (cesta === '/rest/v1/') {
      if (role === 'sluzba') {
        if (jak.sluzbaMlci) return { stav: 503, json: null, telo: '' };
        return { stav: 200, json: spec(jak.vDatabazi || PLNA) };
      }
      /* Ostrá Supabase vrátila na kořeni 401, i když data veřejný klíč
         čte — nové klíče „sb_publishable_…" sem nepouští. */
      if (jak.korenAnon401) return { stav: 401, json: null, telo: '' };
      const viditelne = role === 'prihlaseny'
        ? (jak.proPrihlaseneho || VEREJNA) : (jak.proAnon || VEREJNA);
      return { stav: 200, json: spec(viditelne) };
    }
    const tab = (/^\/rest\/v1\/([a-z_]+)\?/.exec(cesta) || [])[1];
    if (role === 'sluzba') return { stav: 200, json: [{ id: 1 }] };
    if (jak.klicNeplati) return { stav: 401, json: null, telo: '' };
    if (tab === 'listings') return { stav: 200, json: [{ id: 1 }] };
    const vidi = role === 'prihlaseny' ? (jak.radkyPrihlasenemu || [])
      : (jak.radkyAnonovi || []);
    return { stav: 200, json: vidi.indexOf(tab) >= 0 ? [{ id: 1 }] : [] };
  };
}
const zaklad = { url: 'http://x', anonKlic: 'ANON', serviceKlic: 'SERVICE', sql: SQL_ZK };
const spust = (jak, navic = {}) =>
  zkontroluj(Object.assign({}, zaklad, navic, { fetchFn: falesna(jak) }));
const chybyZ = (v) => v.nalezy.filter((n) => n.vaha === 'chyba');

/* ---- 3) zdravá databáze mlčí ----------------------------------- */
{
  const v = await spust({});
  pravda('nad zdravou databází nehlásí chybu', chybyZ(v).length === 0,
    JSON.stringify(chybyZ(v).map((n) => n.co)));
  pravda('ale připomene, že se nekontrolovalo „co vidí přihlášený"',
    v.nalezy.some((n) => /přihlášený/.test(n.co)), JSON.stringify(v.nalezy.map((n) => n.co)));
}

/* ---- 4) každá rozbitá věc se ozve ------------------------------ */
{
  const v = await spust({ vDatabazi: { tabulky: ['listings'], funkce: PLNA.funkce } });
  pravda('chybějící tabulku pozná', chybyZ(v).some((n) => /chybí.*tabulek/.test(n.co)
    && /messages/.test(n.proc)), JSON.stringify(chybyZ(v)));
  pravda('a poradí, co s tím', chybyZ(v).some((n) => /00-vse\.sql/.test(n.rada)));
}
{
  const v = await spust({ vDatabazi: { tabulky: PLNA.tabulky, funkce: ['my_listings'] } });
  pravda('chybějící funkci pozná', chybyZ(v).some((n) => /chybí.*funkcí/.test(n.co)
    && /prehled_navstevnosti/.test(n.proc)), JSON.stringify(chybyZ(v)));
}
{
  /* TOHLE JE TA DÍRA, KVŮLI KTERÉ CELÝ SOUBOR VZNIKL: v SQL je
     „revoke", ale v databázi funkci pořád vidí kdokoli. */
  const v = await spust({ proAnon: { tabulky: ['listings'],
    funkce: ['my_listings', 'prehled_navstevnosti'] } });
  pravda('funkci se zákazem, kterou přesto vidí nepřihlášený, nahlásí',
    chybyZ(v).some((n) => /zákaz, ale nepřihlášený/.test(n.co)
      && /prehled_navstevnosti/.test(n.proc)), JSON.stringify(chybyZ(v)));
}
{
  const v = await spust({ radkyAnonovi: ['messages'] });
  pravda('tabulku s cizími zprávami otevřenou všem nahlásí',
    chybyZ(v).some((n) => /messages.*bez přihlášení/.test(n.co)), JSON.stringify(chybyZ(v)));
  pravda('a zveřejněné inzeráty za nález nepovažuje',
    !chybyZ(v).some((n) => /listings/.test(n.co)), JSON.stringify(chybyZ(v)));
}
{
  const v = await spust({ proPrihlaseneho: { tabulky: ['listings'],
    funkce: ['my_listings', 'prehled_navstevnosti'] } }, { token: 'TOKEN' });
  pravda('a totéž u přihlášeného uživatele',
    chybyZ(v).some((n) => /zákaz, ale přihlášený/.test(n.co)), JSON.stringify(chybyZ(v)));
}
{
  const v = await spust({ sluzbaMlci: true });
  pravda('když databáze neodpoví, řekne to a nepředstírá úspěch',
    chybyZ(v).length === 1 && /neodpověděla/.test(chybyZ(v)[0].co),
    JSON.stringify(v.nalezy));
}

/* ---- 4b) 401 na kořeni není totéž co nefunkční klíč ------------ */
{
  /* TOHLE NAŠEL AŽ OSTRÝ BĚH. Kořenový výpis vrátil 401, celá otázka
     „kdo co vidí" se kvůli tomu přeskočila — a souhrn přesto hlásil
     zelenou. Dvě různě vážné věci se musí rozlišit: neplatný klíč
     znamená, že se k datům nedostane ani web. */
  const v = await spust({ korenAnon401: true, radkyAnonovi: ['messages'] });
  pravda('když kořenový výpis odmítne klíč, kontrola dat se přesto udělá',
    chybyZ(v).some((n) => /messages.*bez přihlášení/.test(n.co)), JSON.stringify(v.nalezy));
  pravda('a řekne se, že seznam funkcí se ověřit nepodařilo',
    v.nalezy.some((n) => /seznam funkcí.*nepodařilo/.test(n.co)),
    JSON.stringify(v.nalezy.map((x) => x.co)));
  pravda('neplatný klíč se z toho ale nevyrábí',
    !chybyZ(v).some((n) => /klíč nefunguje/.test(n.co)), JSON.stringify(chybyZ(v)));
}
{
  const v = await spust({ klicNeplati: true });
  pravda('naopak klíč, se kterým nejdou přečíst ani zveřejněné inzeráty, je chyba',
    chybyZ(v).some((n) => /klíč nefunguje/.test(n.co)), JSON.stringify(v.nalezy));
  pravda('a je u toho napsané, že se k datům nedostane ani web',
    chybyZ(v).some((n) => /web/.test(n.rada)), JSON.stringify(chybyZ(v).map((x) => x.rada)));
  pravda('tabulky se s neplatným klíčem ani nezkouší (nemělo by to co znamenat)',
    !chybyZ(v).some((n) => /bez přihlášení/.test(n.co)), JSON.stringify(chybyZ(v)));
}

/* ---- 5) servisní klíč se nesmí dostat do výpisu ---------------- */
{
  const k = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.tajne.podpis';
  pravda('servisní klíč se z textu vymaže',
    bezKlicu('spadlo to na ' + k + ' při dotazu', [k]).indexOf(k) < 0);
  pravda('a krátký řetězec se nevymazává (jinak by zmizelo půl výpisu)',
    bezKlicu('tabulka messages', ['mes']).indexOf('messages') >= 0);
}

/* ---- 6) čtení OpenAPI nepřepočítává cesty na vlastní pěst ------ */
{
  const s = zeSpecifikace({ paths: { '/listings': {}, '/rpc/send_message': {},
    '/rpc/': {}, '/': {}, '/listings?select=x': {} } });
  pravda('ze specifikace vybere tabulky a RPC a nic navíc',
    s.tabulky.join(',') === 'listings' && s.funkce.join(',') === 'send_message',
    JSON.stringify(s));
}

console.log('\nKontrola databáze (nad předstíranou Supabase)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Kontrola databáze: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
