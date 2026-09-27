// Test: platí v prohlížeči a na serveru TYTÉŽ meze?
//
// Spuštění: node scripts/test-meze.mjs   (bez prohlížeče, zlomek vteřiny)
//
// Proč: js/kontrola.js má v hlavičce slib — „Kontroly v prohlížeči jsou
// rychlá zpětná vazba pro poctivého člověka; kdo chce, obejde je. Tvrdá
// hranice je vždycky na serveru (create_listing v supabase/)." Ten slib
// dlouho neplatil: server kontroloval obec, polohu, vulgarity a spam, ale
// o výměře ani ceně nevěděl nic. Kdo poslal rovnou do RPC, uložil pozemek
// o nulové výměře za korunu — a na mapě byl.
//
// Teď tam meze jsou. Jenže dvě kopie téhož čísla se dřív nebo později
// rozejdou (na tomhle webu už se to stalo u cen i u rad), a rozejdou se
// tiše: prohlížeč odmítne, server pustí, nebo naopak člověk dostane
// nesrozumitelnou chybu z databáze. Tenhle test je drží u sebe.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const KONTROLA = createRequire(import.meta.url)(path.join(KOREN, 'js', 'kontrola.js'));
const MEZE = KONTROLA.MEZE;
const sql = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
const pridat = readFileSync(path.join(KOREN, 'pridat.html'), 'utf8');
/* Čte se ze sloučeného 00-vse.sql — to je soubor, který se opravdu pouští
   v Supabase. Kdyby se změnil jen zdrojový kousek a zapomnělo se sloučit,
   tohle by to ukázalo. */
/* POSLEDNÍ definice, ne první. Sloučený soubor vznikl z několika
   migrací a create_listing se v něm předefinovává; v Postgresu platí ta
   poslední. Test čtený od první by hlídal verzi, která na serveru
   nakonec neběží — a mlčel by přesně tehdy, kdy nemá. */
const ZNACKA = 'create or replace function create_listing';
const vytvor = sql.slice(sql.lastIndexOf(ZNACKA));
const telo = vytvor.slice(0, vytvor.indexOf('$$;'));
pravda(`create_listing se ve sloučeném SQL najde (${(sql.match(/create or replace function create_listing/g) || []).length}× předefinované, platí poslední)`,
  sql.includes(ZNACKA) && telo.length > 500 && telo.includes('begin'),
  `nalezeno ${telo.length} znaků — test by jinak nic neměřil`);

// Každá mez z prohlížeče musí v těle funkce stát jako číslo.
const PARY = [
  ['vymeraMin', MEZE.vymeraMin], ['vymeraMax', MEZE.vymeraMax],
  ['cenaMin', MEZE.cenaMin], ['cenaMax', MEZE.cenaMax],
  ['perM2Min', MEZE.perM2Min], ['perM2Max', MEZE.perM2Max],
];
for (const [jmeno, hodnota] of PARY) {
  const je = new RegExp('(^|[^\\d])' + hodnota + '([^\\d]|$)').test(telo);
  pravda(`mez ${jmeno} (${hodnota}) platí i na serveru`, je,
    `v create_listing se číslo ${hodnota} nevyskytuje — prohlížeč a server se rozešly`);
}

// A pole, která prohlížeč vyžaduje, musí server vyžadovat taky.
for (const [pole, hlaska] of [['obec', 'obec je povinná'], ['okres', 'okres je povinný'], ['poloha', 'poloha je povinná']]) {
  pravda(`server vyžaduje ${pole}`, telo.includes(hlaska),
    `v create_listing chybí „${hlaska}" — v prohlížeči je to povinné, na serveru ne`);
}

/* Že se kontroluje i POMĚR, ne jen obě čísla zvlášť. Přidaná nula v ceně
   projde obě meze zvlášť a teprve Kč/m² ji prozradí. */
pravda('server hlídá i cenu za m², ne jen obě čísla zvlášť',
  /p_price[^;]*\/\s*p_area/.test(telo),
  'v create_listing se cena za m² nepočítá');

/* =====================================================================
   ŽÁDNÉ PRAVIDLO NESMÍ PŘI SLOUČENÍ ZMIZET
   =====================================================================
   Tohle je ta zrada, kvůli které blok vznikl. 00-vse.sql se skládá
   z jednotlivých migrací (scripts/build-sql.mjs) a create_listing se v něm
   předefinovává osmkrát. Platí POSLEDNÍ — takže když nějaká starší migrace
   přidala kontrolu a ta nejnovější o ní neví, spuštění souboru tu kontrolu
   ze serveru TIŠE SMAZALO. Přesně to se stalo: poslední podoba neznala
   pět pravidel z listings-rekonstrukce.sql (délka obce, délka popisu,
   značky < > v popisu, délka parcelního čísla a kontakt) a nikde to
   nebylo vidět — soubor se pustí bez chyby a web taky nic nehlásí.
   Test proto porovnává VŠECHNY podoby s tou poslední. Klíčem jsou první
   tři slova hlášky, aby přeformulování textu („cena za m² vychází
   nereálně" místo „je mimo reálné rozpětí") test nerozbilo. */
const podoby = [];
{
  let i = 0;
  while ((i = sql.indexOf(ZNACKA, i)) >= 0) {
    const kus = sql.slice(i);
    podoby.push(kus.slice(0, kus.indexOf('$$;')));
    i += ZNACKA.length;
  }
}
pravda(`v 00-vse.sql je ${podoby.length} podob create_listing a měří se ta poslední`,
  podoby.length > 1 && podoby[podoby.length - 1] === telo,
  'test by jinak porovnával něco jiného, než co na serveru nakonec platí');

const klic = (h) => h.split(/\s+/).slice(0, 3).join(' ');
const hlasky = (t) => new Map([...t.matchAll(/raise exception '([^']+)'/g)].map((m) => [klic(m[1]), m[1]]));
const vPosledni = hlasky(telo);
/* Kdyby se někdy nějaké pravidlo rušilo ÚMYSLNĚ, patří jeho klíč sem —
   i s důvodem. Prázdná množina znamená „nic se zrušit nesmí". */
const SMI_ZMIZET = new Set();
const drive = new Map();
for (let n = 0; n < podoby.length - 1; n++) {
  for (const [k, h] of hlasky(podoby[n])) if (!drive.has(k)) drive.set(k, { h, n: n + 1 });
}
for (const [k, { h, n }] of drive) {
  if (SMI_ZMIZET.has(k)) continue;
  pravda(`pravidlo „${h}" (poprvé v ${n}. podobě) platí i v té poslední`, vPosledni.has(k),
    'poslední podoba create_listing ho nemá — spuštění 00-vse.sql ho ze serveru smaže');
}

/* =====================================================================
   TÁŽ PAST U OSTATNÍCH FUNKCÍ
   =====================================================================
   create_listing není v 00-vse.sql jediná přepisovaná funkce:
   public_listings a my_listings jsou tam pětkrát, delete_listing
   třikrát, thread_messages, save_search, my_listing_quota a bump_view
   dvakrát. U nich rozhodují hlavně VRACENÉ SLOUPCE — kdyby poslední
   podoba některý vynechala, web by si ho vyžádal a dostal chybu, nebo
   by prostě zmizel z karty pozemku. Dnes jsou všechny narůstající
   (ověřeno), ale nic to nedrželo; kontrola je odteď obecná, ne jen pro
   create_listing. */
const bezKomentaru = (t) => t.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ');
const sloupce = (t) => {
  const m = bezKomentaru(t).match(/returns table\(([\s\S]*?)\)\s*language/);
  if (!m) return [];
  return m[1].split(',').map((x) => x.trim().split(/\s+/)[0]).filter(Boolean);
};
const definice = new Map();
for (const m of sql.matchAll(/create or replace function ([a-z_]+)/g)) {
  const kus = sql.slice(m.index);
  const telo2 = kus.slice(0, kus.indexOf('$$;'));
  if (!definice.has(m[1])) definice.set(m[1], []);
  definice.get(m[1]).push(telo2);
}
/* Co ZMIZELO ÚMYSLNĚ. Jediná položka: create_listing kdysi vracela
   „token" — klíč, kterým majitel svůj inzerát spravoval v době, kdy se
   inzerát dal podat bez účtu (listings-autopublish.sql). Od
   listings-auth.sql patří inzerát přihlášenému účtu, majitele tedy
   poznáme z přihlášení a token by byl zbytečná tajná hodnota navíc.
   Kdyby někdy zmizelo něco dalšího, musí to přistát sem i s důvodem —
   a to je smysl téhle zkoušky: ztráta musí být rozhodnutí, ne přehlédnutí. */
const SMI_ZMIZET_SLOUPCE = new Set(['create_listing.token']);
let prepsanych = 0;
for (const [jmeno, verze] of definice) {
  if (verze.length < 2) continue;
  prepsanych++;
  const posl = verze[verze.length - 1];
  const poslSl = new Set(sloupce(posl));
  const poslHl = new Set([...hlasky(posl).keys()]);
  const chybiSl = [];
  const chybiHl = [];
  for (let n = 0; n < verze.length - 1; n++) {
    for (const c of sloupce(verze[n])) {
      if (!poslSl.has(c) && !SMI_ZMIZET_SLOUPCE.has(jmeno + '.' + c)) chybiSl.push(`${c} (z ${n + 1}. podoby)`);
    }
    for (const k of hlasky(verze[n]).keys()) if (!poslHl.has(k)) chybiHl.push(`${k}… (z ${n + 1}. podoby)`);
  }
  pravda(`${jmeno} (${verze.length}× přepsaná): poslední podoba nevynechala žádný sloupec`,
    chybiSl.length === 0, 'chybí: ' + chybiSl.join(', '));
  pravda(`${jmeno}: ani žádné pravidlo`, chybiHl.length === 0, 'chybí: ' + chybiHl.join(', '));
}
pravda(`v 00-vse.sql se přepisuje ${prepsanych} funkcí a všechny se porovnaly`, prepsanych >= 5,
  'našlo se jen ' + prepsanych + ' — kontrola by nic neměřila');

/* =====================================================================
   KONTAKT: PRÁZDNO MUSÍ PUSTIT OBĚ STRANY
   =====================================================================
   Tady se prohlížeč a server rozešli nejošklivěji: pridat.html má pole
   „Telefon (nepovinné)", js/kontrola.js prázdnou hodnotu pouští — a server
   ji odmítal hláškou z databáze. Kdo číslo zveřejnit nechtěl, vyplnil celý
   formulář a pak se dozvěděl „kontakt musí být platný telefon nebo e-mail".
   Ukázala to až živá zkouška chatu (scripts/test-chat.mjs), která zakládá
   inzerát bez telefonu; do té doby o tom nevěděl nikdo. */
const kontaktPravidlo = /if p_contact is not null and length\(trim\(p_contact\)\) > 0 and not \(/.test(telo);
pravda('server pustí inzerát bez telefonu (pole je v pridat.html nepovinné)', kontaktPravidlo,
  'create_listing kontakt vyžaduje, ale formulář ho označuje jako nepovinný — člověk dostane chybu z databáze');
pravda('prohlížeč pustí inzerát bez telefonu', KONTROLA.kontakt('').ok === true,
  'js/kontrola.js prázdný kontakt odmítá — pak by měl být v pridat.html povinný');
pravda('pole „Telefon" v pridat.html není required', !/id="p-kontakt"[^>]*\srequired/.test(pridat),
  'formulář kontakt vyžaduje, ale obě kontroly ho pouštějí');
/* Když už někdo něco napíše, musí to být číslo — a hranice „devět až
   třináct číslic" musí být stejná na obou stranách. */
pravda('server drží u telefonu 9–13 číslic', /between 9 and 13/.test(telo),
  'v create_listing ta hranice není');
pravda('prohlížeč drží u telefonu 9–13 číslic',
  !KONTROLA.kontakt('7712345').ok && KONTROLA.kontakt('777123456').ok && !KONTROLA.kontakt('77712345678901').ok,
  'js/kontrola.js má jinou hranici než server');

/* =====================================================================
   DÉLKY TEXTŮ A BÍLÉ SEZNAMY
   =====================================================================
   Popis smí mít 2 000 znaků podle formuláře i podle serveru — ale cestou
   k zobrazení ho krátila ještě dvě místa: branka js/cisteni.js (600) a
   načtení inzerátů v js/main.js (600). Nebyla to ochrana, byl to tichý
   střih: kdo napsal delší text, o posledních 1 400 znaků přišel a nikde
   se to nedozvěděl. Kdo mez v jednom místě zvedne, musí ji zvednout
   všude — proto se porovnávají všechny tři. */
const cisteni = readFileSync(path.join(KOREN, 'js', 'cisteni.js'), 'utf8');
const mezCisteni = Number((cisteni.match(/description:\s*(\d+)/) || [])[1]);
const mezMain = Number((readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8')
  .match(/description:\s*clean\(u\.description,\s*(\d+)\)/) || [])[1]);
pravda(`popis se po cestě k zobrazení nestříhá (kontrola ${MEZE.popisMax}, branka ${mezCisteni}, načtení ${mezMain})`,
  mezCisteni === MEZE.popisMax && mezMain === MEZE.popisMax,
  'jedno z těch míst má menší mez — delší popis od majitele nikdo neuvidí celý');

for (const [popis, vzor] of [
  [`délka obce ${MEZE.obecMin}–${MEZE.obecMax} platí i na serveru`,
    new RegExp(`length\\(trim\\(p_place\\)\\) < ${MEZE.obecMin}[\\s\\S]{0,40}> ${MEZE.obecMax}`)],
  [`délka popisu (max ${MEZE.popisMax}) platí i na serveru`,
    new RegExp(`length\\(p_description\\) > ${MEZE.popisMax}`)],
]) {
  pravda(popis, vzor.test(telo), 'v create_listing ta mez chybí nebo má jiné číslo');
}

/* Bílý seznam vybavení musí obsahovat přesně to, co formulář posílá.
   Poslední podoba měla strojové tvary bez diakritiky ('elektrina'),
   zatímco pridat.html posílá popisky („Elektřina"). Nic by se neshodlo:
   sítě i přístup by u každého nového inzerátu tiše zmizely — formulář je
   odešle, server je zahodí a chybu nenahlásí ani jeden. */
const site = [...pridat.matchAll(/name="site"\s+value="([^"]+)"/g)].map((m) => m[1]);
pravda(`v pridat.html se nabízí ${site.length} možností „Sítě a stav pozemku"`, site.length >= 4,
  'nic se nenašlo — test by dál nic neměřil');
const bilyFt = (telo.match(/if ft in \(([^)]*)\)/) || [, ''])[1];
for (const v of site) {
  pravda(`server přijme vybavení „${v}"`, bilyFt.includes(`'${v}'`),
    `v bílém seznamu create_listing „${v}" není — formulář to pošle a server to zahodí bez chyby`);
}
/* TÝŽ BÍLÝ SEZNAM JE I V PROHLÍŽEČI. js/main.js si data z Supabase
   přebírá přes OK_FEAT — „stejná pojistka jako na serveru", říká komentář
   u něj. Jenže zapomněla na „Stavbu k rekonstrukci": formulář ji nabídl,
   server uložil a prohlížeč ji při čtení zahodil. Nikde chyba, jen
   zmizelý údaj. */
const mainJs = readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8');
const okFeat = (mainJs.match(/var OK_FEAT = \{([^}]*)\}/) || [, ''])[1];
pravda('js/main.js má vlastní bílý seznam vybavení (jinak zkouška nic neměří)', okFeat.length > 20,
  'OK_FEAT se v js/main.js nenašel');
for (const v of site) {
  pravda(`prohlížeč nezahodí vybavení „${v}"`, okFeat.includes(`'${v}'`),
    `v OK_FEAT v js/main.js „${v}" není — server to uloží a prohlížeč to při čtení zahodí`);
}

const selBlok = pridat.slice(pridat.indexOf('<select id="p-pristup"'));
const pristupy = [...selBlok.slice(0, selBlok.indexOf('</select>')).matchAll(/<option([^>]*)>([^<]+)<\/option>/g)]
  .filter((m) => !/value=""/.test(m[1])).map((m) => m[2].trim());
pravda(`v pridat.html se nabízí ${pristupy.length} možností přístupu`, pristupy.length >= 3,
  'nic se nenašlo — test by dál nic neměřil');
const bilyAcc = (telo.match(/if p_access in \(([^)]*)\)/) || [, ''])[1];
for (const v of pristupy) {
  pravda(`server přijme přístup „${v}"`, bilyAcc.includes(`'${v}'`),
    `v bílém seznamu create_listing „${v}" není — formulář to pošle a server to zahodí bez chyby`);
}

/* Limit volného účtu je napsaný dvakrát: create_listing podle něj odmítá
   a my_listing_quota() podle něj web píše „využito 1 z 1". Stálo tam 1
   a 10 — profil sliboval jeden inzerát, server pustil deset. */
const limitVytvor = (telo.match(/max_listings from account_tier where user_id = uid\), (\d+)\)/) || [])[1];
const kvota = sql.slice(sql.lastIndexOf('create or replace function my_listing_quota'));
const limitKvota = (kvota.slice(0, kvota.indexOf('$$;')).match(/max_listings from account_tier where user_id = auth\.uid\(\)\), (\d+)\)/) || [])[1];
pravda(`limit volného účtu je stejný v create_listing i my_listing_quota (${limitVytvor})`,
  limitVytvor !== undefined && limitVytvor === limitKvota,
  `create_listing pouští ${limitVytvor}, web ukazuje ${limitKvota} — jedno z těch čísel člověk vidí a druhé platí`);

console.log('\nMeze v prohlížeči a na serveru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Meze: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
