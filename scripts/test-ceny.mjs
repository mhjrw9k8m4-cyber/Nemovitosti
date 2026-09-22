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

console.log('\nCenový model — odhad obvyklé ceny a věrohodnost');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Cenový model: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
