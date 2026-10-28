/* Jedna sada ikon pro celý web — tvary na jednom místě.
   ==================================================================
   Čte to scripts/sjednot-ikony.mjs, které z téhle tabulky vyrobí
   sprite (<symbol>) do každé stránky. Nikde jinde se tvar ikony psát
   nemá; hlídá to scripts/test-ikony.mjs.

   PROČ TO VZNIKLO. Před touhle tabulkou měl web 105 ikon ve 79 různých
   tvarech, roztroušených po dvaceti souborech. Táž věc se kreslila
   několikrát a pokaždé jinak: čtyři různé lupy, dvě různé záložky, dvě
   mapy, dva zvonky, dvě fajfky v kolečku. A naopak jeden tvar nesl dvě
   různé věci — blesk znamenal „elektřina na pozemku" a současně
   „příležitost". Většina tvarů byla navíc převzatá z cizí sady
   (Feather/Lucide), takže web neměl vlastní ruku.

   PERO. Jedny rozměry pro všechno:
     – plátno 24×24, kresba v ploše 3,5 až 20,5 (okraj 3,5);
     – jen tahy, žádné výplně. Barvu, tloušťku i zakončení řídí CSS,
       proto tady NESMÍ být atributy stroke, fill ani stroke-width:
       atribut by přebil to, co CSS nastaví podle velikosti ikony;
     – tloušťka se v CSS dopočítává k velikosti (36/šířka), aby stopa
       na obrazovce vyšla vždy na 1,5 px — hlídá to test-ikony;
     – obdélníky mají rx 2,5, souřadnice padají na půlky jednotek.

   RUKA. Dvě věci, které drží sadu pohromadě a jinde je nenajdete:
     1. OBZOR. Co stojí na zemi — dům, plot, příjezd, strom, sloup —
        stojí na téže lince y=20 od x=3,5 do x=20,5. Ikony pozemku tím
        dostanou společnou patu a vedle sebe vypadají jako jedna věta.
     2. KOSTKA. Místo kolečka uprostřed špendlíku, zaměřovače a mapy
        je otočený čtverec — hraniční kámen. Je to značka pozemku a
        drží se i v 16 px, kde se kolečko slije do tečky.
   ================================================================== */

/* Obzor: společná pata ikon, co stojí na zemi. */
const OBZOR = 'M3.5 20h17';
/* Hraniční kámen: značka pozemku uvnitř špendlíku, zaměřovače, mapy. */
const KOSTKA = (x, y, r) =>
  `M${x} ${y - r} ${x + r} ${y} ${x} ${y + r} ${x - r} ${y}z`;
/* Rohové značky zaměřené plochy — čtyři L v rozích plátna. */
const ROHY = 'M3.5 8.5v-5h5M20.5 8.5v-5h-5M3.5 15.5v5h5M20.5 15.5v5h-5';

export const IKONY = {
  /* ---------- místo a mapa ---------- */
  spendlik: `M12 20.5c4.3-5.1 6.5-8.7 6.5-11A6.5 6.5 0 0 0 5.5 9.5c0 2.3 2.2 5.9 6.5 11z${KOSTKA(12, 9.5, 2.9)}`,
  mapa: 'M9 4 3.5 6.2v13.3L9 17.3l6 2.2 5.5-2.2V6.2L15 8.4z' +
    `M9 4v13.3M15 8.4v11.1${KOSTKA(12, 11.5, 2)}`,
  zamerit: `M12 4.5v3M12 16.5v3M4.5 12h3M16.5 12h3M12 6.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11z${KOSTKA(12, 12, 2.6)}`,
  okoli: `M12 16.5c2.7-3.3 4-5.6 4-7a4 4 0 0 0-8 0c0 1.4 1.3 3.7 4 7z${KOSTKA(12, 9.5, 1.6)}` +
    'M5.6 15.5a8 8 0 0 1 0-11.3M18.4 4.2a8 8 0 0 1 0 11.3M8.5 20.5h7',
  vrstvy: 'M12 3.5 3.5 8 12 12.5 20.5 8zM3.5 12.5 12 17l8.5-4.5M3.5 17 12 21.5l8.5-4.5',
  kresli: `M4 20 7.5 6.5 17 9.5 14 20z${KOSTKA(7.5, 6.5, 1.8)}${KOSTKA(17, 9.5, 1.8)}`,

  /* ---------- pozemek ---------- */
  vymera: `${ROHY}M8.5 8.5h7v7h-7z`,
  druh: `M12 3.5 6.5 13h4l-3.5 5.5h10L13.5 13h4zM12 16.5V20${OBZOR}`,
  podil: 'M12 3.5a8.5 8.5 0 1 0 8.5 8.5h-8.5z M12 3.5v8.5h8.5A8.5 8.5 0 0 0 12 3.5z',
  cena: 'M20 13.9 13.9 20a2.2 2.2 0 0 1-3.1 0L4 13.2V4h9.2l6.8 6.8a2.2 2.2 0 0 1 0 3.1z' +
    'M8 8h.01',
  kalendar: 'M4 6.5h16v14H4zM8.5 3.5v5M15.5 3.5v5M4 11.5h16',
  hodiny: 'M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17zM12 7.5V12l3 2',
  dum: `M4 11.5 12 4l8 7.5M6 10v10h12V10M10 20v-6h4v6${OBZOR}`,
  dum_plus: [`M4 11.5 12 4l8 7.5M6 10v10h12V10${OBZOR}`, 'M12 13.5v4M10 15.5h4'],
  budova: `M7 20V4h10v16M10.5 7.5h3M10.5 11h3M10.5 14.5h3${OBZOR}`,

  /* ---------- co pozemek má ---------- */
  elektrina: `M12.5 3.5 7 12h4l-1 8.5 7-10h-4l1.5-7z`,
  voda: 'M12 3.5c3.6 3.9 5.5 7 5.5 9.3a5.5 5.5 0 0 1-11 0c0-2.3 1.9-5.4 5.5-9.3z' +
    'M9.5 13.5a2.5 2.5 0 0 0 2.5 2.5',
  kanalizace: 'M12 4.5a7.5 7.5 0 1 0 0 15 7.5 7.5 0 0 0 0-15z' +
    'M8.8 10h6.4M8.8 14h6.4',
  plyn: 'M12 3.5c2.8 2.9 4.5 5.7 4.5 8.4a4.5 4.5 0 0 1-9 0c0-1 .4-2 1-2.9.5 1.9 1.9 2 1.9 2 0-2 .6-5 1.6-7.5z',
  oploceni: `M5 20V9.5l2-2.5 2 2.5V20M15 20V9.5l2-2.5 2 2.5V20M3.5 12.5h17M3.5 16h17${OBZOR}`,
  prijezd: `M9 20 11 4M15 20 13 4M12 7.5v1.5M12 12v1.5M12 16.5V18${OBZOR}`,

  /* ---------- činy ---------- */
  zalozka: 'M6.5 3.5h11v17l-5.5-3.5-5.5 3.5z',
  poznamka: 'M12.5 20.5h8M16.8 4.2a2.2 2.2 0 0 1 3 3L7.5 19.5l-4 1 1-4z',
  sdilet: 'M17.5 3.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM6.5 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM17.5 15.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM9 10.7l6-2.9M9 13.3l6 2.9',
  kopirovat: 'M9.5 9.5h10v10h-10zM5.5 14.5h-1V4.5h10v1',
  navigovat: 'M12 3.5 19.5 20.5 12 16.5 4.5 20.5z',
  poslat: 'M20.5 3.5 3.5 10.5l7 2.5 2.5 7z M20.5 3.5 10.5 13',
  stahnout: 'M12 4v11M8 11.5l4 4 4-4M4.5 19.5h15',
  plus: 'M12 5v14M5 12h14',
  zavrit: 'M6.5 6.5 17.5 17.5M17.5 6.5 6.5 17.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  sipka_vlevo: 'M14.5 5.5 8 12l6.5 6.5',
  sipka_vpravo: 'M9.5 5.5 16 12l-6.5 6.5',
  sipka_dolu: 'M5.5 9.5 12 16l6.5-6.5',
  nahoru: 'M12 19.5V5M6 11l6-6 6 6',
  fotky: 'M3.5 4.5h17v15h-17zM8 9.5h.01M20.5 15.5 15 10 6.5 18.5',
  karty: 'M8 3.5h10.5a2 2 0 0 1 2 2V16M3.5 7.5h13v13h-13z',
  filtr: 'M4 7h16M7 12h10M10 17h4',
  seznam: 'M8.5 6.5h12M8.5 12h12M8.5 17.5h12M4 6.5h.01M4 12h.01M4 17.5h.01',
  pozadavky: 'M3.5 8 5.5 10 9 6.5M3.5 16.5l2 2 3.5-3.5M12.5 8h8M12.5 17h8',
  razeni: 'M6 4.5v15M3 16l3 3.5 3-3.5M12 6.5h8.5M12 12h6M12 17.5h3.5',
  lupa: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.8 15.8 20 20',
  lupa_plus: 'M11 4.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13zM15.8 15.8 20 20M11 8.2v5.6M8.2 11h5.6',
  cela_obrazovka: 'M3.5 9V3.5H9M20.5 9V3.5H15M3.5 15v5.5H9M20.5 15v5.5H15' +
    'M3.5 3.5 9 9M20.5 3.5 15 9M3.5 20.5 9 15M20.5 20.5 15 15',
  zmensit: 'M9 3.5V9H3.5M15 3.5V9h5.5M9 20.5V15H3.5M15 20.5V15h5.5',

  /* ---------- stavy a hlášky ---------- */
  hotovo: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  hotovo_kolecko: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M8 12.2l2.8 2.8L16 9.5'],
  info: ['M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17z', 'M12 11v5.5M12 7.8h.01'],
  vystraha: 'M12 3.5 3.5 20.5h17zM12 9.5V14M12 17.3h.01',
  zvonek: 'M6.5 10a5.5 5.5 0 0 1 11 0c0 4.5 2 6.5 2 6.5H4.5s2-2 2-6.5zM10.2 19.5a2 2 0 0 0 3.6 0',
  stit: `M12 3.5 5.5 6v6c0 4 2.8 6.6 6.5 8.5 3.7-1.9 6.5-4.5 6.5-8.5V6z M9.3 11.8l2.2 2.2 3.5-3.5`,
  sance: `M12 3.5 14 9.5l6 2-6 2-2 6-2-6-6-2 6-2z`,
  kladivko: 'M14.5 11 6 19.5a2.1 2.1 0 0 1-3-3L11.5 8M17.2 14.3 21.5 10M20.5 11.2 13 3.7M9 7.5l7.5 7.5',

  /* ---------- účet a zprávy ---------- */
  obalka: 'M3.5 5.5h17v13h-17zM3.5 7.5 12 13.5l8.5-6',
  obalka_hotovo: ['M3.5 5.5h17v13h-17zM3.5 7.5 12 13.5l8.5-6', 'M8.5 13.5l2.5 2.5 4.5-4.5'],
  zamek: 'M5 10.5h14v10H5zM8.5 10.5V7.5a3.5 3.5 0 0 1 7 0v3',
  oko: 'M2.5 12c2.5-4 5.7-6 9.5-6s7 2 9.5 6c-2.5 4-5.7 6-9.5 6s-7-2-9.5-6zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  oko_skrt: 'M4 5 20 19M9.4 9.6A3 3 0 0 0 12 15c.8 0 1.6-.3 2.1-.8M6 7.3C4.5 8.4 3.3 10 2.5 12c2.5 4 5.7 6 9.5 6 1.5 0 2.9-.3 4.2-.9M10 6.2A9.9 9.9 0 0 1 12 6c3.8 0 7 2 9.5 6-.7 1.1-1.4 2.1-2.3 2.9',
  uzivatel: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 20.5a8 8 0 0 1 16 0',
  odhlasit: 'M9.5 20.5H5a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 5 3.5h4.5M15.5 7.5 20 12l-4.5 4.5M20 12H9',
  bublina: 'M20.5 15.5a2 2 0 0 1-2 2H7.5l-4 3.5V5.5a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2z',
};

/* Jména, na která se v kódu odkazuje přes href="#i-…" — s pomlčkou,
   protože v CSS i v HTML se tak jmenuje všechno ostatní. */
export const idIkony = (jm) => 'i-' + jm.replace(/_/g, '-');

/* PERO NENÍ NA SYMBOLU. První pokus ho tam dal jako atributy — a tím
   by byla soustava „stopa všude 1,5 px" mrtvá: stylopis počítá tloušťku
   k velikosti ikony (36/šířka), jenže na obsah symbolu žádný selektor
   nedosáhne, takže atribut uvnitř by vyhrál nad VŠÍM. Naměřeno: čára
   z CSS široká 6 jednotek se se stroke-width="2" na symbolu nakreslila
   na třetinu.

   Pero proto drží stylopis, na třídě .ik u vnějšího <svg> — odtud se
   dědí dovnitř symbolu a každé podrobnější pravidlo ho přebije. */

/* Některá ikona má druhou cestu — DETAIL (fajfka v kolečku, „i" v kruhu,
   plus u domu). Nese třídu ik-duraz, aby ji stylopis mohl na vybraných
   místech obarvit zvlášť; ve výchozím stavu kreslí stejnou barvou jako
   zbytek ikony, takže se nikde nic nerozsvítí samo od sebe. */
/* Pozadí v CSS (background-image) se na sprite odkázat nedá — musí mít
   kresbu v sobě. Tenhle zápis ji vyrobí z TÉŽE tabulky, takže ani ikony
   v nabídce se od zbytku sady nemůžou rozejít. Barvu je nutné dát
   napevno: v data-URI žádné currentColor není. */
export function dataUri(jm, barva) {
  const c = [].concat(IKONY[jm]);
  const telo = c.map((d) => `<path d='${d}'/>`).join('');
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none'` +
    ` stroke='${barva}' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>${telo}</svg>`;
  return 'url("data:image/svg+xml,' + svg.replace(/[<>#"]/g, (z) =>
    ({ '<': '%3C', '>': '%3E', '#': '%23', '"': "'" }[z])) + '")';
}

/* Sprite jen z toho, co si stránka opravdu zavolá. Celá sada váží
   2,5 kB po gzipu; okresní stránka z ní použije tři ikony, takže celá
   sada by jí přidala 28 % váhy za nic (naměřeno: 8,8 → 11,2 kB).
   Které to jsou, počítá scripts/sjednot-ikony.mjs. */
export function sprite(jmena) {
  const vyber = jmena ? Object.keys(IKONY).filter((j) => jmena.has(idIkony(j))) : Object.keys(IKONY);
  if (jmena && !vyber.length) return '';
  const kusy = vyber.map((jm) => {
    const c = [].concat(IKONY[jm]);
    const telo = `<path d="${c[0]}"/>` +
      (c[1] ? `<path class="ik-duraz" d="${c[1]}"/>` : '');
    return `<symbol id="${idIkony(jm)}" viewBox="0 0 24 24">${telo}</symbol>`;
  });
  return '<svg class="ik-sada" width="0" height="0" aria-hidden="true" focusable="false">' +
    kusy.join('') + '</svg>';
}
