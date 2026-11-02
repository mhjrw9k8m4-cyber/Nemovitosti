// Test: výpadek jednoho zdroje nesmí zmrazit celá data.
//
// Spuštění: node scripts/test-vypadek-zdroje.mjs   (bez prohlížeče)
//
// Proč to tu je. Změřeno 2. 11. 2026: z 2 004 nabídek na webu jich
// 1 628 pochází z jediného zdroje (Bezrealitky, 81 %); ze 2 578
// stažených jich tenhle zdroj dodal 1 909, tedy 74 %. Globální pojistka
// v robotovi hlídá CELEK — když se stáhne méně než 60 % minulého
// počtu, běh skončí chybou a soubor se nepřepíše. U rozložení 95 : 5
// to znamená, že výpadek JEDNOHO webu zastaví všechno: nejen jeho
// nabídky, ale i nové nabídky zdrojů, které zrovna fungují. Celá data
// pak stojí tak dlouho, dokud se ten jeden web nespraví.
//
// Náprava má dvě poloviny a tenhle hlídač měří obě:
//   1) nabídky zdroje, který DNES NEODPOVĚDĚL, se podrží z minulého
//      běhu — se stropem na stáří (DRZENI_DNU) a se štítkem
//      `drzeno_od`, aby bylo zvenčí vidět, že se nedrží navždy;
//   2) pojistka se počítá JEN z toho, co se dnes opravdu stáhlo.
//      Kdyby se do ní držené nabídky počítaly, stačilo by, aby mlčely
//      všechny zdroje: počet by zůstal, pojistka by neřekla nic a běh
//      by vypadal zdravě. To je horší než pád.
//
// Past, na kterou si tu dávám pozor: kdyby se `drzeno_od` při každém
// dalším běhu přepsalo na dnešek, strop by nikdy nenastal a nabídky
// by se držely věčně. Měří se proto zvlášť (zkouška 9).
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const U = (p) => new URL('../' + p, import.meta.url);
const F = await import('./fetch-opportunities.mjs');
const kod = readFileSync(U('scripts/fetch-opportunities.mjs'), 'utf8');
const data = JSON.parse(readFileSync(U('data/opportunities.json'), 'utf8'));
const DNES = '2026-11-02';
const minus = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') - n * 86400000).toISOString().slice(0, 10);

// --- 1) nástroje vůbec existují a strop je rozumný ------------------
pravda('robot umí držet nabídky vypadlého zdroje',
  typeof F.podrzNabidkyVypadlych === 'function' && typeof F.zdrojNabidky === 'function');
pravda(`strop držení je dnů, ne měsíců (DRZENI_DNU = ${F.DRZENI_DNU})`,
  Number.isInteger(F.DRZENI_DNU) && F.DRZENI_DNU >= 2 && F.DRZENI_DNU <= 14,
  'držet nabídky po zdroji, který mlčí týdny, znamená tvrdit o nich, že existují');

// --- 2) jména zdrojů se krejí se seznamem v main() ------------------
/* Kdyby se rozešla, držení by mlčky přestalo fungovat: hledal by se
   zdroj jménem, které v seznamu stavů není. */
const vSources = [...kod.matchAll(/\[\s*'([^']+)'\s*,\s*fetch\w+\]/g)].map((m) => m[1]);
pravda(`seznam zdrojů v main() se přečetl (${vSources.length})`, vSources.length >= 5, vSources.join(', '));
const chybiVJmenech = vSources.filter((j) => !F.ZDROJ_JMENA.includes(j));
const navicVJmenech = F.ZDROJ_JMENA.filter((j) => !vSources.includes(j));
pravda('ZDROJ_JMENA je přesně seznam zdrojů z main()',
  chybiVJmenech.length === 0 && navicVJmenech.length === 0,
  `chybí: ${chybiVJmenech.join(', ') || '—'} · navíc: ${navicVJmenech.join(', ') || '—'}`);

// --- 3) každý stahovač si do nabídky napíše své jméno --------------
const zdrojeVKodu = [...kod.matchAll(/^\s*zdroj: '([^']+)',$/gm)].map((m) => m[1]);
pravda(`všech ${vSources.length} stahovačů píše do nabídky pole zdroj`,
  new Set(zdrojeVKodu).size === vSources.length,
  `nalezeno ${new Set(zdrojeVKodu).size}: ${[...new Set(zdrojeVKodu)].join(', ')}`);
pravda('a žádné z těch jmen není mimo ZDROJ_JMENA',
  zdrojeVKodu.every((j) => F.ZDROJ_JMENA.includes(j)),
  zdrojeVKodu.filter((j) => !F.ZDROJ_JMENA.includes(j)).join(', '));
pravda('pole zdroj se před zápisem nemaže (jinak by držení druhý den nevědělo, čí nabídka je)',
  !/delete o\.zdroj|delete o\.drzeno_od/.test(kod));

// --- 4) zdroj se pozná u KAŽDÉ nabídky v živých datech -------------
/* Měří se na datech, ne proti konstantě: nepřiřazená nabídka se
   nedrží, takže každá nepřiřazená je dírou v pojistce. Dnešní data
   pole `zdroj` ještě nemají (zapíše ho až příští běh robota), takže
   tahle zkouška jde záložní cestou — štítek a hostitel. */
const nepriz = data.opportunities.filter((o) => !F.zdrojNabidky(o));
pravda(`zdroj se pozná u všech ${data.opportunities.length} nabídek v datech`,
  nepriz.length === 0,
  `${nepriz.length} nepřiřazených, např. ${JSON.stringify((nepriz[0] || {}).extra || '')}`);
const podle = {};
for (const o of data.opportunities) { const z = F.zdrojNabidky(o); podle[z] = (podle[z] || 0) + 1; }
pravda('a každý zdroj se pozná jen jedním ze svých jmen',
  Object.keys(podle).every((z) => F.ZDROJ_JMENA.includes(z)),
  JSON.stringify(podle));

// --- 5) výpadek: nabídky se podrží ---------------------------------
const vzorek = (z, n, extra) => Array.from({ length: n }, (_, i) => ({
  place: 'Obec', okres: 'Okres', type: 'sale', area: 1000, price: 100000,
  url: `https://priklad.test/${z}/${i}`, zdroj: z, extra: extra || '',
}));
{
  const drive = [...vzorek('Bezrealitky', 40), ...vzorek('Farmy', 5)];
  const zdroje = [{ nazev: 'Bezrealitky', stav: 'chyba' }, { nazev: 'Farmy', stav: 'ok' }];
  const cerstve = vzorek('Farmy', 5);              // Farmy odpověděly, Bezrealitky ne
  const v = F.podrzNabidkyVypadlych(zdroje, cerstve, DNES, drive);
  pravda('vypadlý zdroj si podrží všechny své nabídky z minulého běhu',
    v.nabidky.length === 40 && v.podleZdroje.get('Bezrealitky') === 40,
    `podrženo ${v.nabidky.length}`);
  pravda('a každá podržená nese datum, od kdy se drží',
    v.nabidky.every((o) => o.drzeno_od === DNES));
  pravda('zdroj, který odpověděl, se nedrží',
    !v.podleZdroje.has('Farmy') && v.nabidky.every((o) => o.zdroj === 'Bezrealitky'));
  pravda('nic se nepustilo — strop se ještě nepřiblížil', v.pustene === 0);
}

// --- 6) nabídka, která dnes přišla, se nepřidá podruhé -------------
{
  const drive = vzorek('Bezrealitky', 10);
  const zdroje = [{ nazev: 'Bezrealitky', stav: 'chyba' }];
  /* Nesmyslný, ale poučný případ: zdroj hlásí chybu, a přesto se
     tři jeho nabídky dnes stáhly (třeba z mezipaměti). Dvojník by se
     v datech objevil dvakrát. */
  const v = F.podrzNabidkyVypadlych(zdroje, drive.slice(0, 3), DNES, drive);
  pravda('nabídka stažená dnes se už nedoplňuje z minulého běhu',
    v.nabidky.length === 7 && new Set(v.nabidky.map((o) => o.url)).size === 7,
    `podrženo ${v.nabidky.length} ze 7`);
}

// --- 6b) zdroj BEZ ODKAZŮ se podrží taky ---------------------------
/* SPÚ nemá u nabídek adresu (změřeno 2. 11.: 549 nabídek, ani jedna).
   Kdyby se totožnost brala jen z odkazu, zmizel by při výpadku celý,
   zatímco ostatní zdroje by se podržely — a nikde by to nebylo vidět. */
{
  const spu = (n, od) => Array.from({ length: n }, (_, i) => ({
    place: 'Obec' + i, okres: 'Okres', type: 'sale', area: 1000 + i, price: 100000 + i,
    parcel: String(i), zdroj: 'SPÚ', extra: 'prodej státní půdy (SPÚ, § 12)',
    ...(od ? { drzeno_od: od } : {}),
  }));
  const drive = spu(12);
  const zdroje = [{ nazev: 'SPÚ', stav: 'chyba' }];
  const v = F.podrzNabidkyVypadlych(zdroje, [], DNES, drive);
  pravda('podrží se i zdroj, jehož nabídky nemají odkaz (SPÚ)',
    v.nabidky.length === 12 && v.podleZdroje.get('SPÚ') === 12, `podrženo ${v.nabidky.length} z 12`);
  /* A dvojník se nesmí vyrobit ani bez odkazu: tři z nich dnes přišly. */
  const v2 = F.podrzNabidkyVypadlych(zdroje, spu(3), DNES, drive);
  pravda('a bez odkazu se dnes stažená nabídka taky nedoplní podruhé',
    v2.nabidky.length === 9, `podrženo ${v2.nabidky.length} z 9`);
}

// --- 7) vypnutý zdroj se nedrží -----------------------------------
{
  const drive = vzorek('Sreality (Apify)', 20);
  const v = F.podrzNabidkyVypadlych([{ nazev: 'Sreality (Apify)', stav: 'vypnuto' }], [], DNES, drive);
  pravda('vypnutý zdroj se nedrží — „chybí klíč" není výpadek, ale rozhodnutí',
    v.nabidky.length === 0 && v.pustene === 0);
  const vP = F.podrzNabidkyVypadlych([{ nazev: 'Sreality (Apify)', stav: 'pokles' }], [], DNES, drive);
  pravda('a „pokles" se nedrží taky — zdroj odpověděl, jen málo',
    vP.nabidky.length === 0);
}

// --- 8) strop na stáří --------------------------------------------
{
  const zdroje = [{ nazev: 'Bezrealitky', stav: 'chyba' }];
  const stare = vzorek('Bezrealitky', 6).map((o, i) => ({ ...o, drzeno_od: minus(DNES, i + F.DRZENI_DNU - 2) }));
  const v = F.podrzNabidkyVypadlych(zdroje, [], DNES, stare);
  /* Dvě nabídky jsou mladší než strop (DRZENI_DNU − 2 a − 1 dnů),
     čtyři ho dosáhly nebo přerostly. */
  pravda(`po ${F.DRZENI_DNU} dnech se nabídky pustí, mladší se drží dál`,
    v.nabidky.length === 2 && v.pustene === 4,
    `podrženo ${v.nabidky.length}, pustilo se ${v.pustene}`);
  const vsechnyStare = vzorek('Bezrealitky', 3).map((o) => ({ ...o, drzeno_od: minus(DNES, 90) }));
  const v2 = F.podrzNabidkyVypadlych(zdroje, [], DNES, vsechnyStare);
  pravda('zdroj, který mlčí tři měsíce, nedrží nic', v2.nabidky.length === 0 && v2.pustene === 3);
  const bezData = vzorek('Bezrealitky', 2).map((o) => ({ ...o, drzeno_od: 'nesmysl' }));
  pravda('nečitelné datum držení nabídku pustí, nedrží ji navždy',
    F.podrzNabidkyVypadlych(zdroje, [], DNES, bezData).nabidky.length === 0);
}

// --- 9) datum držení se nepřepisuje (jinak by strop nikdy nenastal) -
{
  const zdroje = [{ nazev: 'Bezrealitky', stav: 'chyba' }];
  const vcerejsi = vzorek('Bezrealitky', 4).map((o) => ({ ...o, drzeno_od: minus(DNES, 1) }));
  const v = F.podrzNabidkyVypadlych(zdroje, [], DNES, vcerejsi);
  pravda('druhý den výpadku si nabídka ponechá původní drzeno_od',
    v.nabidky.length === 4 && v.nabidky.every((o) => o.drzeno_od === minus(DNES, 1)),
    `data: ${[...new Set(v.nabidky.map((o) => o.drzeno_od))].join(', ')}`);
  pravda('a stáří se počítá podle něj (dnes − drzeno_od)',
    F.stariVeDnech(minus(DNES, 3), DNES) === 3 && F.stariVeDnech(DNES, DNES) === 0);
}

// --- 10) nabídka bez poznatelného zdroje se nedrží -----------------
{
  const cizi = [{ place: 'Obec', okres: 'Okres', type: 'sale', url: 'https://nekdo-jiny.test/1' }];
  const v = F.podrzNabidkyVypadlych([{ nazev: 'Bezrealitky', stav: 'chyba' }], [], DNES, cizi);
  pravda('nabídka, u které se zdroj poznat nedá, se nedrží — neví se, čí by byla',
    v.nabidky.length === 0);
}

// --- 11) pojistka se počítá jen z toho, co se dnes stáhlo ----------
pravda('pojistka odečítá držené nabídky (poměr se měří na stažených)',
  /const drzenych = fresh\.filter\(\(o\) => o && o\.drzeno_od\)\.length;/.test(kod)
  && /const stazeno = fresh\.length - drzenych;/.test(kod)
  && /if \(minuleBezDrzeni >= 30 && stazeno < minuleBezDrzeni \* 0\.6\)/.test(kod),
  'kdyby se počítal celek, mlčení VŠECH zdrojů by se schovalo za podržené nabídky');

// --- 12) držení je PŘED prořezáním, ne za ním ---------------------
/* Držené nabídky musí projít týmiž síty jako čerstvé: dvojníci,
   proběhlé dražby, stropy na druh. Kdyby se přimíchaly až za ně,
   vrátila by se do dat dražba, která už byla. */
const iDrzeni = kod.indexOf('raw.push(...podrzeno.nabidky);');
const iDvojnici = kod.indexOf('vyhozeno: dvojnici } = bezDvojnic(');
const iTerminy = kod.indexOf('const jesteBezi');
const iPojistka = kod.indexOf('const drzenych = fresh.filter');
pravda('držené nabídky se přimíchají před prořezáním a před pojistkou',
  iDrzeni > 0 && iDrzeni < iDvojnici && iDrzeni < iTerminy && iDrzeni < iPojistka,
  `držení ${iDrzeni}, dvojníci ${iDvojnici}, termíny ${iTerminy}, pojistka ${iPojistka}`);

// --- 13) držení se přizná ve stavu zdroje -------------------------
pravda('počet podržených nabídek se zapíše do stavu zdroje a ten jde do dat',
  /z\.podrzeno = p;/.test(kod) && /sources: zdroje,/.test(kod),
  'bez toho by se na webu výpadek nedal poznat od normálního běhu');
pravda('a když se nabídky pustí, robot to vypíše jako POZOR',
  /POZOR: \$\{podrzeno\.pustene\} nabídek se pustilo/.test(kod));

/* ---- 9) DRŽENÍ PLATÍ I PRO ZDROJ, KTERÝ JE JEN ŘÁDKEM V REGISTRU - */
/* NALEZENO MĚŘENÍM, NE ÚVAHOU. Po zavedení obecných zdrojů (zdroj bez
   vlastního stahovače, §337) drželo `podrzNabidkyVypadlych` NULA jejich
   nabídek: `zdrojNabidky` propouštěl jen jména ze zadrátovaného
   seznamu šesti stahovačů. Takový zdroj by tedy při výpadku zmizel
   celý — zatímco ostatní se podrží týden — a na kartě by neměl odznak.
   Jména se proto berou i z toho, co v běhu existuje. */
{
  const zdroje = [{ nazev: 'Nový z registru', stav: 'chyba', pocet: 0, obecny: true }];
  const drive = [{
    place: 'Zkušební', okres: 'Benešov', zdroj: 'Nový z registru',
    url: 'https://novy.test/n/1', price: 500000, area: 1000, den: '2026-11-01',
  }];
  const v = F.podrzNabidkyVypadlych(zdroje, [], '2026-11-02', drive);
  pravda('nabídky zdroje z registru se při jeho výpadku podrží',
    v.nabidky.length === 1 && v.podleZdroje.get('Nový z registru') === 1,
    JSON.stringify({ pocet: v.nabidky.length, podle: [...v.podleZdroje] }));
  /* PRVNÍ DEN VÝPADKU dostane nabídka dnešní datum, ne svůj `den`.
     Napsal jsem si sem nejdřív `den` a zkouška mě správně opravila:
     od `drzeno_od` se počítá strop sedmi dnů, takže kdyby se bral
     den vzniku nabídky, pustil by se týdny starý inzerát hned. */
  pravda('a podržená nabídka dostane drzeno_od na dnešní den',
    v.nabidky[0] && v.nabidky[0].drzeno_od === '2026-11-02', JSON.stringify(v.nabidky[0]));
  /* Seznam se ale nesmí otevřít úplně: štítek `zdroj` přichází z dat,
     která může přepsat i starý běh, a „nevím odkud" nesmí projít jako
     zdroj. Jméno, které v běhu není, se nerozpozná. */
  pravda('vymyšlený štítek zdroje se nerozpozná',
    F.zdrojNabidky({ zdroj: 'Vymyšlený zdroj', url: 'https://x.test/a' }) === null);
  pravda('a nabídka cizího zdroje se nepodrží, i když jeho jméno v datech stojí',
    F.podrzNabidkyVypadlych(zdroje, [], '2026-11-02',
      [{ ...drive[0], zdroj: 'Vymyšlený zdroj', url: 'https://x.test/a' }]).nabidky.length === 0);
  /* A ZDROJ_JMENA zůstává šesti stahovačům — jinak by kontrola shody
     s SOURCES výš přestala něco tvrdit. */
  pravda('ZDROJ_JMENA zůstává jen zapojeným stahovačům, data se do něj nelijí',
    F.ZDROJ_JMENA.length === 6 && Array.isArray(F.ZDROJ_JMENA_VSE)
    && F.ZDROJ_JMENA_VSE.length >= F.ZDROJ_JMENA.length,
    JSON.stringify({ jmena: F.ZDROJ_JMENA.length, vse: F.ZDROJ_JMENA_VSE.length }));
}

console.log('Výpadek zdroje:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
process.exit(chyb ? 1 : 0);
