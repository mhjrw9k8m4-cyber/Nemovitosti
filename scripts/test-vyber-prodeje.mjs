/* Test: výběr prodejů nesmí žádný zdroj ztratit
   ==================================================================
   Spuštění: node scripts/test-vyber-prodeje.mjs   (bez sítě)

   PROČ TO VZNIKLO — Z MĚŘENÍ, NE Z ÚVAHY. Výběr prodejů byl do 4. 11.
   ruční seznam čtyř zdrojů a poznával je PODLE PRÓZY v poli `extra`:
   `/Bezrealitky/`, `/Sreality/`, `/Farmy/`, `/státní/`. Co na žádný
   vzor nesedlo, tiše vypadlo.

   Změřeno na běhu robota 41806195447: ÚZSVM mělo stav „ok", 91 nabídek,
   síto nepustilo 2 — a na webu z něj byla NULA. Jeho `extra` je
   „Aukce vyhlášena (…) · přihlášky do … · nabídka ÚZSVM"; ani jedno
   ze čtyř slov v něm není. Týž krok sebral 18 nabídek státu, jejichž
   `extra` nese jméno podniku bez slova „státní".

   TEXTY V FIXTURÁCH JSOU SKUTEČNÉ — opsané z data/opportunities.json
   a z běhu robota, ne vymyšlené (§365).
   ================================================================== */
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { vyberProdeje, hlaskyVyberu, pestryVzorek, NEZNAMY_ZDROJ, PODIL_PRODEJE, PODIL_VYCHOZI, zdrojNabidky } from './fetch-opportunities.mjs';
import { odkazNabidky, DETAIL_URL, nabidkyZOdpovedi } from './cti-uzsvm.mjs';
import { vymeraZPopisu, druhZPopisu, zminujeMetry } from './cti-nabidky-statu.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* --- SKUTEČNÉ PODOBY NABÍDEK (pole `extra` opsané z dat) -------- */
const nabidka = (zdroj, extra, price) => ({ type: 'sale', zdroj, extra, price, area: 1000, okres: 'Zlín', place: 'Racková' });
const BEZREALITKY = nabidka('Bezrealitky', 'inzerát – Bezrealitky', 1200000);
const FARMY = nabidka('Farmy', 'inzerát – Farmy.cz', 800000);
const SPU = nabidka('SPÚ', 'prodej státní půdy (SPÚ, § 12)', 150000);
const STAT = nabidka('Nabídky státu', 'Povodí Vltavy, státní podnik · nabídka státu', 300000);
/* A TYHLE DVĚ JSOU TY, O KTERÉ ŠLO: ani v jedné není žádné ze čtyř
   slov starého ručního seznamu. */
const UZSVM = nabidka('ÚZSVM',
  'Aukce vyhlášena (05.01.2027 11:00 - 06.01.2027 11:00) · přihlášky do 04.01.2027 23:59 · nabídka ÚZSVM',
  35000000);
const LESY = nabidka('Nabídky státu', 'Lesy České republiky, s.p. · nabídka státu', 450000);

/* ---- 1) ŽÁDNÝ ZDROJ SE NEZTRATÍ -------------------------------- */
{
  const vsechny = [BEZREALITKY, FARMY, SPU, STAT, UZSVM, LESY];
  const v = vyberProdeje(vsechny, (o) => o.zdroj);
  je('vybere se všech šest, nic nevypadne', v.vybrane.length, 6);
  pravda('a ÚZSVM je mezi nimi (tohle byla ta vada: 91 stažených, 0 na webu)',
    v.vybrane.includes(UZSVM),
    'zdroje ve výběru: ' + JSON.stringify(v.podle.map((p) => p.zdroj)));
  pravda('i nabídka Lesů ČR, jejíž `extra` slovo „státní" nemá',
    v.vybrane.includes(LESY));
  je('každý zdroj má v rozpisu řádek', v.podle.length, 5);
  const h = hlaskyVyberu(v).join('\n');
  pravda('a v logu je u každého „vzato X z Y"',
    /ÚZSVM: vzato 1 z 1/.test(h) && /Bezrealitky: vzato 1 z 1/.test(h), h);
}

/* ---- 2) KDO NENÍ V ROZPISU, BERE SE CELÝ ----------------------- */
{
  /* Tohle je to podstatné pravidlo: zdroj přidaný řádkem v registru
     (§225) o sobě v tomhle souboru nemá co hlásit — a nesmí tím
     zmizet. */
  const noveZdroje = Array.from({ length: 50 }, (_, i) => nabidka('Zbrusu nový zdroj', 'nabídka odnikud', 1000 * (i + 1)));
  const v = vyberProdeje(noveZdroje, (o) => o.zdroj);
  je('padesát nabídek neznámého zdroje projde všech padesát', v.vybrane.length, 50);
  /* Pozor na JSON: `Infinity` se do něj zapíše jako `null`, takže
     `je(…, null)` by prošlo i pro skutečnou nulu. Proto rovnost. */
  pravda('a výchozí strop je „bez stropu"', PODIL_VYCHOZI === Infinity,
    'vyvezeno: ' + String(PODIL_VYCHOZI));
}

/* ---- 3) STROP PLATÍ TAM, KDE BYL ------------------------------- */
{
  je('v rozpisu jsou jen dva stropy', [...PODIL_PRODEJE.keys()].sort(), ['SPÚ', 'Sreality (Apify)']);
  je('SPÚ má 900', PODIL_PRODEJE.get('SPÚ'), 900);
  const spu = Array.from({ length: 1000 }, (_, i) => nabidka('SPÚ', 'prodej státní půdy (SPÚ, § 12)', 1000 * (i + 1)));
  const v = vyberProdeje(spu, (o) => o.zdroj);
  je('z tisíce nabídek SPÚ se vezme 900', v.vybrane.length, 900);
  const ceny = v.vybrane.map((o) => o.price);
  pravda('a je to vzorek napříč cenami, ne devět set nejlevnějších',
    Math.max(...ceny) > 900000, 'nejdražší vybraná: ' + Math.max(...ceny));
  const h = hlaskyVyberu(v).join('\n');
  pravda('a v logu stojí, že se strop použil', /vzato 900 z 1000 \(strop 900/.test(h), h);
}

/* ---- 4) NEROZPOZNANÝ ZDROJ SE OHLÁSÍ, NE ZAHODÍ ---------------- */
{
  const nikdo = { type: 'sale', price: 5000, area: 500, extra: 'nic, z čeho by se dal zdroj poznat' };
  const v = vyberProdeje([nikdo, UZSVM], (o) => o.zdroj || null);
  pravda('nabídka bez rozpoznaného zdroje se vezme', v.vybrane.includes(nikdo));
  pravda('a jmenuje se v rozpisu', v.podle.some((p) => p.zdroj === NEZNAMY_ZDROJ));
  pravda('a napíše se k tomu varování',
    v.varovani.some((x) => /nemá rozpoznaný zdroj/.test(x)), JSON.stringify(v.varovani));
}

/* ---- 5) DROBNOSTI, KTERÉ UMÍ SHODIT CELÝ BĚH ------------------- */
{
  je('prázdný vstup nespadne', vyberProdeje([], (o) => o.zdroj).vybrane, []);
  je('a null taky ne', vyberProdeje(null, (o) => o.zdroj).vybrane, []);
  je('bez zjišťování zdroje jsou všichni „neznámý zdroj"',
    vyberProdeje([UZSVM], null).podle[0].zdroj, NEZNAMY_ZDROJ);
  je('pestrý vzorek bez stropu vrací vstup', pestryVzorek([1, 2, 3], Infinity), [1, 2, 3]);
  je('a z devíti vezme tři', pestryVzorek([1, 2, 3, 4, 5, 6, 7, 8, 9], 3), [1, 4, 7]);
}

/* ---- 6) ODKAZ NA NABÍDKU ÚZSVM --------------------------------- */
{
  je('odkaz se skládá z čísla nabídky', odkazNabidky(149475),
    'https://nabidkamajetku.gov.cz/Home/Detail/149475');
  je('a adresa je ta změřená (/detail/ i /api/Property/Detail dávaly 404)',
    DETAIL_URL, 'https://nabidkamajetku.gov.cz/Home/Detail/');
  je('bez čísla žádný odkaz', odkazNabidky(null), '');
  je('a z nečísla taky ne', odkazNabidky('abc'), '');
  je('ani z čísla s písmeny', odkazNabidky('12a'), '');
  /* A ŽE SE TEN ODKAZ OPRAVDU DOSTANE DO NABÍDKY. Skutečný záznam
     z ohledání 41802028063; bez téhle kontroly by stačilo zapomenout
     jeden řádek a nabídka by byla zpátky bez odkazu. */
  const PRODEJ = {
    Id: 149475,
    Name: 'pozemek p. č. 233/3 v k. ú. Bukovec',
    Description: 'Pozemek p. č. 233/3 o výměře 15 003 m2 se nachází v okrajové části obce.',
    CategoryName: 'Pozemky',
    Price: '35 000 000,00',
    NoPrice: false,
    StatusName: 'Aukce vyhlášena (05.01.2027 11:00 - 06.01.2027 11:00)',
    DistrictName: 'Plzeň-město',
  };
  const { nabidky } = nabidkyZOdpovedi({ Properties: [PRODEJ] },
    vymeraZPopisu, druhZPopisu, {}, zminujeMetry);
  je('ze skutečného záznamu vyjde jedna nabídka', nabidky.length, 1);
  je('a nese odkaz na svou stránku u ÚZSVM', nabidky[0] && nabidky[0].url,
    'https://nabidkamajetku.gov.cz/Home/Detail/149475');
}

/* ---- 7) ŽE SE RUČNÍ SEZNAM NEVRÁTIL --------------------------- */
{
  const telo = readFileSync(new URL('./fetch-opportunities.mjs', import.meta.url), 'utf8');
  const hlavni = telo.slice(telo.indexOf('const CAP = {'));
  pravda('výběr prodejů se dělá podle jména zdroje',
    /vyberProdeje\(sale, \(o\) => zdrojNabidky\(o, znamaJmena\)\)/.test(hlavni),
    'jinak by se zdroj poznával z prózy a nový zdroj by tiše vypadl');
  pravda('a v hlavním běhu už není filtr podle slova „státní" v extra',
    !/\/státní\/i\.test\(o\.extra/.test(telo),
    'právě tenhle vzor vzal ÚZSVM všech 91 nabídek');
  pravda('rozpis výběru se vypisuje', /for \(const r of hlaskyVyberu\(vyber\)\)/.test(hlavni));
  pravda('a varování taky', /vyber\.varovani/.test(hlavni));
  pravda('mrtvý strop `sale` v CAP už není',
    !/CAP = \{ sale:/.test(telo), 'držel se v kódu, ale nic nerozhodoval');
}

/* ---- 8) A ŽE SE ÚZSVM POZNÁ PODLE JMÉNA ----------------------- */
{
  je('zdroj nabídky ÚZSVM', zdrojNabidky(UZSVM, ['ÚZSVM']), 'ÚZSVM');
  je('a nabídky státu', zdrojNabidky(LESY, ['Nabídky státu']), 'Nabídky státu');
}

console.log('Výběr prodejů — ať se žádný zdroj neztratí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) console.error(`::error::Výběr prodejů: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
process.exit(chyb ? 1 : 0);
