// Test: stránka „Co je na trhu nového" nesmí vydávat starou nabídku za novou.
//
// Spuštění: node scripts/test-nove-pozemky.mjs
//
// Je to past, na kterou tenhle web už jednou doplatil. První den, kdy
// robot obešel zdroje, dostalo `first_seen` naráz 1 637 nabídek z 1 998
// — ty na trhu byly dávno předtím. Kdyby se počítaly jako nové,
// slibovala by stránka osmnáctkrát víc novinek, než kolik jich je, a
// nedalo by se to poznat: čísla by byla spočítaná správně a byla by to
// nepravda. (Totéž se stalo u mediánu doby na trhu, viz
// scripts/archiv-statistiky.mjs.)
//
// Druhá polovina testu hlídá změny cen. Pravidla jsou v js/zlevneni.js
// a jsou tři: změna pod 3 % není zpráva, změna nad 50 % se neoznačuje
// za příležitost, ale posílá ověřit, a ZDRAŽENÍ SE NESCHOVÁVÁ. To
// poslední je jediná věc, kterou by web ve svůj prospěch zamlčel
// nejsnáz — proto se tu měří, že na stránce opravdu je.
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const require_ = createRequire(import.meta.url);
const U = (p) => new URL('../' + p, import.meta.url);
new Function(readFileSync(U('js/terminy.js'), 'utf8'))();
new Function(readFileSync(U('js/klic.js'), 'utf8'))();
const T = globalThis.PK_TERMINY, PKKlic = globalThis.PKKlic;
const PKZ = require_('../js/zlevneni.js');
const NOV = await import('./novinky-rez.mjs');
const PKH = require_('../js/hlidani-logika.js');
const data = JSON.parse(readFileSync(U('data/opportunities.json'), 'utf8'));
const all = PKH.bezDuplicit(data.opportunities);
const aktualni = all.filter((o) => !T.poTerminu(o));
const historie = JSON.parse(readFileSync(U('data/zlevneni.json'), 'utf8')).nabidky || {};

const SOUBOR = 'nove-pozemky.html';
if (!existsSync(U(SOUBOR))) {
  console.log(`  ✕ ${SOUBOR} neexistuje — generuje ho scripts/generate-region-pages.mjs`);
  process.exit(1);
}
/* Pevné mezery ze sazby pryč hned při čtení — viz scripts/sazba.mjs. */
const h = readFileSync(U(SOUBOR), 'utf8').replace(/ /g, ' ');
const cislo = (s) => Number(String(s).replace(/\s/g, ''));
const mez = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\\s');

// --- 1) První den evidence se bere z dat, ne z konstanty -------------
const prvniDen = all.map((o) => String(o.first_seen || '')).filter(Boolean).sort()[0];
const backlog = all.filter((o) => o.first_seen === prvniDen).length;
pravda('v datech je vidět nárůst prvního dne evidence', backlog > 100,
  `${prvniDen}: ${backlog} nabídek — tolik jich naskočilo naráz`);
const gen = readFileSync(U('scripts/generate-region-pages.mjs'), 'utf8');
pravda('stránku staví týž řez, jaký se tu zkouší', /import \* as NOV from '\.\/novinky-rez\.mjs'/.test(gen)
  && /NOV\.noveNabidky\(aktualni/.test(gen),
  'kdyby si generátor řez počítal sám, tenhle test by měřil něco jiného, než co je na stránce');

/* ===== PODSTRČENÝ VZOREK ===========================================
   Tady se dokazuje to hlavní, a dokázat se to na ostrých datech NEDÁ:
   první den evidence (19. 9. 2026) je starší než čtrnáctidenní okno,
   takže ho okno vyloučí samo. Smazal jsem tu podmínku z generátoru
   nadivoko a zkouška prošla zeleně — hlídala jen to, že ten řádek
   v kódu někde je.
   Vzorek je proto vymyšlený schválně tak, aby první den evidence ležel
   UVNITŘ okna. Když se podmínka vypustí, počet se ztrojnásobí. */
{
  const vz = [
    { first_seen: '2026-03-01', price: 1 }, { first_seen: '2026-03-01', price: 2 },
    { first_seen: '2026-03-01', price: 3 },
    { first_seen: '2026-03-04', price: 50 },
    { first_seen: '2026-03-05', price: 20 }, { first_seen: '2026-03-05', price: 10 },
    { first_seen: '2026-02-01', price: 9 },   // starší než evidence být nemůže, ale ať to nespadne
  ];
  const dnesIso = '2026-03-05';
  const prvni = NOV.prvniDenEvidence(vz);
  pravda('první den evidence se najde jako nejstarší záznam', prvni === '2026-02-01', prvni);
  /* Vzorek bez toho jednoho outlieru — ať je první den opravdu ten,
     na kterém naskočila dávka. */
  const vz2 = vz.filter((x) => x.first_seen !== '2026-02-01');
  const prvni2 = NOV.prvniDenEvidence(vz2);
  pravda('a leží UVNITŘ okna, takže se dá zkoušet',
    prvni2 === '2026-03-01' && prvni2 >= NOV.minusDni(dnesIso, 14), `${prvni2} vs. okno od ${NOV.minusDni(dnesIso, 14)}`);
  const n = NOV.noveNabidky(vz2, { dnesIso, dnu: 14 });
  pravda('dávka z prvního dne se mezi novinky NEPOČÍTÁ', n.length === 3,
    `vyšlo ${n.length}, čekáno 3 (ze šesti; tři jsou z prvního dne)`);
  pravda('a ani jedna vypsaná není z prvního dne',
    n.every((x) => x.first_seen > prvni2), n.map((x) => x.first_seen).join(', '));
  pravda('řadí se od nejnovějšího dne', n[0].first_seen === '2026-03-05');
  pravda('a v rámci dne od nejnižší ceny', n[0].price === 10 && n[1].price === 20,
    n.map((x) => x.price).join(', '));
  pravda('počet z prvního dne se spočítá správně', NOV.pocetZPrvnihoDne(vz2) === 3);
  pravda('kratší okno vyřízne starší dny',
    NOV.pocetNovych(vz2, { dnesIso, dnu: 1 }) === 2,
    'při okně jednoho dne mají zůstat jen dvě nabídky z 5. 3., ne i ta ze 4.');
  pravda('bez data „dnes" se nevrátí nic (místo celé evidence)',
    NOV.noveNabidky(vz2, { dnesIso: '', dnu: 14 }).length === 0,
    'rozbité datum nesmí znamenat „ukaž všechno"');
}

// --- 2) Čísla v hlavičce --------------------------------------------
const dnesIso = String(data.updated || '').slice(0, 10);
const minusDni = (iso, n) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - n * 86400000).toISOString().slice(0, 10);
};
/* OKNO JE VČETNĚ DNEŠNÍHO DNE — „posledních sedm dní" je sedm
   kalendářních dnů, tedy od `dnes − 6`. Napsané tu je to zvlášť,
   ne vypůjčené z modulu: kdyby si obě strany půjčovaly totéž
   `minusDni`, posun o den by prošel oběma a test by potvrdil chybu. */
const noveZa = (n) => aktualni.filter((o) => o.first_seen && o.first_seen > prvniDen
  && o.first_seen >= minusDni(dnesIso, n - 1));
const n7 = noveZa(7).length, n14 = noveZa(14).length;
pravda(`v hlavičce je ${n7} nových za 7 dní`,
  new RegExp('<b>' + mez(n7) + ' pozem').test(h),
  'podtitulek: ' + ((/<p class="sub">([\s\S]*?)<\/p>/.exec(h) || [])[1] || '—').replace(/<[^>]*>/g, ''));
pravda(`dlaždice uvádí ${n7} nových za 7 dní`,
  new RegExp('<b>' + mez(n7) + '</b><span>nových za 7 dní').test(h));
pravda(`dlaždice uvádí ${n14} nových za 14 dní`,
  new RegExp('<b>' + mez(n14) + '</b><span>nových za 14 dní').test(h));
/* A kontrola, že okno není o den delší, než stránka tvrdí. Na dnešních
   datech je v tom čtrnáct nabídek. */
const dnyVOkne = new Set(noveZa(7).map((o) => o.first_seen));
pravda('„posledních 7 dní" je sedm kalendářních dnů, ne osm',
  dnyVOkne.size <= 7 && [...dnyVOkne].every((d) => d >= minusDni(dnesIso, 6)),
  `dnů ve vzorku: ${dnyVOkne.size}, nejstarší ${[...dnyVOkne].sort()[0]}, mez ${minusDni(dnesIso, 6)}`);

// --- 3) PŘIZNÁNÍ, co „nové" znamená ---------------------------------
pravda('stránka přiznává, že „nové" je nové v evidenci',
  /Nové <b>v naší evidenci<\/b>/.test(h),
  'bez téhle věty je číslo v hlavičce nepravda');
pravda(`přiznání uvádí skutečný první den evidence (${PKZ.lidsky(prvniDen)})`,
  h.includes('<b>' + PKZ.lidsky(prvniDen) + '</b>'));
pravda(`a skutečný počet nabídek z toho dne (${backlog})`,
  new RegExp('naráz ' + mez(backlog) + ' nabídek').test(h),
  'na stránce: ' + ((/naráz ([\d\s]+) nabídek/.exec(h) || [])[1] || '—'));
pravda('přiznání stojí NAD seznamem nově přidaných',
  h.indexOf('Nové <b>v naší evidenci</b>') < h.indexOf('<h2>Nově přidané</h2>'),
  'pod seznamem by si ho nikdo nepřečetl');

// --- 4) Nově přidané: dny v hlavičkách skupin -----------------------
const dny = [...h.matchAll(/<h3 class="okr-kraj-h">(\d+\. \d+\. \d{4})<\/h3>/g)].map((m) => m[1]);
pravda('seznam nově přidaných je rozdělený po dnech', dny.length > 1, dny.join(' | '));
const naIso = (cz) => {
  const m = /^(\d+)\. (\d+)\. (\d{4})$/.exec(cz);
  return `${m[3]}-${String(m[2]).padStart(2, '0')}-${String(m[1]).padStart(2, '0')}`;
};
const dnyIso = dny.map(naIso);
pravda('dny jdou od nejnovějšího', dnyIso.every((d, i) => i === 0 || dnyIso[i - 1] >= d),
  dnyIso.join(' '));
pravda('ŽÁDNÝ vypsaný den není první den evidence',
  dnyIso.every((d) => d > prvniDen),
  `první den evidence je ${prvniDen}, na stránce: ${dnyIso.filter((d) => d <= prvniDen).join(', ')}`);
const okno = minusDni(dnesIso, 14);
pravda('žádný vypsaný den nepadá mimo čtrnáctidenní okno',
  dnyIso.every((d) => d >= okno && d <= dnesIso),
  `okno ${okno}–${dnesIso}, mimo: ${dnyIso.filter((d) => d < okno || d > dnesIso).join(', ')}`);
/* A naopak: dny, které na stránce jsou, musí v datech existovat —
   jinak by si stránka nadpisy vymýšlela. */
const dnyVDatech = new Set(aktualni.map((o) => o.first_seen));
pravda('každý vypsaný den má v datech nabídku', dnyIso.every((d) => dnyVDatech.has(d)),
  dnyIso.filter((d) => !dnyVDatech.has(d)).join(', '));

// --- 5) ZMĚNY CEN: přepočet z archivu -------------------------------
const zmeny = { dolu: [], nahoru: [], pod: [] };
for (const o of aktualni) {
  const hist = historie[PKKlic.klicArchivu(o)];
  const s = hist && hist.length > 1 ? Object.assign({}, o, { h: hist }) : o;
  const z = PKZ.zmena(s);
  if (!z) continue;
  (z.podezrela ? zmeny.pod : (z.dolu ? zmeny.dolu : zmeny.nahoru)).push(z);
}
pravda('archiv zná změny cen, je co měřit', zmeny.dolu.length >= 5,
  `zlevnilo ${zmeny.dolu.length}, zdražilo ${zmeny.nahoru.length}, k ověření ${zmeny.pod.length}`);
pravda(`dlaždice uvádí ${zmeny.dolu.length} zlevněných`,
  new RegExp('<b>' + mez(zmeny.dolu.length) + '</b><span>zlevn').test(h),
  'na stránce: ' + ((/<b>([\d\s]+)<\/b><span>zlevn/.exec(h) || [])[1] || '—'));

/* Řádky změn: „předtím <b>199 000 Kč</b> (−46 %, 29. 9. 2026)". */
/* Oddíl = od svého nadpisu do nadpisu dalšího oddílu. Počítat
   uzavírací </div> bylo první, co mě napadlo, a bylo to špatně: vzorek
   přeběhl do dalšího oddílu a ve „Zlevněné" se tím našlo 45 řádků
   místo 40 — tedy i těch pět zdražených. Test tak hlásil chybu, která
   byla v něm, ne na stránce. */
function sekce(nadpis) {
  const re = new RegExp('<h2>' + nadpis.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    + '<\\/h2>([\\s\\S]*?)(?=<h2>|<\\/main>)');
  return (re.exec(h) || [])[1] || '';
}
const sZlevneno = sekce('Zlevněné');
const sZdrazeno = sekce('Zdražené');
const sOvereni = sekce('Cena se změnila skokem — ověřte ji');
const radky = (text) => [...text.matchAll(/(předtím|původně) <b>([\d\s]+) Kč<\/b> \(([−+])(\d+) %/g)]
  .map((m) => ({ slovo: m[1], drive: cislo(m[2]), smer: m[3], pct: +m[4] }));
const rZlev = radky(sZlevneno), rZdraz = radky(sZdrazeno), rOver = radky(sOvereni);

pravda('oddíl „Zlevněné" má řádky', rZlev.length > 0);
pravda(`vypsáno ${Math.min(zmeny.dolu.length, 40)} zlevněných`,
  rZlev.length === Math.min(zmeny.dolu.length, 40), `na stránce ${rZlev.length}`);
pravda('všechny řádky ve „Zlevněné" míří DOLŮ', rZlev.every((r) => r.smer === '−'),
  rZlev.filter((r) => r.smer !== '−').map((r) => r.drive).join(', '));
pravda(`žádné zlevnění není pod mezí ${PKZ.MEZ_PROCENT} %`,
  rZlev.every((r) => r.pct >= PKZ.MEZ_PROCENT),
  'pod mezí bývá zaokrouhlení u zdroje, ne sleva');
pravda(`a žádné není nad ${PKZ.MEZ_PODEZRELA} % (to má vlastní oddíl)`,
  rZlev.every((r) => r.pct < PKZ.MEZ_PODEZRELA),
  rZlev.filter((r) => r.pct >= PKZ.MEZ_PODEZRELA).map((r) => r.pct + ' %').join(', '));
/* DRAŽBA MEZI ZLEVNĚNÝMI NENÍ SLEVA PRODÁVAJÍCÍHO. Je-li mezi nimi
   aspoň jedna, musí to stránka říct — jinak o ní tvrdí, že někdo
   snížil cenu, a to u dražby nedělá prodávající. */
{
  const drazeb = (() => {
    let n = 0;
    for (const o of aktualni) {
      if (o.type !== 'drazba' && o.type !== 'exekuce') continue;
      const hist = historie[PKKlic.klicArchivu(o)];
      const x = hist && hist.length > 1 ? Object.assign({}, o, { h: hist }) : o;
      const z = PKZ.zmena(x);
      if (z && z.dolu && !z.podezrela) n++;
    }
    return n;
  })();
  if (drazeb) {
    pravda(`mezi zlevněnými je ${drazeb} dražba — a stránka to říká`,
      new RegExp('U <b>' + mez(drazeb) + '</b> z nich jde o <b>dražbu</b>').test(h)
      && /nikdo nic nezlevnil/.test(sZlevneno),
      'u dražby cenu nesnižuje prodávající, ale vypisuje se nižší vyvolávací cena');
    pravda('a nad seznamem nestojí, že cenu snížil prodávající',
      !/prodávající[^.]*snížil cenu/.test(sZlevneno));
  } else {
    pravda('mezi zlevněnými není dražba, výhrada tedy chybí právem',
      !/jde o <b>dražbu<\/b>/.test(sZlevneno));
  }
}

pravda('zlevnění jsou seřazená od nejnovějšího dne',
  /<h2>Zlevněné<\/h2>/.test(h) && (() => {
    const d = [...sZlevneno.matchAll(/%, (\d+\. \d+\. \d{4})\)/g)].map((m) => naIso(m[1]));
    return d.every((x, i) => i === 0 || d[i - 1] >= x);
  })());

// --- 6) ZDRAŽENÍ SE NESCHOVÁVÁ --------------------------------------
if (zmeny.nahoru.length) {
  pravda(`zdražení se neschovává (${zmeny.nahoru.length} v datech)`, rZdraz.length > 0,
    'kdyby stránka ukazovala jen zlevnění, vypadal by trh jako jednosměrka dolů');
  pravda(`vypsáno ${Math.min(zmeny.nahoru.length, 40)} zdražených`,
    rZdraz.length === Math.min(zmeny.nahoru.length, 40), `na stránce ${rZdraz.length}`);
  pravda('všechny řádky ve „Zdražené" míří NAHORU', rZdraz.every((r) => r.smer === '+'),
    rZdraz.filter((r) => r.smer !== '+').map((r) => r.pct + ' %').join(', '));
  pravda('a stránka u nich říká, proč tam jsou',
    /jako jednosměrka dolů/.test(sZdrazeno));
} else {
  pravda('v datech není žádné zdražení, oddíl tedy chybí právem', !rZdraz.length);
}

// --- 7) Skokové změny mají vlastní oddíl, ne „sleva" ----------------
if (zmeny.pod.length) {
  pravda(`skokové změny mají vlastní oddíl (${zmeny.pod.length})`, rOver.length === zmeny.pod.length,
    `na stránce ${rOver.length}`);
  pravda('a stránka u nich nemluví o příležitosti',
    /nenazýváme ho příležitostí/.test(sOvereni) && /ověřte cenu/.test(sOvereni));
  pravda('každá z nich je nad mezí podezřelosti',
    rOver.every((r) => r.pct >= PKZ.MEZ_PODEZRELA),
    rOver.map((r) => r.pct + ' %').join(', '));
} else {
  pravda('žádná skoková změna v datech není', !rOver.length);
}

// --- 8) Odkaz na mapu musí filtr opravdu zapnout --------------------
const main = readFileSync(U('js/main.js'), 'utf8');
if (/index\.html\?zlevnene=1#mapa/.test(h)) {
  pravda('mapa umí ?zlevnene=1 z adresy', /\[\?&\]zlevnene=1/.test(main)
    && /\(q\|druh\|maxc\|mina\|zlevnene\)=/.test(main),
    'odkaz by sliboval zapnutý filtr a mapa by ukázala všechno');
} else {
  pravda('bez odkazu na filtr se nic neslibuje', true);
}

// --- 9) Prolinkování a sitemap --------------------------------------
const sm = readFileSync(U('sitemap.xml'), 'utf8');
pravda('sitemap zná nove-pozemky.html', sm.includes('/' + SOUBOR));
pravda('a hlásí ji jako denně se měnící',
  new RegExp('/' + SOUBOR + '</loc>\\s*<changefreq>daily').test(sm),
  'robot ji obchází čtyřikrát denně — weekly by znamenalo, že si pro novinky nikdo nepřijde');
for (const odkud of ['pozemky-podle-okresu.html', 'pozemky-do-500-tisic.html', 'pozemky-okres-kolin.html']) {
  if (!existsSync(U(odkud))) continue;
  pravda(`${odkud} na ni odkazuje`,
    readFileSync(U(odkud), 'utf8').includes(`href="${SOUBOR}"`));
}
pravda('stránka vede zpátky na hlídání i na regiony',
  h.includes('href="hlidani.html"') && h.includes('href="pozemky-podle-okresu.html"'));

console.log('Co je nového:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
process.exit(chyb ? 1 : 0);
