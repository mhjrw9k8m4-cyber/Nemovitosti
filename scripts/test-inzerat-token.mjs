// Test: cizí inzerát nesmí jít smazat veřejným klíčem (§466, §468).
//
// Spuštění: node scripts/test-inzerat-token.mjs   (bez sítě, bez databáze)
//
// NÁLEZ 6. 11. V supabase/00-vse.sql ležely vedle sebe DVA modely
// vlastnictví inzerátu:
//   starý  — inzerát patří tomu, kdo zná `listings.token`;
//            my_listing(uuid,uuid) a delete_listing(uuid,uuid), obě
//            povolené roli `anon`, tedy klíči z js/config.js;
//   nový   — inzerát patří účtu (user_id = auth.uid()), maže
//            delete_listing(uuid) a chce přihlášení.
//
// Starý model stál na tom, že token je tajný. Nebyl: pravidlo
// „verejne cteni schvalenych" pouštělo komukoli `select` na celou
// tabulku `listings` a to zahrnuje i `token`. Dva dotazy veřejným
// klíčem — přečíst `id,token`, zavolat delete_listing — a kdokoli
// smaže kterýkoli zveřejněný inzerát.
//
// PRVNÍ PODOBA TOHOHLE HLÍDAČE BYLA K NIČEMU (§468). Hledala v balíku
// ŘETĚZCE a čtyři sabotáže, které tu díru znovu otevřely, prošly
// 12 v pořádku / 0 chyb. Nejpoučnější z nich je první: RLS se ověřovalo
// tím, že se v souboru NĚKDE vyskytuje „enable row level security" —
// což platí i v balíku, který ho na konci vypne.
//
// Teď se tedy nečtou řádky, ale KONEČNÝ STAV balíku — viz
// scripts/sql-koncovy-stav.mjs. A ty čtyři sabotáže jsou tady dole
// jako trvalé zkoušky, aby se na ně nedalo zapomenout.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { VEREJNE_TABULKY } from './kontrola-databaze.mjs';
import { koncovyStav, anonMuzeSpustit, zapisujeDo, bezKomentaru } from './sql-koncovy-stav.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nInzerát a starý token');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Inzerát a starý token: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const SQL = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
const stav = koncovyStav(SQL);
const podpisy = (jm) => [...(stav.funkce.get(jm) || [])];

/* ---------- 0) čtečka nic nezamlčela ---------------------------- */
/* Příkaz, který vypadá jako jeden ze šesti hlídaných druhů a nedal se
   přečíst, je nález sám — jinak by stačilo napsat RLS jinak a hlídač
   by mlčel se dobrým svědomím. */
pravda('každý příkaz o RLS, pravidlech a právech se dal přečíst',
  stav.neznamo.length === 0, stav.neznamo.slice(0, 5).join('\n      '));

/* ---------- 1) funkce starého modelu ---------------------------- */
pravda('my_listing(uuid,uuid) v databázi po nasazení NEZŮSTANE',
  !podpisy('my_listing').includes('uuid,uuid'), podpisy('my_listing').join(' | ') || 'žádný podpis');
pravda('a nezůstane po ní vůbec nic (náhradu má my_listings() pod účtem)',
  podpisy('my_listing').length === 0, podpisy('my_listing').join(' | '));
pravda('delete_listing(uuid,uuid) — mazání cizím tokenem — nezůstane',
  !podpisy('delete_listing').includes('uuid,uuid'), podpisy('delete_listing').join(' | '));
pravda('ale delete_listing(uuid) pod účtem zůstat MUSÍ (web ji volá)',
  podpisy('delete_listing').includes('uuid'), podpisy('delete_listing').join(' | ') || 'žádný podpis');

/* ---------- 2) tabulka listings: RLS a pravidla ----------------- */
pravda('RLS na tabulce listings zůstane ZAPNUTÉ',
  stav.rls.get('listings') === true,
  'poslední příkaz o RLS té tabulky: ' + (stav.rls.has('listings')
    ? (stav.rls.get('listings') ? 'enable' : 'DISABLE') : 'žádný — RLS se nezapíná vůbec'));
const pol = [...(stav.politiky.get('listings') || [])];
pravda('pravidlo „verejne cteni schvalenych" na listings nepřežije',
  !pol.includes('verejne cteni schvalenych'), pol.join(' | ') || 'žádné pravidlo');
pravda('a nezůstane na té tabulce ŽÁDNÉ pravidlo '
  + '(veřejná data jdou funkcí public_listings, ta vybírá sloupce jmenovitě)',
  pol.length === 0, pol.join(' | '));

/* ---------- 3) sloupec token ------------------------------------ */
pravda('sloupec listings.token po nasazení neexistuje',
  !(stav.sloupce.get('listings') || new Set()).has('token'),
  'dokud existuje, může se na něj navázat nová funkce a díra se otevře znovu');
pravda('ostatní sloupce té tabulky se přitom nezahodily',
  (stav.sloupce.get('listings') || new Set()).size >= 15,
  'sloupců: ' + (stav.sloupce.get('listings') || new Set()).size);

/* ---------- 4) ŽÁDNÁ cesta, kterou nepřihlášený mění inzeráty ---
   Tohle je ta kontrola, která by zachytila obnovení starého modelu
   POD JINÝM JMÉNEM. Hlídat dvě jména (my_listing, delete_listing)
   nestačí: `smaz_inzerat(uuid,uuid)` by prošla.
   Výjimky se píšou sem a s důvodem — mlčení by znamenalo, že se
   na ně dá zapomenout. */
const SMI_PSAT_DO_INZERATU = new Map([
  ['bump_view(uuid)', 'počítadlo zhlédnutí; mění jediný sloupec `views` '
    + 'a jen u schváleného inzerátu, nic nemaže a nic nevydává'],
]);
const psaci = [];
for (const klic of anonMuzeSpustit(stav)) {
  if (!zapisujeDo(stav.tela.get(klic) || '').has('listings')) continue;
  if (SMI_PSAT_DO_INZERATU.has(klic)) continue;
  psaci.push(klic);
}
pravda('nepřihlášený nemá ŽÁDNOU funkci, kterou by do inzerátů zapsal '
  + `(kromě ${[...SMI_PSAT_DO_INZERATU.keys()].join(', ')})`,
  psaci.length === 0, psaci.join(', '));
pravda('a ta jediná výjimka má v hlídači napsaný důvod',
  [...SMI_PSAT_DO_INZERATU.values()].every((d) => d && d.length > 30),
  'výjimka bez důvodu je výjimka, na kterou se zapomene');

/* ---------- 5) nic token nevydává ------------------------------- */
const vydava = [];
for (const [klic, telo] of stav.tela) {
  if (!/^(public_listings|my_listings)\(/.test(klic)) continue;
  if (/\btoken\b/.test(telo)) vydava.push(klic);
}
pravda('ani public_listings, ani my_listings token nevydávají',
  vydava.length === 0, vydava.join(', '));

/* ---------- 6) web o tokenovém modelu neví ---------------------- */
const strankyAJs = [
  ...readdirSync(KOREN).filter((f) => f.endsWith('.html')).map((f) => path.join(KOREN, f)),
  ...readdirSync(path.join(KOREN, 'js')).filter((f) => f.endsWith('.js')).map((f) => path.join(KOREN, 'js', f)),
];
const volaTokenem = [];
for (const f of strankyAJs) {
  const t = readFileSync(f, 'utf8');
  if (/p_token\s*[:=]/.test(t) && /delete_listing|my_listing\b/.test(t)) volaTokenem.push(path.basename(f));
}
pravda('žádná stránka ani modul nevolá mazání inzerátu s tokenem',
  volaTokenem.length === 0, volaTokenem.join(', '));

/* ---------- 7) a hlídač databáze už tu výjimku nemá -------------
   NA PRÓZU SE TU NESPOLÉHÁ. Pokušení je zakázat v kontrola-databaze.mjs
   větu „my_listing je pro anon povolená schválně" — jenže ta věta v něm
   stát MÁ: je tam zapsaná jako nález, s tím, proč neplatila. Hlídač,
   který zakazuje slova, by nutil smlčet, co se zjistilo. Drží to tedy
   chování: prázdné VEREJNE_TABULKY. */
pravda('kontrola databáze nepovažuje za v pořádku, že tabulku čte kdokoli',
  Array.isArray(VEREJNE_TABULKY) && VEREJNE_TABULKY.length === 0,
  'VEREJNE_TABULKY = ' + JSON.stringify(VEREJNE_TABULKY));
const kontrola = readFileSync(path.join(KOREN, 'scripts', 'kontrola-databaze.mjs'), 'utf8');
pravda('a je v ní napsané, kde se ta díra zavřela (ať se to dá dohledat)',
  /listings-token-pryc\.sql/.test(kontrola), 'odkaz na supabase/listings-token-pryc.sql chybí');

/* ---------- 8) ČTYŘI SABOTÁŽE, KTERÉ PRVNÍ PODOBA HLÍDAČE PUSTILA
   Všechny čtyři jsem si 6. 11. naměřil na kopii balíku: každá otevřela
   díru a hlídač u všech hlásil 12 v pořádku, 0 chyb. Jsou tu proto
   natrvalo — ne jako historie, ale jako zkoušky. Když některá projde,
   je hlídač zpátky tam, kde byl.
   Sabotuje se v PAMĚTI, soubor na disku se nedotkne. */
const SABOTAZE = [
  ['RLS se na konci vypne', 'alter table listings disable row level security;',
    (s) => s.rls.get('listings') !== true],
  ['pravidlo se vrátí BEZ uvozovek ve jménu',
    'create policy verejne_zpet on listings for select using (true);',
    (s) => (s.politiky.get('listings') || new Set()).size > 0],
  ['pravidlo se vrátí přes `public.listings`',
    'create policy "zpet" on public.listings for select using (true);',
    (s) => (s.politiky.get('listings') || new Set()).size > 0],
  ['pravidlo se vrátí ODSAZENÉ (ne na začátku řádku)',
    '  create policy "zpet2" on listings for select using (true);',
    (s) => (s.politiky.get('listings') || new Set()).size > 0],
  ['sloupec token se vrátí BEZ `if not exists`',
    'alter table listings add column token uuid not null default gen_random_uuid();',
    (s) => (s.sloupce.get('listings') || new Set()).has('token')],
  ['starý model se vrátí POD JINÝM JMÉNEM',
    'create or replace function smaz_inzerat(p_id uuid, p_token uuid)\n'
    + 'returns boolean language plpgsql security definer as $$\n'
    + 'begin delete from listings where id = p_id and token = p_token; return true; end; $$;\n'
    + 'grant execute on function smaz_inzerat(uuid,uuid) to anon;',
    (s) => anonMuzeSpustit(s).some((k) => k.startsWith('smaz_inzerat(')
      && zapisujeDo(s.tela.get(k) || '').has('listings'))],
  ['funkce se vrátí s typem psaným jako alias (`int` místo `integer`)',
    'drop function if exists bump_view(uuid);\n'
    + 'create or replace function bump_view(p_id uuid) returns void language sql as $$ select 1 $$;',
    (s) => (s.funkce.get('bump_view') || new Set()).has('uuid')],
];
for (const [popis, radek, poznaSe] of SABOTAZE) {
  let chytil = false, vybuch = '';
  try { chytil = poznaSe(koncovyStav(SQL + '\n' + radek + '\n')); }
  catch (e) { vybuch = String(e && e.message || e); }
  pravda(`sabotáž pozná: ${popis}`, chytil && !vybuch,
    vybuch ? 'čtečka na tom spadla: ' + vybuch : 'konečný stav se nezměnil — hlídač je slepý');
}
/* A SABOTÁŽ, KTERÁ SE POZNAT NESMÍ: zakomentovaný příkaz není příkaz.
   Bez tohohle by stačilo, aby čtečka přestala umět komentáře, a hlídač
   by hlásil díru nad zdravým balíkem — a to se odnaučí stejně rychle
   jako mlčení. */
const vKomentari = koncovyStav(SQL
  + '\n-- alter table listings disable row level security;\n'
  + '/* create policy "zpet3" on listings for select using (true); */\n');
pravda('zakomentovaný příkaz za nález NEPLATÍ',
  vKomentari.rls.get('listings') === true
  && (vKomentari.politiky.get('listings') || new Set()).size === 0,
  'čtečka čte i komentáře — pak by hlásila díru nad zdravým balíkem');
pravda('a komentáře se neškrtají uvnitř těla funkce (tam můžou být legálně)',
  /\$\$/.test(bezKomentaru("create function f() as $$ -- uvnitr\n select 1 $$;")),
  'bezKomentaru() rozbila tělo funkce');

hotovo();
