// Test: ovladač téhož jména se kreslí jedním receptem, ať stojí kdekoli.
//
// Spuštění: node scripts/test-ovladace.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Desky hlídá test-deska, zaoblení
// test-zaobleni, přechody test-prechody — ale TYPOGRAFII ovladačů
// nehlídal nikdo. Otisk 16 typů stránek 29. 10. napočítal 194 ovladačů
// s plochou nebo rámem ve 35 receptech a našel vadu, kterou by si nikdo
// nepřečetl ze stylopisu: `.btn-primary{font-weight:700}` prohrávalo
// s `#nav a{font-weight:500}`, protože id a prvek přebijí jednu třídu.
// Hlavní tlačítko webu tedy bylo v liště o dva řezy lehčí než v obsahu
// — a na cena-pozemku.html stála obě na jedné stránce.
//
// CO SE TU HLÍDÁ:
//   1) ŘEZ HLAVNÍ AKCE. Každé .btn-primary a .btn-secondary má 700.
//      Bez výjimek: na tomhle webu je hlavní akce vždycky nejtěžší text
//      v okolí a je to jediný způsob, jak ji oko najde dřív než barvou.
//   2) JEDEN RECEPT NA JMÉNO. Táž třída ovladače nesmí mít dvě
//      velikosti nebo dva řezy písma. Výjimky mají jméno a důvod.
//   3) LIŠTA SE NESMÍ LIŠIT OD OBSAHU. Třída, která stojí v #nav
//      i mimo něj, se na obou místech vykreslí stejně. Přesně tohle
//      byla ta vada: kaskáda měnila ovladač podle toho, KDE sedí.
//
// Měří se VYKRESLENÁ hodnota, ne zápis ve stylopisu.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Jeden ovladač', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* VÝJIMKY ke kontrole 2. Píše se sem jméno, DOVOLENÉ RECEPTY a důvod.
   Výčet, ne bianco šek: první verze jen jmenovala třídu, a tím by
   propustila i TŘETÍ recept, o kterém nikdo nerozhodl. Naměřeno na
   .msv-ulozene — ten se jmenuje `mc-prep msv-ulozene`, takže by se
   schoval za výjimku pro .mc-prep. */
const DVA_RECEPTY = new Map([
  /* Odeslání formuláře je přes celou šířku a nese 16 px, aby se dalo
     na telefonu bezpečně stisknout palcem (.add-form, .rct-form). */
  ['btn-primary', { recepty: ['14/700', '16/700'],
    dovod: 'odeslání formuláře je 16 px přes celou šířku' }],
  /* „Otevřít v katastru" je zdůrazněná akce přes celou šířku a má 700,
     ostatní akce v téže liště 600 — důvod stojí v pozemek-vlozeny.css
     u .pz-actions .pz-abtn:first-child. */
  ['pz-abtn', { recepty: ['14/700', '14/600'],
    dovod: 'první akce v liště je zdůrazněná (700), ostatní 600' }],
  /* .mc-prep má ve stylopisu napsané dvě role: řádková součástka
     v panelu filtrů (14 px, vedle .mcv-btn) a štítek v liště nad
     výpisem (13 px, vedle řazení). Důvod stojí u obou pravidel
     v css/styles.css — „JEN UVNITŘ PANELU" a „Štítkový vzhled
     .mc-prep pro použití MIMO panel filtrů". */
  ['mc-prep', { recepty: ['14/600', '13/600'],
    dovod: 'součástka v panelu filtrů (14) a štítek nad výpisem (13)' }],
]);
/* Ovladače, které kreslí knihovna, ne náš stylopis. */
const MIMO = new Set(['leaflet-control-zoom-in', 'leaflet-control-zoom-out',
  'leaflet-popup-close-button', 'leaflet-control-attribution']);

/* JMÉNA SE OVĚŘUJÍ, NE HÁDAJÍ. První verze seznamu měla pět stránek,
   které na webu vůbec nejsou (pozemky, mapa, ucet, odhad, profil) —
   otisk je mlčky přeskočil a zkouška přitom hlásila, že měřila
   sedmnáct stránek. Že každá opravdu dojede, hlídá kontrola 0 níž.
   Mapa mimochodem nemá vlastní stránku: je na index.html. */
const STRANKY = ['index.html', 'pridat.html', 'cena-pozemku.html',
  'muj-inzerat.html', 'hlidani.html', 'zpravy.html', 'data.html',
  'moje-data.html', 'na-co-mam-pozemek.html', 'nove-pozemky.html',
  'inzerce.html', 'drazby-pozemku.html', 'porovnani.html', 'kontakt.html',
  'pozemky-zahrada.html', 'pozemky-okres-zlin.html',
  'pozemky-jihomoravsky-kraj.html',
  /* OBSAHOVÁ POLOVINA WEBU. Změřeno pokrytím 29. 10.: hlídači jedné
     soustavy viděli jen aplikační stránky. Třináct článků, rozcestník
     rádce, cenová pásma, druhové výpisy ani právní texty nevidělo ani
     jedno z pravidel o desce, zaoblení, přechodu a ovladači — a co to
     stojí, předvedla moje-data.html (§221). Po jednom představiteli
     každé předlohy: */
  'radce.html', 'hypoteka-na-pozemek.html', 'podminky.html',
  'pozemky-do-500-tisic.html', 'pozemky-lesni.html', 'odhlasit-maily.html',
  (adresaPozemku() || {}).url || 'pozemek.html'];

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 1280, height: 900 }, locale: 'cs-CZ', reducedMotion: 'reduce' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') {
    return r.fulfill({ status: 200, contentType: 'image/png',
      body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64') });
  }
  return r.abort();
});
const p = await ctx.newPage();

/* jméno třídy → { recepty: Map(recept → kde), vListe: Set, vObsahu: Set } */
const ovladace = new Map();
const hlavni = [];
let spocteno = 0;
const nedojely = [];
for (const s of STRANKY) {
  const odp = await p.goto(BASE + '/' + s, { waitUntil: 'load' }).catch(() => null);
  if (!odp || !odp.ok()) { nedojely.push(s + (odp ? ' → ' + odp.status() : ' → vůbec')); continue; }
  await p.waitForTimeout(2000);
  const nalez = await p.evaluate(() => {
    const out = [];
    const prusvitna = (c) => !c || c === 'transparent' || /rgba\(0, 0, 0, 0\)/.test(c);
    for (const e of document.querySelectorAll('button, a, input[type=submit], [role="button"]')) {
      const rc = e.getBoundingClientRect();
      if (rc.height < 10 || rc.width < 10) continue;
      const cs = getComputedStyle(e);
      const maPlochu = !prusvitna(cs.backgroundColor);
      const maRam = parseFloat(cs.borderTopWidth) > 0 && cs.borderTopStyle !== 'none';
      /* Holý odkaz v textu není ovladač — musí mít vlastní plochu nebo rám. */
      if (!maPlochu && !maRam) continue;
      /* Nad 90 px už to není ovladač, ale deska, která se dá kliknout. */
      if (rc.height > 90) continue;
      const tridy = (e.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      out.push({
        jm: tridy.length ? tridy[0] : e.tagName.toLowerCase(),
        tridy,
        pismo: Math.round(parseFloat(cs.fontSize)) + '/' + cs.fontWeight,
        v: Math.round(rc.height),
        vListe: !!e.closest('#nav'),
        text: (e.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 20),
      });
    }
    return out;
  }).catch(() => []);
  spocteno += nalez.length;
  for (const x of nalez) {
    if (MIMO.has(x.jm)) continue;
    /* OVLADAČ BEZ TŘÍDY SE NEŘÍDÍ JMÉNEM, ALE OKOLÍM. První běh je
       svedl všechny do jednoho košíku „a" a ohlásil tři recepty —
       jenže „Otevřít mapu pozemků", „Zprávy" a odkaz na obec v okresním
       výpisu nemají co mít společného. Do kontroly 2 a 3 tedy nepatří;
       do počtu ano, ať se pozná, že otisk sebral celý web. */
    if (!x.tridy.length) continue;
    if (!ovladace.has(x.jm)) ovladace.set(x.jm, { recepty: new Map(), vListe: new Map(), vObsahu: new Map() });
    const z = ovladace.get(x.jm);
    if (!z.recepty.has(x.pismo)) z.recepty.set(x.pismo, `${s} „${x.text}"`);
    const kam = x.vListe ? z.vListe : z.vObsahu;
    if (!kam.has(x.pismo)) kam.set(x.pismo, `${s} „${x.text}"`);
    if (x.tridy.includes('btn-primary') || x.tridy.includes('btn-secondary')) {
      hlavni.push({ pismo: x.pismo, kde: `${s} „${x.text}"`, vListe: x.vListe });
    }
  }
}
await prohlizec.close();

/* 0) KAŽDÁ STRÁNKA ZE SEZNAMU MUSÍ DOJET. Jinak hlídač měří méně, než
   si myslí, a nikdo se to nedozví. */
pravda(`všech ${STRANKY.length} stránek ze seznamu dojelo`,
  nedojely.length === 0, nedojely.join('\n      '));

/* Kdyby se otisk nepovedl (prázdná stránka, spadlý server), nesmí
   zkouška projít na nule — jako test-najeti v CI 781. */
pravda(`otisk sebral dost ovladačů (${spocteno} na ${STRANKY.length} stránkách)`,
  spocteno >= 120, `naměřeno jen ${spocteno} — otisk se nepovedl, ne web je v pořádku`);

/* 1) ŘEZ HLAVNÍ AKCE. */
const lehka = hlavni.filter((x) => !/\/700$/.test(x.pismo));
pravda(`hlavní akce (.btn-primary, .btn-secondary) má řez 700 — ${hlavni.length} míst`,
  hlavni.length > 0 && lehka.length === 0,
  hlavni.length === 0 ? 'nenašlo se ani jedno hlavní tlačítko'
    : [...new Set(lehka.map((x) => `${x.pismo} ${x.vListe ? '(v liště) ' : ''}${x.kde}`))].join('\n      '));

/* 2) JEDEN RECEPT NA JMÉNO. */
const vic = [];
for (const [jm, z] of ovladace) {
  const vyjimka = DVA_RECEPTY.get(jm);
  if (vyjimka) {
    /* Dovolené recepty se jmenují ve výjimce. Cokoli dalšího je nález,
       i když třída výjimku má. */
    const navic = [...z.recepty].filter(([r]) => !vyjimka.recepty.includes(r));
    if (navic.length) {
      vic.push(`.${jm} smí mít jen ${vyjimka.recepty.join(' a ')} (${vyjimka.dovod}), ` +
        `ale má navíc ` + navic.map(([r, kde]) => `${r} (${kde})`).join('  |  '));
    }
    continue;
  }
  if (z.recepty.size <= 1) continue;
  vic.push(`.${jm} má ${z.recepty.size} receptů: ` +
    [...z.recepty].map(([r, kde]) => `${r} (${kde})`).join('  |  '));
}
pravda(`táž třída ovladače má jednu velikost a jeden řez — ${ovladace.size} tříd`,
  vic.length === 0, vic.join('\n      '));

/* 3) LIŠTA SE NESMÍ LIŠIT OD OBSAHU. */
const rozchod = [];
for (const [jm, z] of ovladace) {
  if (!z.vListe.size || !z.vObsahu.size) continue;
  const vL = new Set(z.vListe.keys());
  const spolecne = [...z.vObsahu.keys()].some((r) => vL.has(r));
  if (spolecne) continue;
  rozchod.push(`.${jm}: v liště ${[...z.vListe.keys()].join(', ')} ` +
    `(${[...z.vListe.values()][0]}), v obsahu ${[...z.vObsahu.keys()].join(', ')} ` +
    `(${[...z.vObsahu.values()][0]})`);
}
pravda('ovladač v liště má týž recept jako tentýž ovladač v obsahu',
  rozchod.length === 0, rozchod.join('\n      '));

console.log('\nJeden ovladač: velikost a řez písma na celém webu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jeden ovladač: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
