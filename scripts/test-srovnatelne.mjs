/* Test: výběr srovnatelných pozemků.
   ==================================================================
   Spuštění: node scripts/test-srovnatelne.mjs   (nepotřebuje prohlížeč)

   Sekce „Srovnatelné pozemky" tvrdí jednu větu — „z šesti nabídek do
   12 km je tenhle druhý nejdražší" — a hned pod ní vypíše všech šest
   i s cenami. Tím pádem stačí, aby se věta a seznam rozešly o jedno
   místo, a web se při lži přistihne sám.

   Proto se tu měří hlavně SOULAD: pořadí odpovídá seznamu, v seznamu
   není nic, co se porovnávat nesmí (jiný druh, jiná velikostní třída,
   pozemek přes půl republiky), a seznam je pokaždé stejný nad týmiž
   daty. Nakonec totéž na OSTRÝCH datech, protože meze (25 km, ±3×)
   byly vybrané podle měření a mají se podle měření i hlídat.
   ================================================================== */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { srovnatelne, patriKSobe, kmMezi, veta,
  OKRUH_KM, POMER_PLOCHY, MIN_SROVNATELNYCH, MAX_SROVNATELNYCH } from './srovnatelne.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- 1) co se porovnávat nesmí ---------------------------------- */
const ja = { id: 'ja', skupina: 'Orná půda', area: 10000, m2: 50, lat: 50, lng: 14 };
pravda('jiný druh se nesrovnává',
  !patriKSobe(ja, { skupina: 'Stavební / zastavěná', area: 10000 }));
pravda('desetkrát větší pozemek se nesrovnává',
  !patriKSobe(ja, { skupina: 'Orná půda', area: 100000 }));
pravda('desetkrát menší pozemek se nesrovnává',
  !patriKSobe(ja, { skupina: 'Orná půda', area: 1000 }));
pravda('trojnásobek ještě ano', patriKSobe(ja, { skupina: 'Orná půda', area: 30000 }));
pravda('sám sebe ne', !patriKSobe(ja, ja));
/* Dvě nabídky na jednom klíči jsou dvě stránky, ale jeden kus země. */
pravda('ani své dvojče na témže klíči',
  !patriKSobe(Object.assign({ pk: 'obec|123|okres' }, ja),
    { pk: 'obec|123|okres', skupina: 'Orná půda', area: 12000 }));
pravda('ale jiný pozemek s jiným klíčem ano',
  patriKSobe(Object.assign({ pk: 'obec|123|okres' }, ja),
    { pk: 'obec|456|okres', skupina: 'Orná půda', area: 12000 }));

/* Vzdálenost: Praha–Brno je 185 km vzdušnou čarou. Kdyby se počítala
   špatně, prošly by kontroly níž na vymyšlených datech a sekce by na
   ostrých datech srovnávala pozemky přes celou republiku. */
const d = kmMezi({ lat: 50.0755, lng: 14.4378 }, { lat: 49.1951, lng: 16.6068 });
pravda(`vzdálenost sedí (Praha–Brno ${d.toFixed(0)} km)`, d > 180 && d < 190, `vyšlo ${d.toFixed(1)}`);

/* ---- 2) málo srovnatelných = nic, ne výplň ---------------------- */
{
  const dva = [
    { id: 'a', skupina: 'Orná půda', area: 9000, m2: 40, lat: 50.01, lng: 14.01 },
    { id: 'b', skupina: 'Orná půda', area: 11000, m2: 60, lat: 50.02, lng: 14.02 },
  ];
  pravda(`pod ${MIN_SROVNATELNYCH} srovnatelné se sekce nevydá`, srovnatelne(ja, dva) === null,
    JSON.stringify(srovnatelne(ja, dva)));
  const daleko = [0, 1, 2].map((i) => ({ id: 'd' + i, skupina: 'Orná půda', area: 10000,
    m2: 40, lat: 50 + 0.9 + i * 0.01, lng: 14 }));   // ~100 km
  pravda('a vzdálené nabídky se nepočítají ani do počtu',
    srovnatelne(ja, daleko) === null, JSON.stringify(srovnatelne(ja, daleko)));
}

/* ---- 3) pořadí sedí na vypsaný seznam --------------------------- */
{
  const okoli = [
    { id: 'a', skupina: 'Orná půda', area: 10000, m2: 80, lat: 50.01, lng: 14 },
    { id: 'b', skupina: 'Orná půda', area: 10000, m2: 70, lat: 50.02, lng: 14 },
    { id: 'c', skupina: 'Orná půda', area: 10000, m2: 30, lat: 50.03, lng: 14 },
    { id: 'e', skupina: 'Orná půda', area: 10000, m2: 20, lat: 50.04, lng: 14 },
  ];
  const s = srovnatelne(ja, okoli);
  pravda('srovnání vzniklo', !!s, 'nevzniklo');
  if (s) {
    pravda(`počet sedí (${s.zCelkem} = ${s.polozky.length} + já)`,
      s.zCelkem === s.polozky.length + 1);
    pravda('seznam je seřazený od nejdražší',
      s.polozky.every((p, i) => i === 0 || s.polozky[i - 1].x.m2 >= p.x.m2),
      JSON.stringify(s.polozky.map((p) => p.x.m2)));
    /* TOHLE JE JÁDRO: pořadí z věty se musí dát v seznamu napočítat. */
    const draz = s.polozky.filter((p) => p.x.m2 > s.m2).length;
    pravda(`pořadí jde napočítat ze seznamu (${s.poradi}. z ${s.zCelkem})`,
      s.poradi === draz + 1, `ve větě ${s.poradi}., v seznamu dražších ${draz}`);
    pravda('a sedí na ta konkrétní čísla (80, 70 > 50; 30 <)', s.poradi === 3,
      JSON.stringify(s.polozky.map((p) => p.x.m2)) + ' vs. já ' + s.m2);
    pravda('okruh je vzdálenost té nejvzdálenější vypsané, ne mez modulu',
      s.okruh >= 1 && s.okruh <= 10, 'okruh ' + s.okruh + ' km');
    pravda('věta se dá přečíst', /3\. nejdražší/.test(veta(s)), veta(s));
  }
}

/* ---- 4) nejdražší a nejlevnější se pojmenují, ne očíslují ------- */
{
  const levne = [10, 11, 12].map((m2, i) => ({ id: 'x' + i, skupina: 'Orná půda',
    area: 10000, m2, lat: 50.01 + i * 0.01, lng: 14 }));
  const s = srovnatelne(ja, levne);
  pravda('nejdražší se tak i řekne', s && /nejdražší/.test(veta(s)) && !/1\./.test(veta(s)),
    s ? veta(s) : 'nevzniklo');
  const drahe = levne.map((x) => Object.assign({}, x, { m2: 900 }));
  const s2 = srovnatelne(ja, drahe);
  pravda('a nejlevnější taky', s2 && /nejlevnější/.test(veta(s2)), s2 ? veta(s2) : 'nevzniklo');
}

/* ---- 5) víc než MAX se nevypisuje, a pořadí je z vypsaných ------ */
{
  const hodne = [];
  for (let i = 0; i < 20; i++) {
    hodne.push({ id: 'h' + i, skupina: 'Orná půda', area: 10000, m2: 10 + i,
      lat: 50 + 0.001 * i, lng: 14 });
  }
  const s = srovnatelne(ja, hodne);
  pravda(`vypisuje se nejvýš ${MAX_SROVNATELNYCH}`, s && s.polozky.length === MAX_SROVNATELNYCH,
    s ? String(s.polozky.length) : 'nevzniklo');
  const draz = s.polozky.filter((p) => p.x.m2 > s.m2).length;
  pravda('a pořadí se počítá z vypsaných, ne ze všech nalezených',
    s.poradi === draz + 1, `${s.poradi}. ve větě, ${draz} dražších v seznamu`);
}

/* ---- 6) týž vstup, týž výsledek --------------------------------- */
{
  /* Stránky se přegenerovávají čtyřikrát denně a commituje je robot.
     Kdyby se při shodě vzdálenosti rozhodovalo pořadím v poli, měnil
     by se seznam sám od sebe a každé sestavení by přepsalo 2 000
     souborů bez jediné skutečné změny. */
  const a = [0, 1, 2, 3].map((i) => ({ id: 'r' + i, skupina: 'Orná půda', area: 10000,
    m2: 40 + i, lat: 50.01, lng: 14 }));
  const prvni = JSON.stringify(srovnatelne(ja, a).polozky.map((p) => p.x.id));
  const druhy = JSON.stringify(srovnatelne(ja, a.slice().reverse()).polozky.map((p) => p.x.id));
  pravda('shodně vzdálené nabídky nemíchá pořadí v poli', prvni === druhy,
    `${prvni} vs. ${druhy}`);
}

/* ---- 7) OSTRÁ DATA: meze dávají smysl na skutečném trhu --------- */
{
  const require2 = createRequire(import.meta.url);
  const PKH = require2('../js/hlidani-logika.js');
  const KLIC = require2('../js/klic.js').PKKlic;
  const syrova = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const DATA = PKH.bezDuplicit(syrova);
  new Function(readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8'))();
  const CENY = globalThis.PK_CENY;
  const MODEL = CENY.postav(DATA);
  /* Vzorek se skládá TÝMŽ postupem jako v generátoru — včetně té
     hvězdičky „|podíl" v klíči skupiny. Kdyby si ho tahle zkouška
     postavila po svém, hlídala by vlastní kopii pravidel. */
  const kand = [];
  let pochybnych = 0;
  for (const o of DATA) {
    if (o.type !== 'sale') continue;
    if (!(o.price > 0 && o.area >= 100 && o.area <= 500000)) continue;
    if (!isFinite(o.lat) || !isFinite(o.lng)) continue;
    if (MODEL.neduveryhodna && MODEL.neduveryhodna(o)) continue;
    const odh = MODEL.odhad && MODEL.odhad(o);
    if (odh && odh.pochybna) { pochybnych++; continue; }
    const m2 = CENY.zaMetr(o);
    if (!(m2 > 0)) continue;
    kand.push({ id: o.url || '', pk: KLIC.pkey(o), pochybna: !!(odh && odh.pochybna),
      skupina: MODEL.druhGroup(o.druh) + (o.podil ? '|podíl' : ''),
      podil: !!o.podil, area: o.area, m2, lat: o.lat, lng: o.lng, okres: o.okres });
  }
  /* CENA, PŘED KTEROU WEB JINDE VARUJE, SE NESMÍ STÁT DŮKAZEM.
     Model má dvě síta. `neduveryhodna` je hrubé (cena pod padesátinou
     hladiny) a chytá 3 nabídky z 1 817. `pochybna` je to přísné —
     „takový rozdíl bývá spoluvlastnický podíl nebo jiná výměra,
     ověřte si to" — a těch je 140. Ty se do seznamu srovnatelných
     dostávaly jako obyčejný řádek: pět nabídek po 5–6 Kč/m² za ornou
     půdu vedle sebe, prezentovaných jako stav trhu. Za tolik se pole
     neprodává.
     Stálo to 99 stránek ze 1 125, které o srovnání přišly. */
  pravda(`model označuje část nabídek za pochybné (${pochybnych})`, pochybnych >= 50,
    'bez nich by kontrola níž neměla co hlídat');
  pravda('a žádná taková se nedostala mezi kandidáty na srovnání',
    kand.every((k) => !k.pochybna), 'síto nefunguje');
  pravda('v datech jsou i spoluvlastnické podíly (jinak by se kontrola níž neměla o co opřít)',
    kand.filter((k) => k.podil).length >= 100, String(kand.filter((k) => k.podil).length));
  pravda('ostrých kandidátů je dost na měření', kand.length >= 1000, String(kand.length));

  let maji = 0, ciziOkres = 0, spatnyDruh = 0, spatnaVelikost = 0, mimoOkruh = 0, rozchod = 0;
  let pocetVypsanych = 0, michaPodily = 0, dvojcata = 0;
  const vzdalenosti = [];
  for (const k of kand) {
    const s = srovnatelne(k, kand);
    if (!s) continue;
    maji++;
    vzdalenosti.push(s.okruh);
    if (s.poradi !== 1 + s.polozky.filter((p) => p.x.m2 > s.m2).length) rozchod++;
    for (const p of s.polozky) {
      pocetVypsanych++;
      if (p.x.skupina !== k.skupina) spatnyDruh++;
      /* Cena za metr u podílu je přepočtená na metr, který kupujícímu
         připadne — vedle celé parcely by vypadala jako výhodná koupě.
         Tohle je ta nejdražší chyba, kterou tu jde udělat. */
      if (!!p.x.podil !== !!k.podil) michaPodily++;
      if (p.x.pk === k.pk) dvojcata++;
      if (p.x.area > k.area * POMER_PLOCHY || p.x.area < k.area / POMER_PLOCHY) spatnaVelikost++;
      if (p.km > OKRUH_KM) mimoOkruh++;
      if (p.x.okres !== k.okres) ciziOkres++;
    }
  }
  const pokryti = (100 * maji) / kand.length;
  pravda(`srovnání vzniklo u většiny nabídek (${pokryti.toFixed(1)} %)`, pokryti >= 55,
    `jen ${maji} z ${kand.length} — meze jsou moc přísné, sekce by nikde nebyla`);
  pravda('a ne úplně u všech (jinak mez nic neodfiltruje)', pokryti <= 98,
    `${pokryti.toFixed(1)} % — to by znamenalo, že se srovnává i to, co se srovnávat nemá`);
  pravda('v žádném seznamu není jiný druh', spatnyDruh === 0, String(spatnyDruh));
  pravda('ani jiná velikostní třída', spatnaVelikost === 0, String(spatnaVelikost));
  pravda(`ani nic za ${OKRUH_KM} km`, mimoOkruh === 0, String(mimoOkruh));
  pravda('a věta se nikde nerozchází se seznamem', rozchod === 0, String(rozchod));
  pravda('spoluvlastnický podíl se nikde nesrovnává s celou parcelou',
    michaPodily === 0, `${michaPodily} takových řádků`);
  pravda('a žádná stránka nesrovnává pozemek s jeho vlastním dvojčetem',
    dvojcata === 0, `${dvojcata} takových řádků`);
  vzdalenosti.sort((a, b) => a - b);
  const med = vzdalenosti[Math.floor(vzdalenosti.length / 2)];
  /* 15 km, protože naměřeno 13. Kdyby se mez povolila „ať to projde",
     nehlídala by nic: přesně tak by se dovnitř vloudilo těch 19 km,
     které dává okruh 35 km, a sekce by srovnávala přes dva okresy. */
  pravda(`medián okruhu je místní, ne krajský (${med} km)`, med <= 15, `${med} km`);
  const vypsano = Math.max(1, spatnyDruh + spatnaVelikost + mimoOkruh + pocetVypsanych);
  zpravy.push(`  · pozn.: ${(100 * ciziOkres / vypsano).toFixed(0)} % vypsaných srovnání`
    + ' je z vedlejšího okresu — hranice okresu není hranice trhu, proto se nepoužívá');
}

console.log('\nSrovnatelné pozemky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Srovnatelné pozemky: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
