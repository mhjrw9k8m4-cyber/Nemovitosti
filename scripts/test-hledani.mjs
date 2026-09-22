// Test: najde hledání to, co člověk napsal?
//
// Spuštění: node scripts/test-hledani.mjs   (nepotřebuje prohlížeč ani síť)
//
// Hledalo se jedním podřetězcem v textu „obec okres parcela", převedeným
// jen na malá písmena. Změřeno na živých datech to znamenalo:
//   • 729 z 1040 obcí se nenašlo, když je člověk napsal bez háčků,
//   • ani jeden ze 48 okresů s diakritikou,
//   • žádný dvouslovný dotaz s prohozeným pořadím („Beroun Zdice"),
//   • nic podle druhu pozemku.
// Tenhle test hlídá, že to platí i nadále — a to na SKUTEČNÝCH datech,
// ne na vymyšlených, protože právě rozsah skutečných dat to odhalil.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const H = req(path.join(ROOT, 'js', 'hledani.js'));

const syrova = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const DATA = Array.isArray(syrova) ? syrova : syrova.opportunities;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const najdi = (q) => DATA.filter((d) => H.vyhovuje(d, H.tokeny(q)));
const bezDia = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');

/* --- 1) Háčky a čárky -------------------------------------------------- */
{
  const obce = [...new Set(DATA.map((d) => d.place).filter(Boolean))].filter((o) => /[^\x00-\x7F]/.test(o));
  const nenalezene = obce.filter((o) => najdi(bezDia(o)).length === 0);
  pravda(`háčky: všech ${obce.length} obcí s diakritikou se najde i bez nich`,
    nenalezene.length === 0, 'nenajde: ' + nenalezene.slice(0, 5).join(', '));

  const okresy = [...new Set(DATA.map((d) => d.okres).filter(Boolean))].filter((o) => /[^\x00-\x7F]/.test(o));
  const okNe = okresy.filter((o) => najdi(bezDia(o)).length === 0);
  pravda(`háčky: všech ${okresy.length} okresů s diakritikou se najde i bez nich`,
    okNe.length === 0, 'nenajde: ' + okNe.slice(0, 5).join(', '));

  // A obráceně: kdo háčky napíše, taky musí najít.
  const sHacky = obce.filter((o) => najdi(o).length === 0);
  pravda('háčky: kdo je napíše správně, najde totéž', sHacky.length === 0,
    'nenajde: ' + sHacky.slice(0, 5).join(', '));
}

/* --- 2) Pořadí slov ---------------------------------------------------- */
{
  const dvojice = [...new Set(DATA.filter((d) => d.place && d.okres && d.place !== d.okres)
    .map((d) => d.okres + ' ' + d.place))].slice(0, 300);
  const spatne = dvojice.filter((q) => najdi(q).length === 0);
  pravda(`pořadí slov: „okres obec" najde pozemek (${dvojice.length} dvojic)`,
    spatne.length === 0, 'nenajde: ' + spatne.slice(0, 3).join(' | '));
}

/* --- 3) Mezery navíc a druh pozemku ------------------------------------ */
{
  const obec = DATA.find((d) => /\s/.test(d.place || ''));
  pravda('dvě mezery v názvu nevadí',
    obec ? najdi(obec.place.replace(/ /g, '   ')).length > 0 : true, obec && obec.place);
  pravda('mezery kolem dotazu nevadí', najdi('   beroun   ').length === najdi('beroun').length);

  const sDruhem = DATA.filter((d) => d.okres && d.druh).slice(0, 200)
    .map((d) => d.okres + ' ' + d.druh.split(' ')[0]);
  const bezShody = [...new Set(sDruhem)].filter((q) => najdi(q).length === 0);
  pravda('druh pozemku: „okres druh" najde pozemek', bezShody.length === 0,
    'nenajde: ' + bezShody.slice(0, 3).join(' | '));
}

/* --- 4) Co se nesmí rozbít --------------------------------------------- */
{
  pravda('prázdný dotaz pustí všechno', najdi('').length === DATA.length);
  pravda('samé mezery pustí všechno', najdi('    ').length === DATA.length);

  const sParcelou = DATA.find((d) => d.parcel && d.parcel !== '—' && d.parcel !== '-');
  pravda('parcelní číslo se pořád hledá',
    sParcelou ? najdi(sParcelou.parcel).some((x) => x === sParcelou) : true,
    sParcelou && sParcelou.parcel);

  // Každé slovo navíc smí výběr jen zúžit. Kdyby ne, delší dotaz by vracel
  // víc výsledků než kratší a hledání by se chovalo nepředvídatelně.
  let poruseno = 0;
  const vzorek = DATA.slice(0, 120);
  for (const d of vzorek) {
    if (!d.place || !d.okres) continue;
    const a = najdi(d.place).length, b = najdi(d.place + ' ' + d.okres).length;
    if (b > a) poruseno++;
  }
  pravda('slovo navíc výběr jen zužuje, nikdy nerozšiřuje', poruseno === 0, poruseno + ' případů');

  // Pomlčka v názvu okresu („Praha-západ") nesmí bránit psaní s mezerou.
  const pomlcka = DATA.find((d) => /-/.test(d.okres || ''));
  pravda('pomlčka v okrese: jde napsat i s mezerou',
    pomlcka ? najdi(bezDia(pomlcka.okres).replace(/-/g, ' ')).length > 0 : true,
    pomlcka && pomlcka.okres);

  // Začátek slova stačí — lidé dopíšou půlku a přestanou.
  const obec2 = [...new Set(DATA.map((d) => d.place))].find((p) => p && bezDia(p).length >= 6);
  pravda('stačí začátek názvu', obec2 ? najdi(bezDia(obec2).slice(0, 4)).length > 0 : true, obec2);

  // Nesmysl nesmí vrátit nic (jinak by shoda byla děravá na druhou stranu).
  pravda('nesmyslný dotaz nevrátí nic', najdi('xqzwkj').length === 0);
}

/* --- 5) Zapamatovaný text musí sedět s čerstvě spočítaným -------------- */
{
  const d = { place: 'Říčany', okres: 'Praha-východ', parcel: '769/2', druh: 'orná půda' };
  const prvni = H.seno(d);
  const druhy = H.seno(d);
  const cerstve = H.seno({ place: d.place, okres: d.okres, parcel: d.parcel, druh: d.druh });
  pravda('zapamatovaný text hledání sedí s čerstvě spočítaným',
    prvni === druhy && prvni === cerstve, prvni + ' × ' + cerstve);
  pravda('zmrazený záznam hledání nepoloží',
    H.vyhovuje(Object.freeze({ place: 'Zdice', okres: 'Beroun' }), H.tokeny('zdice')) === true);
}

/* --- 6) Kde to je: střed obce podle názvu ------------------------------ */
{
  const R = 6371, rad = Math.PI / 180;
  const dist = (a, b) => {
    const x = Math.sin((b.lat - a.lat) * rad / 2) ** 2
      + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin((b.lng - a.lng) * rad / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  };
  const sKoord = DATA.filter((d) => typeof d.lat === 'number' && typeof d.lng === 'number');

  // Stejný název nese 30 obcí až 309 km od sebe. Trefa musí sednout na tu,
  // kde je nabídek nejvíc — ne na tu, která je první v souboru.
  const podleObce = {};
  for (const d of sKoord) {
    const k = H.norm(d.place) + '|' + H.norm(d.okres);
    (podleObce[k] = podleObce[k] || []).push(d);
  }
  const jmena = [...new Set(sKoord.map((d) => H.norm(d.place)))];
  const sporne = jmena.filter((n) => Object.keys(podleObce).filter((k) => k.split('|')[0] === n).length > 1);
  let mimo = 0, nejhorsi = 0, kde = '';
  for (const n of sporne) {
    let nej = null;
    for (const k of Object.keys(podleObce)) if (k.split('|')[0] === n && (!nej || podleObce[k].length > nej.length)) nej = podleObce[k];
    const cil = { lat: H.median(nej.map((d) => d.lat)), lng: H.median(nej.map((d) => d.lng)) };
    const m = H.misto(DATA, n);
    const dd = m ? dist(m, cil) : 9999;
    if (dd > 20) { mimo++; if (dd > nejhorsi) { nejhorsi = dd; kde = n; } }
  }
  pravda(`střed obce: ${sporne.length} názvů sdílí víc okresů, žádný netrefí vedle`,
    mimo === 0, `mimo: ${mimo}, nejhůř ${kde} o ${nejhorsi.toFixed(0)} km`);

  // Dopsaný okres musí rozhodnout, o kterou stejnojmennou obec jde.
  const rozhodne = sporne.map((n) => {
    const klice = Object.keys(podleObce).filter((k) => k.split('|')[0] === n);
    return { n, okresy: klice.map((k) => podleObce[k][0].okres) };
  }).filter((x) => x.okresy.length > 1);
  let selhalo = 0;
  for (const { n, okresy } of rozhodne) {
    for (const o of okresy) {
      const m = H.misto(DATA, n + ' ' + o);
      if (!m || H.norm(m.okres) !== H.norm(o)) selhalo++;
    }
  }
  pravda(`střed obce: dopsaný okres rozhodne (${rozhodne.length} sporných názvů)`,
    selhalo === 0, selhalo + ' případů');

  // Jeden pozemek se špatnými souřadnicemi nesmí strhnout střed.
  const vzor = [];
  for (let i = 0; i < 5; i++) vzor.push({ place: 'Testov', okres: 'Testokres', lat: 50 + i * 0.001, lng: 14 + i * 0.001 });
  vzor.push({ place: 'Testov', okres: 'Testokres', lat: 48.9, lng: 16.9 });   // překlep v datech
  const st = H.misto(vzor, 'Testov');
  pravda('střed obce: jeden ujetý bod středem nehne',
    st && dist(st, { lat: 50.002, lng: 14.002 }) < 1, st && st.lat + ',' + st.lng);

  // Okres bez obce: střed patří doprostřed okresu, ne do první vesnice.
  const okresTest = 'Beroun';
  const vseOkres = sKoord.filter((d) => H.norm(d.okres) === H.norm(okresTest));
  if (vseOkres.length > 3) {
    const stred = { lat: H.median(vseOkres.map((d) => d.lat)), lng: H.median(vseOkres.map((d) => d.lng)) };
    const m = H.misto(DATA, okresTest);
    pravda('střed okresu sedí doprostřed jeho nabídek', m && dist(m, stred) < 25,
      m ? dist(m, stred).toFixed(1) + ' km' : 'nic');
  }

  pravda('jedno písmeno nic nehledá', H.misto(DATA, 'b') === null);
  pravda('nesmyslný název nic nevrátí', H.misto(DATA, 'xqzwkj') === null);
  pravda('obec bez souřadnic se nepočítá',
    H.misto([{ place: 'Testov', okres: 'X' }], 'Testov') === null);
}

/* --- 7) Je to doopravdy zapojené? -------------------------------------- */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  pravda('js/main.js hledá přes společný modul', /HL\.vyhovuje\(d, searchToks\)/.test(main));
  pravda('js/main.js má záložní hledání, když se modul nenačte',
    /window\.PKHledani \|\|/.test(main));
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const pH = idx.indexOf('js/hledani.js'), pM = idx.indexOf('js/main.js');
  pravda('index.html načítá js/hledani.js, a dřív než js/main.js', pH > 0 && pH < pM, pH + ' × ' + pM);
  pravda('js/main.js hledá obec přes společný modul', /HL\.misto \? HL\.misto\(DATA, q\)/.test(main));
}

console.log(zpravy.join('\n'));
console.log(`\n${ok + chyb} kontrol: ${ok} prošlo, ${chyb} selhalo.`);
process.exit(chyb ? 1 : 0);
