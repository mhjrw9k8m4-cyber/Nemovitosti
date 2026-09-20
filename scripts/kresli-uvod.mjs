// Kresba úvodní plochy — letecký pohled na pole rozdělená na parcely.
//
// Spuštění: node scripts/kresli-uvod.mjs   (přepíše img/uvod-parcely.svg)
//
// Proč kresba a ne fotka: fotka z fotobanky by se musela odněkud stáhnout,
// řešila by se licence a vážila by stovky kilobajtů. Tohle je vektor —
// po zabalení asi 8 kB, nezrní ani na velkém displeji a ukazuje přesně to,
// co web prodává. Kreslí se z mřížky, jejíž body se rozhýbou, takže z ní
// vzniknou nepravidelné čtyřúhelníky jako na katastrální mapě.
//
// Číslo v „seed" je schválně pevné: stejné číslo = stejný obrázek. Bez toho
// by se úvodní plocha při každém spuštění proměnila.
import { writeFileSync } from 'node:fs';
let seed = 20240917;
const nah = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };

const W = 1600, H = 760, SL = 17, RD = 10;
const barvy = ['#D8CDAB','#C9BE97','#B7C495','#A4B584','#D2B78C','#BC9A72','#A08862','#E2D8BC','#8FA477','#CDC0A0','#B3A886','#C6D0A6','#9DAF86','#DCC9A6'];

// mřížka bodů s rozhýbáním
const bod = [];
for (let r = 0; r <= RD; r++) {
  bod[r] = [];
  for (let c = 0; c <= SL; c++) {
    const x = (c / SL) * (W * 1.25) - W * 0.12;
    const y = (r / RD) * (H * 1.3) - H * 0.15;
    const jx = (nah() - 0.5) * (W / SL) * 0.46;
    const jy = (nah() - 0.5) * (H / RD) * 0.42;
    bod[r][c] = [x + jx, y + jy];
  }
}

let parcely = '', meze = '';
for (let r = 0; r < RD; r++) {
  for (let c = 0; c < SL; c++) {
    const a = bod[r][c], b = bod[r][c + 1], d = bod[r + 1][c + 1], e = bod[r + 1][c];
    const f = barvy[Math.floor(nah() * barvy.length)];
    const p = `M${a[0].toFixed(0)} ${a[1].toFixed(0)}L${b[0].toFixed(0)} ${b[1].toFixed(0)}L${d[0].toFixed(0)} ${d[1].toFixed(0)}L${e[0].toFixed(0)} ${e[1].toFixed(0)}Z`;
    parcely += `<path d="${p}" fill="${f}"/>`;
    // meze: světlý okraj pole
    meze += `<path d="${p}" fill="none" stroke="rgba(255,252,244,0.34)" stroke-width="1.6"/>`;
    // každé druhé pole dostane jemné brázdy
    if (nah() < 0.34) {
      const kroku = 5 + Math.floor(nah() * 5);
      for (let k = 1; k < kroku; k++) {
        const t = k / kroku;
        const x1 = a[0] + (e[0] - a[0]) * t, y1 = a[1] + (e[1] - a[1]) * t;
        const x2 = b[0] + (d[0] - b[0]) * t, y2 = b[1] + (d[1] - b[1]) * t;
        parcely += `<path d="M${x1.toFixed(0)} ${y1.toFixed(0)}L${x2.toFixed(0)} ${y2.toFixed(0)}" stroke="rgba(72,60,40,0.10)" stroke-width="1.1" fill="none"/>`;
      }
    }
  }
}

// dvě polní cesty napříč
let cesty = '';
for (let i = 0; i < 2; i++) {
  const r = 2 + i * 4;
  let d = '';
  for (let c = 0; c <= SL; c++) { const p = bod[r][c]; d += (c ? 'L' : 'M') + p[0].toFixed(0) + ' ' + p[1].toFixed(0); }
  cesty += `<path d="${d}" fill="none" stroke="rgba(255,250,240,0.46)" stroke-width="${3.4 - i}"/>`;
  cesty += `<path d="${d}" fill="none" stroke="rgba(90,74,52,0.16)" stroke-width="${6.5 - i}" stroke-linecap="round" opacity="0.5"/>`;
}

// remízky (skupinky stromů podél mezí)
let stromy = '';
for (let i = 0; i < 60; i++) {
  const r = Math.floor(nah() * (RD + 1)), c = Math.floor(nah() * (SL + 1));
  const p = bod[r][c];
  const rr = 7 + nah() * 13;
  stromy += `<ellipse cx="${(p[0] + (nah() - .5) * 40).toFixed(0)}" cy="${(p[1] + (nah() - .5) * 30).toFixed(0)}" rx="${rr.toFixed(0)}" ry="${(rr * 0.82).toFixed(0)}" fill="rgba(58,74,44,0.30)"/>`;
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice" role="img" aria-label="Letecký pohled na pole rozdělená na parcely">
<title>Pole rozdělená na parcely</title>
<rect width="${W}" height="${H}" fill="#BFB490"/>
<g>${parcely}</g>
<g>${meze}</g>
<g>${cesty}</g>
<g>${stromy}</g>
</svg>`;
writeFileSync('img/uvod-parcely.svg', svg);
console.log('hotovo,', (svg.length / 1024).toFixed(0), 'kB');
