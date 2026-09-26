// Test cenového modelu (js/ceny.js) — bez prohlížeče, na vymyšlených datech.
//
// Spuštění: node scripts/test-ceny.mjs
//
// Proč vymyšlená data a ne ostrá: u ostrých dat neznám správnou odpověď,
// takže bych mohl leda porovnávat výpočet sám se sebou. Tady vím dopředu,
// co má vyjít, takže se dá ověřit i to, co je na odhadu ceny nejdůležitější:
//
//  · vyvolávací ceny dražeb se NESMÍ počítat do srovnávací hladiny (jsou pod
//    trhem z podstaty — jinak bychom srovnávali dražby samy se sebou a žádný
//    rozdíl by nevyšel),
//  · nevěrohodné nabídky (spoluvlastnické podíly, překlepy) nesmí hladinu
//    stahovat dolů ani se samy tvářit jako výhodná koupě,
//  · když je v okrese málo srovnání, musí model přejít na kraj — a dál už NE,
//    protože celostátní medián o konkrétním okrese nevypovídá nic,
//  · a vždy musí přiznat, z čeho počítal.
import { readFileSync } from 'node:fs';

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

// js/ceny.js je prostý skript, ne modul — načteme ho do globálního prostoru.
const zdroj = readFileSync(new URL('../js/ceny.js', import.meta.url), 'utf8');
new Function(zdroj)();
const PK_CENY = globalThis.PK_CENY;
pravda('cenový model se načetl', !!(PK_CENY && PK_CENY.postav), 'globální PK_CENY chybí');

const OKRES_KRAJ = { 'Kolín': 'Středočeský', 'Kutná Hora': 'Středočeský', 'Cheb': 'Karlovarský' };

function pole(n, f) { return Array.from({ length: n }, (_, i) => f(i)); }
// V okrese Kolín deset nabídek orné půdy za rovných 40 Kč/m² (medián 40).
const KOLIN = pole(10, (i) => ({
  place: 'K' + i, okres: 'Kolín', type: 'sale', druh: 'orná půda',
  area: 10000, price: 400000,
}));
// V Kutné Hoře jen dvě — na okresní odhad je to málo, musí se přejít na kraj.
const KUTNA = pole(2, (i) => ({
  place: 'KH' + i, okres: 'Kutná Hora', type: 'sale', druh: 'orná půda',
  area: 10000, price: 900000,   // 90 Kč/m²
}));
// Dražba v Kolíně: 1 ha orné půdy s vyvolávací cenou 100 000 Kč (10 Kč/m²).
const DRAZBA = { place: 'Dražebnice', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000 };
// A ještě deset dalších dražeb po 10 Kč/m². Je to schválně VÍC než nabídek:
// kdyby se vyvolávací ceny počítaly do srovnávací hladiny, medián by spadl
// ze 40 na 10 a bylo by to vidět. S jedinou dražbou by se medián nepohnul
// a test by tu chybu přehlédl — což se mi taky stalo.
const DALSI_DRAZBY = pole(10, (i) => ({
  place: 'D' + i, okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000,
}));

const model = PK_CENY.postav([...KOLIN, ...KUTNA, DRAZBA, ...DALSI_DRAZBY], OKRES_KRAJ);

// --- 1) Odhad v okrese ------------------------------------------------
const o = model.odhad(DRAZBA);
pravda('dražba dostala odhad', !!o, 'odhad vyšel null');
if (o) {
  je('odhad se počítá z mediánu nabídek v okrese', o.zaM2, 40);
  je('odhadovaná částka je medián × výměra', o.castka, 400000);
  je('model přiznává, na jaké úrovni počítal', o.uroven, 'okres');
  je('model přiznává, z kolika nabídek', o.vzorek, 10);
  je('rozdíl proti vyvolávací ceně', o.rozdil, 300000);
  je('o kolik procent je pod odhadem', o.podOdhadem, 75);
}

// --- 2) Vyvolávací ceny dražeb se do hladiny nesmí počítat ------------
// Kdyby se počítaly, medián by spadl ze 40 na méně (dražba má 10 Kč/m²)
// a odhad by vyšel nižší než 400 000.
pravda('vyvolávací cena dražby neovlivnila srovnávací hladinu',
  !!o && o.zaM2 === 40,
  `medián vyšel ${o && o.zaM2} Kč/m² — do hladiny se nejspíš připletly dražby`);

// --- 3) Málo srovnání v okrese → přechod na kraj ----------------------
const drazbaKH = { place: 'X', okres: 'Kutná Hora', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000 };
const oKH = model.odhad(drazbaKH);
pravda('při málo datech v okrese se přejde na kraj', !!oKH && oKH.uroven === 'kraj',
  `úroveň vyšla ${oKH && oKH.uroven}`);
if (oKH) {
  // Kraj = 10× Kolín po 40 + 2× Kutná Hora po 90 → medián dvanácti hodnot je 40.
  je('krajský medián bere nabídky z celého kraje', oKH.zaM2, 40);
  je('u krajského odhadu se uvádí kraj', oKH.kde, 'Středočeský');
}

// --- 4) Dál než kraj se nejde ----------------------------------------
// Celostátní medián tu dřív byl jako poslední záchrana a na ostrých datech
// by z něj padalo 56 ze 73 odhadů. Medián orné půdy za celou republiku ale
// o konkrétním okrese nevypovídá nic — je to číslo, které jen vypadá jako
// odhad. Radši žádný.
const cizi = { place: 'Y', okres: 'Neznámý', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 100000 };
je('u neznámého okresu se odhad nedělá vůbec', model.odhad(cizi), null);

// --- 4b) Cena vysoko nad místní hladinou = nesrovnatelný pozemek ------
// Na ostrých datech vycházely perly jako „vyvolávací 576 000 Kč, odhad
// 8 062 Kč". Za tím bývá stavba na pozemku nebo špatně přečtená výměra.
// Dolů se naopak nic neořezává — dražby pod odhadem jsou přesně to, co
// má web ukazovat.
const sestavba = { place: 'Z', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 9000000 };   // 900 Kč/m² proti hladině 40
je('pozemek hluboko nad místní hladinou odhad nedostane', model.odhad(sestavba), null);
const levnaDrazba = { place: 'W', okres: 'Kolín', type: 'drazba', druh: 'orná půda',
  area: 10000, price: 20000 };     // 2 Kč/m², tedy 95 % pod hladinou
const oLevna = model.odhad(levnaDrazba);
pravda('hluboko POD hladinou se odhad naopak udělá (o to celé jde)',
  !!oLevna && oLevna.podOdhadem === 95, `vyšlo ${oLevna && oLevna.podOdhadem}`);

// --- 4c) Srovnává se s podobně VELKÝMI pozemky -----------------------
// Cena za m² s výměrou klesá, takže velký pozemek proti mediánu z malých
// parcel vyjde jako trhák vždycky. Na ostrých datech se takhle hlásilo
// „o 95 % pod obvyklou" u pozemku o 12 hektarech.
const MALE = pole(10, (i) => ({
  place: 'M' + i, okres: 'Cheb', type: 'sale', druh: 'orná půda',
  area: 1000, price: 100000,        // 100 Kč/m² u malých parcel
}));
const VELKE = pole(10, (i) => ({
  place: 'V' + i, okres: 'Cheb', type: 'sale', druh: 'orná půda',
  area: 100000, price: 1000000,     // 10 Kč/m² u velkých — pětkrát levněji
}));
const model4 = PK_CENY.postav([...MALE, ...VELKE], OKRES_KRAJ);
const velkaDrazba = { place: 'Velká', okres: 'Cheb', type: 'drazba', druh: 'orná půda',
  area: 100000, price: 900000 };    // 9 Kč/m², tedy jen kousek pod velkými
const oVelka = model4.odhad(velkaDrazba);
pravda('velký pozemek se srovnává s velkými', !!(oVelka && oVelka.podleVelikosti),
  `podleVelikosti=${oVelka && oVelka.podleVelikosti}`);
je('hladina je z velkých parcel, ne ze všech', oVelka && oVelka.zaM2, 10);
je('a rozdíl proti obvyklé ceně vyjde malý, ne 90 %', oVelka && oVelka.podOdhadem, 10);

// Když podobně velkých není dost, model ustoupí — ale přizná to.
const model5 = PK_CENY.postav(MALE, OKRES_KRAJ);
const oUstup = model5.odhad(velkaDrazba);
pravda('bez dost podobně velkých se ustoupí ke srovnání bez ohledu na velikost',
  !!(oUstup && oUstup.podleVelikosti === false),
  `vyšlo ${JSON.stringify(oUstup && { u: oUstup.uroven, v: oUstup.podleVelikosti })}`);

// --- 5) Nevěrohodná cena: žádný odhad, žádná „výhodná koupě" ---------
// Stavební pozemky: devět po 2 000 Kč/m² a jeden za 3 Kč/m² (podíl).
const STAVEBNI = pole(9, (i) => ({
  place: 'S' + i, okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 2000000,
}));
const PODIL = { place: 'Podíl', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 3000 };   // 3 Kč/m² proti mediánu 2 000
const model2 = PK_CENY.postav([...STAVEBNI, PODIL], OKRES_KRAJ);
pravda('podíl je rozpoznaný jako nevěrohodná cena', model2.neduveryhodna(PODIL) === true);
// Shora se schválně neoznačuje nic: poměr k místní hladině měří město,
// ne kvalitu dat. Zahrada v Klatovech vyjde 56× nad hladinou a je to běžná
// cena. Nesmyslné odhady řeší kontrola uvnitř odhadu, ne tenhle štítek.
const NAFOUKLY = { place: 'Nafouklý', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 100000000 };  // 100 000 Kč/m² proti hladině 2 000
pravda('vysoká cena sama o sobě štítek „k ověření" nedostane',
  model2.neduveryhodna(NAFOUKLY) === false,
  'označeno jako nevěrohodné — horní mez se sem nejspíš vrátila');
pravda('běžná nabídka jako nevěrohodná označená není', model2.neduveryhodna(STAVEBNI[0]) === false);
je('nevěrohodná nabídka nedostane odhad', model2.odhad(PODIL), null);
je('nevěrohodná nabídka nedostane ani percentil', model2.percentil(PODIL), null);

// --- 6) Bez výměry nebo bez ceny se nepočítá nic ---------------------
je('bez výměry žádný odhad', model.odhad({ okres: 'Kolín', type: 'sale', druh: 'orná půda', price: 100000 }), null);
je('bez ceny žádný odhad', model.odhad({ okres: 'Kolín', type: 'sale', druh: 'orná půda', area: 1000 }), null);

// --- 7) Percentil funguje na běžných datech --------------------------
const levny = { place: 'L', okres: 'Cheb', type: 'sale', druh: 'stavební pozemek', area: 1000, price: 900000 };
const model3 = PK_CENY.postav([...pole(12, (i) => ({
  place: 'P' + i, okres: 'Cheb', type: 'sale', druh: 'stavební pozemek',
  area: 1000, price: 1000000 + i * 200000,
})), levny], OKRES_KRAJ);
const pc = model3.percentil(levny);
pravda('nejlevnější nabídka je v dolní části žebříčku', !!pc && pc.cheaper >= 90,
  `levnější než ${pc && pc.cheaper} % podobných`);

// --- 7b) Podíl, o kterém VÍME, se nesmí chválit jako výhodná koupě ----
/* Spoluvlastnický podíl má cenu za m² nízkou z podstaty věci: v inzerátu
   stojí výměra CELÉ parcely, ale cena jen za zlomek. Dokud se to nedalo
   poznat, model to nemohl vědět a v komentářích u MEZ_POCHYBNA se
   poctivě píše, že rozlišit trhák od podílu z dat nejde.
   Jenže teď to u části nabídek jde — inzerát to sám říká a robot to čte
   do pole `podil`. Změřeno na ostrých datech: ze 629 nabídek označených
   jako výhodné jich 194 (31 %) mělo v popisu napsáno, že jde o podíl.
   Web je tím pádem chválil za cenu, která se s ostatními nedá srovnat —
   a na hlavní stránce je rovnou nabízel jako nejlepší příležitosti. */
{
  const PORAD = pole(14, (i) => ({
    place: 'Srov' + i, okres: 'Cheb', type: 'sale', druh: 'orná půda',
    area: 1000, price: 40000 + i * 3000,
  }));
  /* Cena schválně nízká, ale ne extrémní: kdyby byla pod hranicí
     MEZ_POCHYBNA, byla by pochybná i bez podílu a test by neměřil to,
     co má. Tady vychází zhruba 27 % pod odhadem — to je pořád sleva,
     kterou by web běžně pochválil. */
  const LEVNY = { place: 'Levný', okres: 'Cheb', type: 'sale', druh: 'orná půda',
    area: 1000, price: 41000 };
  const LEVNY_PODIL = Object.assign({}, LEVNY, { place: 'Podílový', podil: true });
  const m = PK_CENY.postav([...PORAD, LEVNY, LEVNY_PODIL], OKRES_KRAJ);

  const bezPodilu = m.percentil(LEVNY);
  pravda('levná nabídka bez podílu percentil dostane', !!bezPodilu && bezPodilu.cheaper >= 80,
    JSON.stringify(bezPodilu));
  je('ale nabídka, u které inzerát mluví o podílu, percentil nedostane',
    m.percentil(LEVNY_PODIL), null);

  const odB = m.odhad(LEVNY), odP = m.odhad(LEVNY_PODIL);
  pravda('odhad u podílu se nezahazuje — jen se za něj neručí',
    !!odP, 'odhad zmizel úplně; číslo samo o sobě je pořád užitečné');
  pravda('a je u něj vidět, že jde o podíl', !!odP && odP.podil === true, JSON.stringify(odP));
  /* `podil` je VLASTNÍ důvod, ne podtyp pochybnosti. Přimíchat ho do
     `pochybna` se zkoušelo a kontrola v test-doporuceni to právem
     shodila: pochybných by bylo 38 % nabídek, a to už není varování,
     ale šum. „Pochybná" má dál znamenat jedinou věc — tahle sleva je
     moc velká na to, aby byla pravda. */
  pravda('ale „pochybná" tím nezhoustne', !!odP && odP.pochybna === false, JSON.stringify(odP));
  pravda('tatáž nabídka bez podílu podíl nehlásí',
    !!odB && odB.podil === false && odB.pochybna === false, JSON.stringify(odB));

  /* A opačný směr: podíl se nesmí stát univerzální výmluvou. Když je
     cena běžná, žádné varování se nevymýšlí — jen se netvrdí sleva. */
  const BEZNY_PODIL = { place: 'Běžný podíl', okres: 'Cheb', type: 'sale', druh: 'orná půda',
    area: 1000, price: 55000, podil: true };
  const odBP = m.odhad(BEZNY_PODIL);
  pravda('u podílu s běžnou cenou se nehlásí žádná sleva',
    !!odBP && odBP.podOdhadem < 25, JSON.stringify(odBP));
}

// --- 8) Skloňování krajů ---------------------------------------------
// Vlastní chyba, která se objevila hned na třech místech: web psal
// „v Středočeský kraji", „v Vysočina kraji". Českému čtenáři to okamžitě
// řekne, že text psal stroj a že se na něj nedá spolehnout. Proto je na to
// jedna společná funkce — a proto se tu kontroluje každý kraj zvlášť.
const KRAJE = ['Praha', 'Středočeský', 'Jihočeský', 'Plzeňský', 'Karlovarský',
  'Ústecký', 'Liberecký', 'Královéhradecký', 'Pardubický', 'Vysočina',
  'Jihomoravský', 'Olomoucký', 'Zlínský', 'Moravskoslezský'];
je('Praha není kraj, takže „v Praze"', PK_CENY.kdeText('kraj', 'Praha'), 'v Praze');
je('Vysočina se neohýbá na „v Vysočina kraji"', PK_CENY.kdeText('kraj', 'Vysočina'), 'na Vysočině');
je('Středočeský se skloní i s předložkou', PK_CENY.kdeText('kraj', 'Středočeský'), 've Středočeském kraji');
je('Zlínský dostane „ve", ne „v"', PK_CENY.kdeText('kraj', 'Zlínský'), 've Zlínském kraji');
je('okres se píše jako „v okrese X"', PK_CENY.kdeText('okres', 'Benešov'), 'v okrese Benešov');
pravda('žádný kraj nezůstal v prvním pádě',
  KRAJE.every((k) => !new RegExp('\\b' + k + '\\b').test(PK_CENY.kdeText('kraj', k))),
  KRAJE.map((k) => PK_CENY.kdeText('kraj', k)).filter((t, i) => new RegExp('\\b' + KRAJE[i] + '\\b').test(t)).join(', '));
pravda('neznámý kraj text nerozbije (nevypíše undefined)',
  /^v kraji /.test(PK_CENY.kdeText('kraj', 'Nějaký')) && !/undefined/.test(PK_CENY.kdeText('kraj', 'Nějaký')));

// A hlavně: nikdo si ten text nesmí skládat po svém, jinak se to vrátí.
for (const f of ['../js/main.js', '../js/pozemek.js', '../js/radce.js']) {
  const t = readFileSync(new URL(f, import.meta.url), 'utf8');
  pravda(`${f.replace('../', '')} si název kraje neskládá sám`,
    !/'v(e)? ' \+|' kraji'/.test(t),
    'text se lepí ručně — přesně tak vzniklo „v Vysočina kraji"');
}

/* --- Velikost pozemku se promítá do ceny za metr --------------------
   U stavebních pozemků je metr na malé parcele výrazně dražší než na velké.
   Dokud se srovnávalo jen „podobně velkými" (třetina až trojnásobek) a
   uvnitř okna se na velikost nehledělo, byl odhad u stavebních pozemků
   nejhorší ze všech druhů. Model proto počítá, jak rychle cena za metr
   s výměrou klesá — ale jen tam, kde to data potvrzují (R² ≥ 0,15).
   Měřeno vynecháním sebe sama na 232 nabídkách: celkem 30,1 % → 27,7 %,
   stavební pozemky 49,3 % → 42,5 %, ostatní druhy beze změny. */
{
  // Data, kde cena za metr s výměrou opravdu klesá (malé draze, velké levně).
  const data = [];
  for (let i = 0; i < 40; i++) {
    const a2 = 300 + i * 100;
    const zaM2 = 300000 / Math.pow(a2, 0.6);     // jasný pokles s výměrou
    data.push({ type: 'sale', okres: 'Kolín', druh: 'stavební parcela', area: a2, price: Math.round(zaM2 * a2) });
  }
  const m = PK_CENY.postav(data, { 'Kolín': 'Středočeský' });
  const male = { type: 'sale', okres: 'Kolín', druh: 'stavební parcela', area: 400, price: 1 };
  const velke = { type: 'sale', okres: 'Kolín', druh: 'stavební parcela', area: 4000, price: 1 };
  const oM = m.odhad(Object.assign({}, male, { price: Math.round(300000 / Math.pow(400, 0.6) * 400) }));
  const oV = m.odhad(Object.assign({}, velke, { price: Math.round(300000 / Math.pow(4000, 0.6) * 4000) }));
  pravda('odhad vznikne u malé i velké parcely', !!(oM && oV));
  if (oM && oV) {
    pravda('malá parcela má vyšší cenu za metr než velká', oM.zaM2 > oV.zaM2 * 1.5,
      `malá ${Math.round(oM.zaM2)} Kč/m², velká ${Math.round(oV.zaM2)} Kč/m² — model velikost nezohlednil`);
    // A hlavně: obě musí vyjít blízko skutečnosti, ne jen být různé.
    const cilM = 300000 / Math.pow(400, 0.6), cilV = 300000 / Math.pow(4000, 0.6);
    pravda('a obě trefí skutečnou hladinu do 15 %',
      Math.abs(oM.zaM2 - cilM) / cilM < 0.15 && Math.abs(oV.zaM2 - cilV) / cilV < 0.15,
      `malá ${Math.round(oM.zaM2)} vs ${Math.round(cilM)}, velká ${Math.round(oV.zaM2)} vs ${Math.round(cilV)}`);
  }

  /* A obráceně: kde na velikosti nezáleží, model nesmí nic „opravovat".
     Orná půda má cenu za metr skoro nezávislou na výměře — kdyby se
     přepočítávalo i tam, odhad by se zhoršil (naměřeno 22,9 % → 24,7 %). */
  /* Data se SLABÝM, ale nenulovým sklonem: kdyby se přepočítávalo i tady,
     model by si vymyslel rozdíl, který v datech není. Rozptyl je schválně
     tak velký, aby sklon skoro nic nevysvětloval (R² pod mezí). */
  const pole = [];
  let sem = 7;
  const nahodne = () => { sem = (sem * 1103515245 + 12345) % 2147483648; return sem / 2147483648; };
  for (let i = 0; i < 60; i++) {
    const a2 = 5000 + i * 2000;
    const zaM2 = 45 * (0.45 + 1.6 * nahodne());   // velký rozptyl, žádný skutečný trend
    pole.push({ type: 'sale', okres: 'Kolín', druh: 'orná půda', area: a2, price: Math.round(zaM2 * a2) });
  }
  // Ověříme, že zkouška opravdu vyrobila slabý sklon — jinak nic nedokazuje.
  {
    const lx = pole.map((p) => Math.log(p.area)), ly = pole.map((p) => Math.log(p.price / p.area));
    const mx = lx.reduce((x, y) => x + y, 0) / lx.length, my = ly.reduce((x, y) => x + y, 0) / ly.length;
    let num = 0, den = 0, ss = 0, sr = 0;
    for (let i = 0; i < lx.length; i++) { num += (lx[i] - mx) * (ly[i] - my); den += (lx[i] - mx) ** 2; }
    const bb = den ? num / den : 0;
    for (let i = 0; i < lx.length; i++) { const pred = my + bb * (lx[i] - mx); sr += (ly[i] - pred) ** 2; ss += (ly[i] - my) ** 2; }
    const r2 = ss ? 1 - sr / ss : 0;
    pravda('zkouška vyrobila sklon, který data skoro nevysvětluje',
      Math.abs(bb) > 0.01 && r2 < 0.15, `sklon ${bb.toFixed(3)}, R² ${r2.toFixed(3)}`);
  }
  const mp = PK_CENY.postav(pole, { 'Kolín': 'Středočeský' });
  const maleP = mp.odhad({ type: 'sale', okres: 'Kolín', druh: 'orná půda', area: 6000, price: 270000 });
  const velkeP = mp.odhad({ type: 'sale', okres: 'Kolín', druh: 'orná půda', area: 120000, price: 5400000 });
  pravda('u slabého sklonu model velikost neřeší (jinak si vymýšlí rozdíl)',
    !!(maleP && velkeP) && Math.abs(maleP.zaM2 - velkeP.zaM2) / maleP.zaM2 < 0.05,
    maleP && velkeP ? `${Math.round(maleP.zaM2)} vs ${Math.round(velkeP.zaM2)} Kč/m² — přepočet se pustil tam, kde nemá`
                    : 'odhad nevznikl');
}

/* --- Vysvětlující blok je JEDEN, ne dva -----------------------------
   Blok „Nabídková cena / Obvyklá cena / o X % níž" byl dvakrát: v okně na
   mapě (js/main.js) a na stránce pozemku (js/pozemek.js). Rozešly se:
   na stránce se u hluboké slevy psalo varování „bývá to spoluvlastnický
   podíl, ověřte si to", kdežto v okně na mapě totéž číslo svítilo jako
   dobrá zpráva. Na ostrých datech to bylo 149 nabídek — tentýž pozemek,
   dvě různá čtení podle toho, kam člověk klepl. */
{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const detail = readFileSync(new URL('../js/pozemek.js', import.meta.url), 'utf8');
  pravda('okno na mapě nemá vlastní kopii bloku s odhadem', !/mo-rozdil/.test(main),
    'js/main.js si znovu skládá blok sám — dřív mu v něm chybělo varování');
  pravda('stránka pozemku taky ne', !/mo-rozdil/.test(detail),
    'js/pozemek.js si znovu skládá blok sám');

  // A hlavně: u pochybně hluboké slevy musí varování zaznít v obou podobách.
  /* Hladina vyjde kolem 50 Kč/m²; tahle nabídka má 5 Kč/m², tedy 90 % pod
     ní — hluboko, ale ne pod 1/50 hladiny, kde model odhad vůbec nevydá
     (to je práh „tohle už nejsou data, to je překlep"). */
  const d = { type: 'sale', okres: 'Kolín', druh: 'orná půda', area: 5000, price: 25000 };
  const data = [];
  for (let i = 0; i < 30; i++) {
    data.push({ type: 'sale', okres: 'Kolín', druh: 'orná půda', area: 5000 + i * 10, price: 250000 + i * 100 });
  }
  data.push(d);
  const m = PK_CENY.postav(data, { 'Kolín': 'Středočeský' });
  const o = m.odhad(d);
  pravda('zkouška opravdu vyrobila pochybně hlubokou slevu', !!(o && o.pochybna),
    o ? `sleva vyšla ${o.podOdhadem} %` : 'odhad vůbec nevznikl');
  const vMape = PK_CENY.blokOdhadu(m, d, { fmt: (x) => String(x) });
  const vDetailu = PK_CENY.blokOdhadu(m, d, { fmt: (x) => String(x), trida: ' pz-odhad', dlouhy: true });
  pravda('varování je v okně na mapě', /ověřte si to/.test(vMape), vMape.slice(0, 160));
  pravda('i na stránce pozemku', /ověřte si to/.test(vDetailu), vDetailu.slice(0, 160));
  pravda('a obě podoby uvádějí totéž číslo',
    (vMape.match(/o (\d+) % níž/) || [])[1] === (vDetailu.match(/o (\d+) % níž/) || [])[1]);
}

/* --- Kdy odhadu sami nevěříme --------------------------------------
 *
 * Medián z cen, které se mezi sebou liší násobky, je náhoda. Model to pozná
 * podle rozptylu srovnávacího vzorku (mezikvartil / medián) a takový odhad
 * označí jako nejistý — neskrývá ho, jen u něj netvrdí přesnou částku.
 *
 * Nejdřív na vymyšlených datech, kde je odpověď známá dopředu.
 */
{
  const jednotne = [];   // ceny skoro stejné → odhad má být jistý
  for (let i = 0; i < 20; i++) jednotne.push({ place: 'Stejnov', okres: 'Kolín', type: 'sale', druh: 'orná půda', area: 5000, price: 5000 * (48 + (i % 5)) });
  const rozhazene = [];  // ceny se liší násobky → odhad má být nejistý
  for (let i = 0; i < 20; i++) rozhazene.push({ place: 'Rozhazov', okres: 'Tábor', type: 'sale', druh: 'orná půda', area: 5000, price: 5000 * [5, 12, 30, 80, 200][i % 5] });
  const m = PK_CENY.postav([...jednotne, ...rozhazene], OKRES_KRAJ);
  /* Ceny volené tak, aby sleva vyšla kolem 40 % — tedy pod hranicí
     uvěřitelnosti (60 %). Jinak by o znění rozhodovalo „pochybná" a o
     nejistotě by test nezjistil nic. */
  const pozemekJ = { place: 'Stejnov', okres: 'Kolín', type: 'sale', druh: 'orná půda', area: 5000, price: 5000 * 30 };
  const pozemekR = { place: 'Rozhazov', okres: 'Tábor', type: 'sale', druh: 'orná půda', area: 5000, price: 5000 * 18 };
  const oJ = m.odhad(pozemekJ);
  const oR = m.odhad(pozemekR);
  pravda('model zná hranici rozptylu', typeof m.MEZ_ROZPTYL === 'number' && m.MEZ_ROZPTYL > 0, `MEZ_ROZPTYL = ${m.MEZ_ROZPTYL}`);
  pravda('u jednotných cen je odhad jistý', !!(oJ && oJ.nejisty === false), oJ ? `rozptyl ${oJ.rozptyl}` : 'bez odhadu');
  pravda('u cen rozhozených přes násobky je odhad označený jako nejistý',
    !!(oR && oR.nejisty === true), oR ? `rozptyl ${oR.rozptyl}` : 'bez odhadu');
  pravda('a rozptyl je číslo, ne nic', !!(oJ && oR && isFinite(oJ.rozptyl) && isFinite(oR.rozptyl)));

  // Vysvětlující blok nesmí u nejistého odhadu tvrdit částku.
  const fmt = (x) => String(Math.round(x));
  const blokR = PK_CENY.blokOdhadu(m, pozemekR, { fmt });
  const blokJ = PK_CENY.blokOdhadu(m, pozemekJ, { fmt });
  pravda('ani jeden z nich není „pochybný" (jinak by test měřil něco jiného)',
    !!(oJ && oR && !oJ.pochybna && !oR.pochybna), `${oJ && oJ.podOdhadem} % a ${oR && oR.podOdhadem} %`);
  pravda('u nejistého odhadu se nepíše „tedy zhruba o X Kč"', !/tedy zhruba o/.test(blokR), blokR.slice(0, 200));
  pravda('a místo toho se řekne, proč je to jen vodítko', /liší násobky/.test(blokR));
  pravda('u jistého odhadu částka zůstává', /tedy zhruba o/.test(blokJ));
}

/* Teď totéž na OSTRÝCH datech — a hlavně důkaz, že hranice něco znamená.
 * Měří se bez použití ceny měřeného pozemku: data se rozpůlí a z každé
 * půlky se postaví samostatný model. Když se dvě nezávislé půlky o témž
 * pozemku neshodnou, odhad není spolehlivý. Přesně to má „nejistý" chytat. */
{
  const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const M = PK_CENY.postav(DATA);
  const MA = PK_CENY.postav(DATA.filter((_, i) => i % 2 === 0));
  const MB = PK_CENY.postav(DATA.filter((_, i) => i % 2 === 1));
  const med = (a) => { if (!a.length) return null; const b = a.slice().sort((x, y) => x - y), n = b.length;
    return n % 2 ? b[(n - 1) / 2] : (b[n / 2 - 1] + b[n / 2]) / 2; };
  const jisty = [], nejisty = [];
  let sStitkem = 0, zNichNejistych = 0;
  for (const d of DATA) {
    const o = M.odhad(d);
    if (!o || !o.podleVelikosti) continue;
    if (o.podOdhadem >= M.MEZ_SLEVA) { sStitkem++; if (o.nejisty) zNichNejistych++; }
    const a = MA.odhad(d), b = MB.odhad(d);
    if (!a || !b) continue;
    const rozchod = Math.abs(a.zaM2 - b.zaM2) / ((a.zaM2 + b.zaM2) / 2) * 100;
    (o.nejisty ? nejisty : jisty).push(rozchod);
  }
  pravda('na ostrých datech nějaké nejisté odhady jsou', nejisty.length > 5, `jen ${nejisty.length}`);
  pravda('ale je to menšina štítků „pod odhadem"', zNichNejistych < sStitkem * 0.25,
    `${zNichNejistych} z ${sStitkem} — to už by nebylo upozornění, ale šum`);
  /* Porovnává se POŘADÍM, ne poměrem mediánů.
     Původně tu stálo rN > rJ * 2. Jenže „nejistých" je jen kolem osmdesáti
     a jejich rozchod má těžký chvost, takže medián té hrstky skákal podle
     toho, co zrovna robot přinesl. Přes dvanáct snímků dat vyšel poměr
     1,44 až 7,99 — test by tedy náhodně červenal asi každý šestý běh,
     aniž by se v modelu cokoli změnilo. A test, kterému se nedá věřit,
     škodí stejně jako test, který nemůže spadnout.

     Tahle míra je odolná: kolik procent nejistých překoná medián jistých.
     Když příznak nic neodděluje, vyjde kolem 50 %. Na týchž dvanácti
     snímcích vyšla 71 až 83 %, tedy i tehdy, kdy poměr mediánů spadl na
     1,44. Práh 62 % má odstup od náhody i od naměřeného dna. */
  const rJ = med(jisty), rN = med(nejisty);
  const nadMedianem = jisty.length && nejisty.length
    ? nejisty.filter((x) => x > rJ).length / nejisty.length * 100 : 0;
  pravda('nejisté odhady se mezi dvěma půlkami dat rozcházejí víc než jisté',
    nadMedianem >= 62,
    `nad mediánem jistých je jen ${nadMedianem.toFixed(0)} % nejistých (náhoda dává 50 %) — `
    + `příznak „nejistý" pak nic neodděluje; mediány: nejisté ${rN && rN.toFixed(0)} %, jisté ${rJ && rJ.toFixed(0)} %`);
}

/* A že se podle toho web opravdu řídí — jinak by model věděl a stránka
   tvrdila dál svoje. */
{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const radce = readFileSync(new URL('../js/radce.js', import.meta.url), 'utf8');
  /* Čte se JEN tělo funkce demand(). Když se hledalo v celém souboru,
     výraz se trefil do řazení podle slevy o pár řádků výš a kontrola
     prošla i s rozbitým skóre — přistiženo sabotáží. */
  const teloSkore = main.slice(main.indexOf('function demand(d)'), main.indexOf('var LIST_LIMIT'));
  pravda('skóre pro doporučení nejistý odhad neodměňuje',
    teloSkore.length > 100 && /!o\.nejisty/.test(teloSkore), 'v těle demand() se na nejistotu nekouká');
  pravda('★ Doporučujeme nejistý odhad nevybere', /o\.pochybna \|\| o\.nejisty/.test(main));
  pravda('filtr „pod obvyklou cenou" nejistý odhad nepustí', /!od\.nejisty/.test(main));
  /* Čte se TĚLO funkce, ne doslovný tvar podmínky. Dřív tu stál přesný
     opis zdrojového řádku — a rozbilo ho přidání další podmínky do téže
     závorky, přestože záměr („nejistý odhad se neřadí nahoru") platil
     dál. Test, který spadne po správné změně, učí člověka testy obcházet. */
  {
    const zac = main.indexOf('var slevaVal = function');
    const teloRazeni = zac >= 0 ? main.slice(zac, zac + 400) : '';
    pravda('řazení podle slevy nejistý odhad nebere',
      teloRazeni.length > 50 && /!o\.nejisty/.test(teloRazeni) && /!o\.pochybna/.test(teloRazeni)
        && /podOdhadem/.test(teloRazeni),
      'v těle slevaVal() se na nejistotu nebo pochybnost nekouká');
  }
  pravda('odznak na kartě u nejistého odhadu netvrdí slevu', /_od\.nejisty && _od\.podOdhadem >= 25/.test(main));
  pravda('rádce u nejistého odhadu nemluví o příležitosti', /o\.nejisty && o\.podOdhadem >= 25/.test(radce));
}

/* ---- Cena za metr u spoluvlastnického podílu ----------------------
 *
 * Nejnebezpečnější číslo na webu: u podílu stojí v inzerátu výměra CELÉ
 * parcely, ale cena jen za zlomek. Kdo dělí cenu celou výměrou, dostane
 * číslo, které neplatí pro nikoho — a přesně podle něj se řadilo
 * „Nejlepší cena/m²" a filtrovalo „do X Kč/m²".
 *
 * Skutečný případ z Prahy: lesní pozemek za 579 000 Kč se 7 770 m²
 * svítil jako 75 Kč/m², tedy nejlevnější z prvních pěti nabídek. Je to
 * ale podíl 1/13 — kupujícímu připadne 598 m² a platí 969 Kč/m². Ve
 * skutečnosti NEJDRAŽŠÍ z té pětice. Pořadí bylo přesně obrácené, a to
 * u čísla, kvůli kterému lidé na web chodí.
 */
{
  const les = { price: 579000, area: 7770, podil: true, zlomek: '1/13', druh: 'lesní pozemek', type: 'sale' };
  const cely = { price: 809000, area: 5394, druh: 'trvalý travní porost', type: 'sale' };
  const pul = { price: 149000, area: 1305, podil: true, zlomek: '1/2', druh: 'orná půda', type: 'sale' };
  const neznamy = { price: 100000, area: 2000, podil: true, druh: 'orná půda', type: 'sale' };

  je('podíl 1/13 se počítá z výměry, která kupci připadne',
    Math.round(PK_CENY.zaMetr(les)), 969);
  je('celý pozemek se počítá beze změny', Math.round(PK_CENY.zaMetr(cely)), 150);
  je('podíl 1/2 taky', Math.round(PK_CENY.zaMetr(pul)), 228);
  /* Raději žádné číslo než číslo, o kterém víme, že neplatí. */
  je('u podílu neznámé velikosti se cena za metr neurčuje',
    PK_CENY.zaMetr(neznamy), null);
  je('a výměra, která kupci připadne, taky ne',
    PK_CENY.vymeraVCene(neznamy), null);

  /* A hlavně: pořadí. Tohle je to, co člověk na webu uvidí. */
  pravda('podíl už se neřadí před celý pozemek, který je levnější',
    PK_CENY.zaMetr(les) > PK_CENY.zaMetr(cely),
    `podíl ${Math.round(PK_CENY.zaMetr(les))} Kč/m², celý pozemek ${Math.round(PK_CENY.zaMetr(cely))} Kč/m² — podíl je dražší, nesmí být první`);

  /* Nesmysly nesmí projít: zlomek větší než celek, nula ve jmenovateli. */
  je('zlomek větší než celek se nebere', PK_CENY.zlomekPodilu({ podil: true, zlomek: '3/2' }), null);
  je('ani nula ve jmenovateli', PK_CENY.zlomekPodilu({ podil: true, zlomek: '1/0' }), null);
  je('a u nepodílu je zlomek celý', PK_CENY.zlomekPodilu({ price: 1, area: 1 }), 1);

  /* Číslo přepočtené z podílu se nesmí tvářit jako obyčejná cena za metr —
     u něj musí být řečeno, odkud se vzalo. */
  pravda('u přepočteného čísla je vysvětlení', /podíl/i.test(PK_CENY.zaMetrPopis(les)),
    'přepočtená cena za metr se ukazuje bez vysvětlení, odkud se vzala');
  je('u celého pozemku žádné vysvětlení netřeba', PK_CENY.zaMetrPopis(cely), '');
}

/* ---- A používá to i mapa a stránka pozemku ------------------------- */
{
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const poz = readFileSync(new URL('../js/pozemek.js', import.meta.url), 'utf8');
  /* Dokud se cena za metr počítala na pěti místech ručně, stačilo opravit
     čtyři. Tohle hlídá, že se dělí celou výměrou UŽ NIKDE. */
  pravda('mapa si cenu za metr nepočítá sama', !/d\.price \/ d\.area/.test(main),
    'v js/main.js se zase někde dělí cena celou výměrou — u podílu to dá číslo, které neplatí');
  pravda('ani stránka pozemku', !/d\.price \/ d\.area/.test(poz),
    'v js/pozemek.js se zase někde dělí cena celou výměrou');
  pravda('obě berou výpočet z cenového modelu',
    /PK_CENY[\s\S]{0,40}zaMetr/.test(main) && /PK_CENY[\s\S]{0,40}zaMetr/.test(poz));
}

/* ---- Kde se mluví o SLEVĚ, musí se koukat na podíl ---------------
 *
 * Cenový model podíl nezahazuje: odhad vydá a označí ho příznakem
 * `podil` — a u sebe má napsáno, že „tam, kde se o slevě mluví, se na
 * něj musí koukat". Jenže koukalo se jen na kartách u štítku
 * „−X % proti okolí". Čtyři další místa ne:
 *   • filtr „Pod obvyklou cenou" (a totéž slovo ve větě),
 *   • řazení podle slevy,
 *   • body za slevu ve skóre doporučení,
 *   • titulek „NEJVÝHODNĚJŠÍ DNES" na úvodní stránce.
 *
 * Změřeno na ostrých datech: ve filtru „pod obvyklou cenou" bylo 127
 * podílů ze 437 (29 %) a body za slevu dostávalo 110 podílů z 280
 * (39 %) — web je tedy sám doporučoval nahoru. Sleva u podílu přitom
 * vzniká tím, že se cena za zlomek poměřuje výměrou CELÉ parcely.
 */
{
  /* 1) Model dál dělá, co má: odhad u podílu vydá a označí ho. Kdyby ho
     zahodil, tenhle oddíl by „prošel" úplně bez zásluhy — proto se to
     kontroluje dřív než cokoli dalšího. */
  const BEZNE = pole(12, (i) => ({
    place: 'B' + i, okres: 'Kolín', type: 'sale', druh: 'orná půda',
    area: 10000, price: 500000,           // 50 Kč/m²
  }));
  const POLOVINA = { place: 'Podíl', okres: 'Kolín', type: 'sale', druh: 'orná půda',
    area: 10000, podil: true, zlomek: '1/2', price: 300000 };   // 30 Kč/m² z celé výměry
  const m = PK_CENY.postav([...BEZNE, POLOVINA], OKRES_KRAJ);
  const oP = m.odhad(POLOVINA);
  pravda('model u podílu odhad pořád vydá', !!oP, 'odhad zmizel — pak tenhle oddíl nic neměří');
  pravda('a označí ho příznakem podil', !!oP && oP.podil === true, JSON.stringify(oP));
  pravda('a je to sleva, které by si web jinak všiml', !!oP && oP.podOdhadem >= 15,
    `podOdhadem ${oP && oP.podOdhadem} % — zkušební podíl je moc drahý, test by nic neměřil`);

  /* 2) A teď na SKUTEČNÝCH datech, přes týž výpočet, jaký má web. */
  const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
  const M = PK_CENY.postav(DATA);
  const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
  const radce = readFileSync(new URL('../js/radce.js', import.meta.url), 'utf8');

  const podily = DATA.filter((x) => x.podil);
  pravda(`v datech je dost podílů, aby to něco znamenalo (${podily.length})`, podily.length >= 50);

  const podObvyklou = (d) => {
    const o = M.odhad(d);
    return !!(o && o.podleVelikosti && !o.nejisty && !o.podil && o.podOdhadem >= 15);
  };
  je('žádný podíl není „pod obvyklou cenou"', podily.filter(podObvyklou).length, 0);

  /* 3) Ale hlavně: chová se tak OPRAVDU web? Výpočet výš je jen opis.
     Kdyby se v js/main.js na příznak nekoukalo, tenhle oddíl by prošel
     a nezměnilo by se nic. Proto se čte zdroj: každé místo, které mluví
     o `podOdhadem`, musí v téže podmínce řešit i podíl. Tohle je ta
     kontrola, která chytí i PÁTÉ takové místo, až vznikne. */
  /* POZNÁMKY SE MUSÍ ODSTRANIT. Jinak hlídač uklidní vlastní komentář:
     nad podObvyklou() je odstavec vysvětlující, proč se na podíl kouká —
     a slovo „podil" v něm stačilo na to, aby kontrola prošla i s úplně
     odstraněnou podmínkou. Přistiženo sabotáží; bez tohohle kroku by
     hlídač chytil tři místa ze čtyř a to čtvrté zamlčel. */
  /* Skenují se OBA soubory, které o slevě mluví. Páté takové místo se
     našlo právě v rádci (js/radce.js): u podílu říkal zeleně „může to
     být příležitost" — 66 nabídek ze 186 (35 %). */
  const zdrojeSlevy = { 'js/main.js': main, 'js/radce.js': radce };
  const bezPoznamek = main
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' ');
  const ocisti = (t) => t
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' ');
  const hrisnici = [];
  let rozhodnuti = 0;
  Object.keys(zdrojeSlevy).forEach((jmeno) => {
    /* Okno se počítá jen přes ŘÁDKY KÓDU. Poznámky se sice vymažou, ale
       pořád zabírají řádky — a dlouhý komentář nad větví pro podíl tak
       okno „snědl" a hlídač hlásil místo, které je podílem odbavené
       o kousek výš. Čísla řádků zůstávají původní, ať se dá nález najít. */
    const kod = ocisti(zdrojeSlevy[jmeno]).split('\n')
      .map((r, i) => ({ t: r.trim(), c: i + 1 }))
      .filter((x) => x.t !== '');
    const radky = kod.map((x) => x.t);
    kod.forEach((zaznam, i) => {
      const r = zaznam.t;
      const t = r;
    /* Hlídá se jen místo, kde se podle slevy ROZHODUJE — tedy porovnání
       (`podOdhadem >= 25`) nebo dosazení jako hodnoty k řazení
       (`podOdhadem || 0`). Vypsání čísla do textu odznaku uvnitř už
       ohlídané podmínky sem nepatří; ověřeno, že jinak hlásí tři místa,
       která podíl řeší o pár řádků výš. */
      if (!/podOdhadem\s*(?:[<>]=?|===?|\|\|)/.test(t)) return;
      rozhodnuti++;
      /* Okno čtrnácti řádků zpět. Podmínky i celé větve, které podíl
         odbaví dřív (a tím ho z dalších větví vyloučí), bývají delší než
         pár řádků; při osmi hlásil hlídač i místo, které je za osmnáct
         řádků dlouhou větví pro podíl. */
      /* Hledá se od začátku OBKLOPUJÍCÍ FUNKCE, ne v okně pevné délky.
         Větev pro podíl často končí `return`, takže všechno za ní je už
         podílu prosté — a to se počtem řádků vyjádřit nedá. Okno se
         zkoušelo (osm i čtrnáct řádků) a pokaždé hlásilo místo, které je
         odbavené o kousek výš. Je to volnější síto: stačí, že se funkce
         o podíl někde stará. Že se stará SPRÁVNĚ, hlídají kontroly na
         skutečných datech výš. */
      let zacFn = 0;
      /* Jen POJMENOVANÁ deklarace na začátku řádku. Na `var cis = function`
         uvnitř větve se scan zastavoval a ukazoval pak na kus vlastního
         těla — hlásil tedy místo, které je o osm řádků výš odbavené. */
      for (let j = i; j >= 0; j--) if (/^function\s+\w+\s*\(/.test(radky[j])) { zacFn = j; break; }
      const telo = radky.slice(zacFn, i + 2).join(' ');
      if (!/\bpodil\b/.test(telo)) hrisnici.push(`${jmeno}:${zaznam.c}: ${t.slice(0, 90)}`);
    });
  });
  pravda('hlídá se aspoň pár míst (jinak by vzorek nic nenašel)', rozhodnuti >= 5,
    `nalezeno jen ${rozhodnuti} rozhodnutí podle slevy`);
  je('každé místo, které rozhoduje podle slevy, řeší i podíl', hrisnici, []);
}

console.log('\nCenový model — odhad obvyklé ceny a věrohodnost');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Cenový model: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
