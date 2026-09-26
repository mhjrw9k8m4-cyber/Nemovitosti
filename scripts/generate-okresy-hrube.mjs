// Hrubé hranice okresů pro prohlížeč.
//
// Přesné hranice (data/okresy-hranice.json) mají 47 tisíc bodů a skoro
// megabajt. Do formuláře „přidat pozemek" je posílat nemůžeme, a přesnost
// na metry tam k ničemu není: ptáme se jen, jestli špendlík nespadl do
// úplně jiného kouta republiky, než jaký okres člověk vybral.
//
// Body se proto proředí Douglas–Peuckerem s tolerancí 0,02° (asi 1,5 km).
// Zůstane z nich 35 kB. Proředěná hranice se od skutečné liší, takže se
// s ní nedá říct „tenhle bod je za čárou" — proto se v kontrole ptáme
// jinak: „je ten bod od vybraného okresu dál než 5 km?". Na všech 1970
// skutečných pozemcích v datech leží nejvzdálenější správný bod 1,76 km
// vně svého okresu, takže práh 5 km má skoro trojnásobnou rezervu a
// nehlásí nic zbytečně. Hlídá to scripts/test-okres.mjs.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

const KOREN = path.join(new URL('..', import.meta.url).pathname);
const VSTUP = path.join(KOREN, 'data', 'okresy-hranice.json');
const VYSTUP = path.join(KOREN, 'data', 'okresy-hrube.json');

export const TOLERANCE = 0.02;
export const PRAH_KM = 5;

function prstence(g) {
  return g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
}

/* Douglas–Peucker: nechá body, které tvar opravdu drží, a zahodí ty,
   které leží skoro na spojnici sousedů. Rekurze je rozbalená do zásobníku,
   ať se u velkých prstenců nepřeteče. */
function prored(body, tol) {
  if (body.length < 4) return body;
  const nech = new Uint8Array(body.length);
  nech[0] = 1; nech[body.length - 1] = 1;
  const zasobnik = [[0, body.length - 1]];
  while (zasobnik.length) {
    const [a, b] = zasobnik.pop();
    let nej = -1, kde = -1;
    const ax = body[a][0], ay = body[a][1], dx = body[b][0] - ax, dy = body[b][1] - ay;
    const l2 = dx * dx + dy * dy;
    for (let i = a + 1; i < b; i++) {
      const px = body[i][0], py = body[i][1];
      let d;
      if (l2 === 0) d = Math.hypot(px - ax, py - ay);
      else {
        let t = ((px - ax) * dx + (py - ay) * dy) / l2;
        t = Math.max(0, Math.min(1, t));
        d = Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
      }
      if (d > nej) { nej = d; kde = i; }
    }
    if (nej > tol) { nech[kde] = 1; zasobnik.push([a, kde], [kde, b]); }
  }
  return body.filter((_, i) => nech[i]);
}

export function postavHrube(hranice, tol = TOLERANCE) {
  const out = {};
  for (const [jmeno, g] of Object.entries(hranice)) {
    const o = [];
    for (const poly of prstence(g)) {
      // Jen vnější obrys. Díry (enklávy jiného okresu) jsou menší než
      // tolerance téhle kontroly a jejich vynechání práh 5 km nepřekročí.
      const r = prored(poly[0].map((p) => [+p[0].toFixed(4), +p[1].toFixed(4)]), tol);
      if (r.length >= 4) o.push(r);
    }
    if (o.length) out[jmeno] = o;
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (!existsSync(VSTUP)) {
    console.log('okresy-hrube: chybí data/okresy-hranice.json, přeskakuji');
  } else {
    const hrube = postavHrube(JSON.parse(readFileSync(VSTUP, 'utf8')));
    const text = JSON.stringify(hrube);
    writeFileSync(VYSTUP, text);
    let bodu = 0;
    for (const r of Object.values(hrube)) for (const p of r) bodu += p.length;
    console.log(`okresy-hrube: ${Object.keys(hrube).length} okresů, ${bodu} bodů, ${(Buffer.byteLength(text) / 1024).toFixed(0)} kB`);
  }
}
