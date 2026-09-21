// Určení okresu podle souřadnic — podle SKUTEČNÉ hranice okresu.
//
// Dřív se okres dopočítával podle nejbližšího okresního města. To je
// u obcí blízko hranice špatně: Holedeč (okres Louny) vycházela jako
// okres Most. Ke špatnému výsledku vedly dvě věci najednou:
//   1) nejbližší město není totéž co okres, ve kterém obec leží,
//   2) vzdálenost se počítala ve stupních, jako by stupeň zeměpisné
//      délky byl stejně dlouhý jako stupeň šířky — u nás je o třetinu
//      kratší, takže se měřilo nakřivo.
// Se skutečnou hranicí se bod uvnitř okresu buď nachází, nebo ne.
//
// Hranice jsou v data/okresy-hranice.json (stahuje scripts/fetch-okresy.mjs).
// Když soubor chybí, spadneme zpátky na nejbližší okresní město — ale
// aspoň s poctivým měřítkem.
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const KOREN = path.join(new URL('..', import.meta.url).pathname);
const SOUBOR = path.join(KOREN, 'data', 'okresy-hranice.json');
const MESTA = JSON.parse(readFileSync(path.join(KOREN, 'data', 'okresy.json'), 'utf8')).okresy;

let HRANICE = null, OBALKY = null;
if (existsSync(SOUBOR)) {
  HRANICE = JSON.parse(readFileSync(SOUBOR, 'utf8'));
  OBALKY = {};
  for (const [jmeno, g] of Object.entries(HRANICE)) {
    let xMin = Infinity, yMin = Infinity, xMax = -Infinity, yMax = -Infinity;
    projdiPolygony(g, (poly) => {
      for (const p of poly[0]) {
        if (p[0] < xMin) xMin = p[0];
        if (p[0] > xMax) xMax = p[0];
        if (p[1] < yMin) yMin = p[1];
        if (p[1] > yMax) yMax = p[1];
      }
    });
    OBALKY[jmeno] = [xMin, yMin, xMax, yMax];
  }
}

function projdiPolygony(g, cb) {
  const c = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
  for (const poly of c) cb(poly);
}
// Paprskový test: kolikrát polopřímka z bodu protne obvod.
function vPrstenci(x, y, prstenec) {
  let uvnitr = false;
  for (let i = 0, j = prstenec.length - 1; i < prstenec.length; j = i++) {
    const xi = prstenec[i][0], yi = prstenec[i][1], xj = prstenec[j][0], yj = prstenec[j][1];
    if (((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) uvnitr = !uvnitr;
  }
  return uvnitr;
}
function vGeometrii(lat, lng, g) {
  let tref = false;
  projdiPolygony(g, (poly) => {
    if (tref) return;
    if (!vPrstenci(lng, lat, poly[0])) return;
    for (let k = 1; k < poly.length; k++) if (vPrstenci(lng, lat, poly[k])) return; // díra v ploše
    tref = true;
  });
  return tref;
}

// Záloha: nejbližší okresní město. Stupeň délky je na 50° s. š. asi
// 0,64násobek stupně šířky — bez téhle opravy se měřilo nakřivo.
const ZKRATKA_DELKY = Math.cos(50 * Math.PI / 180);
export function nejblizsiOkresniMesto(lat, lng) {
  let nej = null, nejD = Infinity;
  for (const jmeno of Object.keys(MESTA)) {
    const c = MESTA[jmeno];
    const d = (c[0] - lat) ** 2 + ((c[1] - lng) * ZKRATKA_DELKY) ** 2;
    if (d < nejD) { nejD = d; nej = jmeno; }
  }
  return nej;
}

export function maHranice() { return !!HRANICE; }

export function okresPodleGPS(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number' || !isFinite(lat) || !isFinite(lng)) return null;
  if (HRANICE) {
    for (const [jmeno, g] of Object.entries(HRANICE)) {
      const o = OBALKY[jmeno];
      if (lng < o[0] || lng > o[2] || lat < o[1] || lat > o[3]) continue;
      if (vGeometrii(lat, lng, g)) return jmeno;
    }
    // Bod mimo všechny hranice (zjednodušená čára, bod těsně u řeky nebo
    // za hranicí státu) — vrátíme nejbližší okresní město, ať nezůstane prázdno.
  }
  return nejblizsiOkresniMesto(lat, lng);
}
