/* ZNAČKOVÁ STUPNICE — GENERÁTOR.
 * ====================================================================
 * Spuštění: node scripts/paletka.mjs [odstín] [sytost700]
 *   např.   node scripts/paletka.mjs 163 0.080
 *
 * PROČ TENHLE SOUBOR EXISTUJE. Stupnice v css/styles.css je tabulka
 * deseti hexů a ta se nedá „trochu poopravit" od oka: když se změní
 * odstín nebo sytost, musí se přepočítat všechny kroky najednou,
 * jinak se rodina rozejde — a přesně tomu se celá stupnice staví do
 * cesty. Tady je ten výpočet jednou a pořádně, takže další úprava
 * barvy je jeden příkaz, ne deset ručních odhadů.
 *
 * Co se drží (viz komentář u --znacka ve stylopisu):
 *  · JEDEN ODSTÍN pro všechny kroky;
 *  · ŽEBŘÍK SVĚTLOSTI v OKLabu, nahoře ztěsněný, protože z kroků 600
 *    a 700 se píše text a tam velí kontrast, ne estetika;
 *  · SYTOST PO KŘIVCE — na krajích nízká (u bílé a černé vypadá
 *    vysoká sytost uměle), uprostřed nejvyšší;
 *  · ŽÁDNÝ KROK MIMO GAMUT sRGB; když by krok vyšel mimo, řekne to.
 *
 * Výstup je rovnou ta tabulka, jaká patří do stylopisu, a k ní
 * kontrast bílého textu na každém kroku.
 */
const ODSTIN = Number(process.argv[2] || 163);
const SYTOST_700 = Number(process.argv[3] || 0.080);

/* Žebřík: [jméno kroku, světlost, poměr sytosti ke kroku 700]. */
const ZEBRIK = [
  [50, 0.970, 0.18], [100, 0.935, 0.38], [200, 0.875, 0.65], [300, 0.790, 0.94],
  [400, 0.685, 1.15], [500, 0.590, 1.22], [600, 0.490, 1.12], [700, 0.420, 1.00],
  [800, 0.355, 0.82], [900, 0.290, 0.62],
];

const naLin = (x) => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const zLin = (x) => (x <= 0.0031308 ? 12.92 * x : 1.055 * Math.pow(x, 1 / 2.4) - 0.055);

function oklchNaSrgb(L, C, H) {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.2914855480 * b, 3);
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  const mimo = [r, g, bb].some((v) => v < -0.0005 || v > 1.0005);
  const hex = [r, g, bb]
    .map((v) => Math.max(0, Math.min(255, Math.round(zLin(Math.max(0, Math.min(1, v))) * 255))))
    .map((v) => v.toString(16).toUpperCase().padStart(2, '0'))
    .join('');
  return { hex: '#' + hex, mimo };
}
function jas(hex) {
  const n = hex.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => naLin(parseInt(n.slice(i, i + 2), 16) / 255));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const kontrastSBilou = (hex) => (1.05 / (jas(hex) + 0.05));

console.log(`\nZnačková stupnice — odstín ${ODSTIN}°, sytost kroku 700 = ${SYTOST_700}\n`);
let mimoGamut = 0;
for (const [krok, L, pomer] of ZEBRIK) {
  const C = +(SYTOST_700 * pomer).toFixed(4);
  const { hex, mimo } = oklchNaSrgb(L, C, ODSTIN);
  if (mimo) mimoGamut++;
  const k = kontrastSBilou(hex);
  console.log(`  z-${String(krok).padEnd(3)} ${hex}  L ${L.toFixed(3)}  C ${C.toFixed(3)}`
    + `  bílý text ${k.toFixed(2)} : 1${k < 4.5 ? '  (pod normou — jen plocha, ne text)' : ''}`
    + (mimo ? '  ← MIMO GAMUT sRGB' : ''));
}
console.log(mimoGamut
  ? `\n  POZOR: ${mimoGamut} kroků je mimo gamut sRGB — snižte sytost.\n`
  : '\n  Všechny kroky jsou uvnitř gamutu sRGB.\n');
