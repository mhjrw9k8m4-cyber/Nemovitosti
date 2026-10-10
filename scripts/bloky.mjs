/* SOUSEDÍCÍ NABÍDKY — „tady se neprodává jedna parcela, ale celý blok".
 * ====================================================================
 * Kdo kupuje půdu, nekupuje tvar parcely, ale výměru na jednom místě.
 * Pět hektarů v jednom kuse je něco úplně jiného než pět hektarů
 * roztroušených po okrese — a z výpisu nabídek se to nepozná, protože
 * každá parcela je v něm samostatná řádka.
 *
 * Web o okolí dosud říkal tři věci: vzdálenost do města, „v obci je
 * v nabídce ještě N pozemků" a srovnatelné pozemky (ty jsou ale o CENĚ,
 * a berou se z celého okresu). Ani jedna neodpoví na otázku „dá se tu
 * koupit víc pozemků najednou, a kolik by toho bylo".
 *
 * JAK SE SHLUK POZNÁ. Spojují se nabídky, které jsou od sebe do
 * MEZ_METRU vzdušnou čarou, a to tranzitivně: A—B a B—C dá jeden shluk
 * A—B—C, i když A a C jsou dál. Tak se chová i pás pozemků podél cesty,
 * což je přesně ten případ, o který jde.
 *
 * ČÍM SE NEPLÝTVÁ. Shluk pod TŘI nabídky se nehlásí: „vedle je ještě
 * jeden pozemek" je informace, kterou už nese věta o obci, a na stránku
 * by přidala třetí odstavec o témže. Změřeno na 1 943 nabídkách
 * (bez duplicit, se souřadnicemi): do 300 m je 47 shluků o třech
 * a více nabídkách a leží v nich 187 nabídek, tedy desetina webu.
 *
 * CO SE NETVRDÍ. Že parcely spolu SOUSEDÍ — na to by byly potřeba
 * hranice z katastru, a ty web nemá. Tvrdí se jen vzdálenost, a tak je
 * to i napsané: „do 300 metrů", ne „vedle sebe". Taky se netvrdí, že
 * se dají koupit najednou: prodejců může být víc a každý svůj.
 * ==================================================================== */

/** Do kolika metrů se nabídky počítají k sobě. */
export const MEZ_METRU = 300;
/** Od kolika nabídek (včetně té prohlížené) se o shluku mluví. */
export const NEJMENE = 3;

const R_ZEME = 6371000;
const rad = (x) => x * Math.PI / 180;

/** Vzdušná čára v metrech. Týž haversine jako js/okruh.js, jen v metrech. */
export function metry(a, b) {
  const dla = rad(b.lat - a.lat), dlo = rad(b.lng - a.lng);
  const x = Math.sin(dla / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlo / 2) ** 2;
  return 2 * R_ZEME * Math.asin(Math.sqrt(Math.min(1, x)));
}

const maSouradnice = (o) => o && typeof o.lat === 'number' && typeof o.lng === 'number'
  && isFinite(o.lat) && isFinite(o.lng) && (o.lat !== 0 || o.lng !== 0);

/** Souvislé shluky. Vrací pole polí; každé je jeden shluk (i jednoprvkový). */
export function shluky(nabidky, mez = MEZ_METRU) {
  const s = (nabidky || []).filter(maSouradnice);
  /* Přihrádky po 0,005° (asi 550 m na šířku), hledá se v devíti
     sousedních — jinak by to bylo n² a n je dva tisíce. */
  const P = 0.005;
  const prihradky = new Map();
  s.forEach((o, i) => {
    const k = Math.floor(o.lat / P) + '|' + Math.floor(o.lng / P);
    if (!prihradky.has(k)) prihradky.set(k, []);
    prihradky.get(k).push(i);
  });
  const rodic = s.map((_, i) => i);
  const najdi = (i) => { while (rodic[i] !== i) { rodic[i] = rodic[rodic[i]]; i = rodic[i]; } return i; };
  for (let i = 0; i < s.length; i++) {
    const o = s[i];
    const a = Math.floor(o.lat / P), b = Math.floor(o.lng / P);
    for (let da = -1; da <= 1; da++) for (let db = -1; db <= 1; db++) {
      for (const j of (prihradky.get((a + da) + '|' + (b + db)) || [])) {
        if (j <= i) continue;
        if (metry(o, s[j]) > mez) continue;
        const x = najdi(i), y = najdi(j);
        if (x !== y) rodic[x] = y;
      }
    }
  }
  const podle = new Map();
  for (let i = 0; i < s.length; i++) {
    const k = najdi(i);
    if (!podle.has(k)) podle.set(k, []);
    podle.get(k).push(s[i]);
  }
  return [...podle.values()];
}

/* KLÍČ MÍSTO TOTOŽNOSTI OBJEKTU. Generátor stránek čte data z disku
   znovu u každé stránky, takže `Map` klíčovaná objektem by nenašla nic —
   a mlčky: `get()` vrátí undefined a blok se prostě nikde neukáže.
   (Přesně to se při psaní stalo: 1 943 stránek, 0 bloků.) Klíč je proto
   řetězec ze všeho, čím se nabídka od jiné liší. */
export function klic(o) {
  return [o.type || '', o.okres || '', o.place || '', o.parcel || '',
    o.area || 0, o.price || 0, o.lat, o.lng].join('|');
}

/** Mapa klíč nabídky → ostatní nabídky v jejím shluku (shluky od NEJMENE). */
export function sousedi(nabidky, mez = MEZ_METRU, nejmene = NEJMENE) {
  const m = new Map();
  for (const g of shluky(nabidky, mez)) {
    if (g.length < nejmene) continue;
    for (const o of g) m.set(klic(o), g.filter((x) => x !== o));
  }
  return m;
}

/** Souhrn shluku k jedné nabídce, nebo null. Čísla, ne věty. */
export function souhrn(o, ostatni) {
  if (!ostatni || ostatni.length < NEJMENE - 1) return null;
  const vse = [o].concat(ostatni);
  const vymera = vse.reduce((s, x) => s + (x.area > 0 ? x.area : 0), 0);
  /* Cena se sčítá, jen když ji má KAŽDÁ nabídka ve shluku. Součet, ve
     kterém jedna položka chybí, by vypadal jako celková cena bloku —
     a byl by nižší, než jaká ve skutečnosti je. Radši žádné číslo. */
  const vsechnyMajiCenu = vse.every((x) => x.price > 0);
  /* Spoluvlastnický podíl se do výměry bloku počítat nesmí: v inzerátu
     je výměra celé parcely, ale kupuje se zlomek. Hlásí se proto zvlášť,
     ať si čtenář ten součet umí opravit. */
  const podilu = vse.filter((x) => x.podil).length;
  return {
    pocet: vse.length,
    vymera,
    cena: vsechnyMajiCenu ? vse.reduce((s, x) => s + x.price, 0) : null,
    podilu,
    mez: MEZ_METRU,
    lat: vse.reduce((s, x) => s + x.lat, 0) / vse.length,
    lng: vse.reduce((s, x) => s + x.lng, 0) / vse.length,
  };
}
