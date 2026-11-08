// Test: vložit se dá i dům nebo byt, ne jen pozemek.
//
// Spuštění: node scripts/test-vkladani-kategorie.mjs   (bez prohlížeče a sítě)
//
// PROČ. Web od 5. 11. 2026 ukazuje všechny nemovitosti — z 3 886 nabídek
// je 1 600 nepozemkových (změřeno 8. 11.). VLOŽIT se ale dal jen
// pozemek: formulář neměl kam typ zapsat a tabulka `listings` pro něj
// neměla sloupec. Stránka pro realitní kanceláře to musela přiznat —
// a realitka prodává hlavně domy a byty, takže to byl ten nejdražší
// chybějící kousek.
//
// Co se tady hlídá, a proč každá z těch věcí:
//   1) seznam typů se ve stránce NEOPISUJE (jinak §436-třída: dva
//      seznamy se rozejdou a nabídka s neznámým typem nejde vykreslit);
//   2) pozemek se do databáze neposílá — díky tomu projde i STARŠÍ
//      podobou create_listing, takže dokud majitel nepustí nové SQL,
//      vkládání pozemků funguje dál;
//   3) typ od člověka se při čtení OVĚŘUJE proti seznamu kategorií,
//      ne přebírá (jinak by do dat prošlo „<script>" — naměřeno);
//   4) nové SQL nesmí shodit to, co přepisuje: public_listings() pouští
//      jen veřejné inzeráty (listing_je_verejny) a my_listings() nese
//      výsledek noční kontroly i public_at.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cti = (p) => readFileSync(join(ROOT, p), 'utf8');
const require_ = createRequire(import.meta.url);

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podminka, detail) {
  if (podminka) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}
function je(popis, vyslo, cekano) {
  if (JSON.stringify(vyslo) === JSON.stringify(cekano)) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${JSON.stringify(cekano)}, vyšlo ${JSON.stringify(vyslo)}`); }
}

/* --- 1. FORMULÁŘ SE PTÁ, CO SE PRODÁVÁ ----------------------------- */
{
  const html = cti('pridat.html');
  pravda('formulář má výběr typu nemovitosti', /id="p-kat"/.test(html));
  pravda('a je povinný', /<select id="p-kat" required>/.test(html));
  /* SEZNAM VE STRÁNCE NENÍ. Kdyby tam byl, byla by to druhá kopie
     js/kategorie.js — a ta se rozejde tiše. */
  const vyber = /<select id="p-kat"[^>]*>([\s\S]*?)<\/select>/.exec(html);
  je('a ve stránce nejsou žádné pevně napsané volby',
    vyber ? vyber[1].trim() : 'VÝBĚR NENALEZEN', '');
  pravda('stránka načítá modul kategorií', html.indexOf('js/min/kategorie.js') > 0);
  pravda('a modul druhů, na kterém kategorie stojí', html.indexOf('js/min/druh.js') > 0);
  /* Popisek výměry a pozemkové otázky musí jít najít, jinak je js nemá
     jak přepsat ani schovat. */
  for (const id of ['p-vymera-label', 'p-pole-druh', 'p-pole-pristup', 'p-pole-site', 'p-detaily-cap']) {
    pravda(`stránka má ${id}`, html.indexOf('id="' + id + '"') > 0);
  }
}

/* --- 2. VOLBY SE BEROU Z MODULU A POPISKY PODLE `mera` ------------- */
{
  const js = cti('js/pridat.js');
  pravda('volby se vyrábějí z PKKategorie.KLICE', /PKKategorie[\s\S]{0,400}KLICE/.test(js),
    'v js/pridat.js se KLICE nečtou');
  pravda('popisek výměry se řídí PKKategorie.mera, ne vlastním seznamem',
    /K\.mera\(/.test(js) && /Podlahová plocha/.test(js));
  pravda('pozemkové otázky se u nepozemku schovají',
    /hidden = !jePozemek/.test(js));
}

/* --- 3. CO SE POSÍLÁ DO DATABÁZE ----------------------------------- */
{
  const js = cti('js/pridat.js');
  pravda('do create_listing jde p_kat', /p_kat:/.test(js));
  /* POZEMEK SE NEPOSÍLÁ. Dvě věci naráz: v datech je pozemek výchozí
     stav (nemá se psát dvakrát) a bez p_kat se volání vejde i do starší
     podoby funkce, takže vkládání pozemků funguje i na databázi, kde
     nové SQL ještě není. */
  pravda('a „pozemek" se neposílá (projde i starší podobou funkce)',
    /p_kat:[^\n]*!==[^\n]*'pozemek'/.test(js),
    'v js/pridat.js chybí podmínka na pozemek u p_kat');
}

/* --- 3b. DOKUD NENÍ SQL PUSTĚNÉ, AŤ TO ŘEKNE PRAVDU --------------
   Nová podoba create_listing na databázi, kde se nové SQL nepustilo,
   neexistuje — PostgREST volání s `p_kat` nenajde a vrátí PGRST202.
   Pozemek se posílá BEZ typu, takže ten projde i tak. Hláška se proto
   musí rozdělit: „inzeráty nejde přidávat" by bylo tomu, kdo přidává
   pozemek, nepravda a odehnalo by ho to. */
{
  const js = cti('js/pridat.js');
  const i = js.indexOf("=== 'db'");
  const blok = i > 0 ? js.slice(i, i + 1400) : '';
  pravda('hláška o staré databázi se dělí podle zvoleného typu',
    /val\('p-kat'\)/.test(blok), 'v bloku pro chybu „db" se typ nečte');
  pravda('a u pozemku neříká, že inzeráty nejde přidávat',
    /Domy a byty/.test(blok) && /Pozemek vložit jde/.test(blok),
    'chybí větev pro nepozemek');
}

/* --- 4. ČTENÍ: TYP SE OVĚŘUJE, NE PŘEBÍRÁ -------------------------- */
{
  global.window = global;
  const K = require_(join(ROOT, 'js', 'kategorie.js'));
  global.PKKategorie = K;
  const C = require_(join(ROOT, 'js', 'cisteni.js'));
  const radek = (kat) => ({ place: 'Kolín', okres: 'Kolín', lat: 50, lng: 15,
    area: 80, price: 3000000, kat: kat });
  const vysl = C.majitele([radek('byt'), radek('<script>'), radek('pozemek'), radek('neexistuje')])
    .map((d) => d.kat === undefined ? null : d.kat);
  je('známá kategorie projde, neznámá ani „<script>" ne',
    vysl, ['byt', null, null, null]);
}

/* --- 5. SQL: NOVÁ PODOBA JE V BALÍKU A AŽ ZA TOU, KTEROU PŘEPISUJE - */
{
  const poradi = cti('scripts/build-sql.mjs');
  const iKat = poradi.indexOf("'listings-kategorie.sql'");
  const iKontrola = poradi.indexOf("'listings-prvni-kontrola.sql'");
  pravda('listings-kategorie.sql je v seznamu PORADI', iKat > 0);
  pravda('a stojí AŽ ZA listings-prvni-kontrola.sql',
    iKat > 0 && iKontrola > 0 && iKat > iKontrola,
    `kategorie na ${iKat}, první kontrola na ${iKontrola}`);

  const vse = cti('supabase/00-vse.sql');
  pravda('balík zakládá sloupec kat', /add column if not exists kat text/.test(vse));
  pravda('a hlídá jeho tvar, ne význam', /listings_kat_tvar/.test(vse));
  pravda('balík má podobu create_listing s p_kat', /p_kat text\)/.test(vse));
  /* OBÁLKA, NE DRUHÁ KOPIE PRAVIDEL. Kdyby se tělo opsalo, byla by dvě
     místa s limitem 30 inzerátů, filtrem slov i kontrolou fotek. */
  pravda('a je to obálka — volá tu původní podobu',
    /from create_listing\(p_place/.test(vse),
    'v 00-vse.sql se nová podoba nevolá na starou');

  /* CO SE NESMÍ ZTRATIT. Obě funkce se musely napsat celé (PostgreSQL
     neumí přidat sloupec do návratového typu), takže tohle je přesně
     ta §436-past: opsat a něco vynechat. */
  const posledniPub = vse.lastIndexOf('create or replace function public_listings()');
  const konecPub = vse.indexOf('$$;', posledniPub);
  const pub = posledniPub > 0 ? vse.slice(posledniPub, konecPub) : '';
  pravda('public_listings() vrací kat', /\bkat text\b/.test(pub), pub.slice(0, 200));
  pravda('a pouští jen veřejné inzeráty (listing_je_verejny)',
    /listing_je_verejny/.test(pub),
    'poslední podoba public_listings() pustila všechno se stavem approved');

  const posledniMy = vse.lastIndexOf('create or replace function my_listings()');
  const konecMy = vse.indexOf('$$;', posledniMy);
  const my = posledniMy > 0 ? vse.slice(posledniMy, konecMy) : '';
  pravda('my_listings() vrací kat', /\bkat text\b/.test(my));
  pravda('a nezahodila public_at ani výsledek noční kontroly',
    /public_at/.test(my) && /kontrola_ok/.test(my),
    'poslední podoba my_listings() přišla o public_at nebo kontrola_*');
}

console.log('\nVkládání inzerátu: i dům a byt, ne jen pozemek');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Vkládání kategorie: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Vkládání kategorie: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
