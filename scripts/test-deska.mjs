// Test: deska se na celém webu kreslí jedním receptem.
//
// Spuštění: node scripts/test-deska.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Zaoblení OVLADAČŮ hlídá test-zaobleni
// a tvary test-tvary — ale desky (karty, panely, okna, mapy) nehlídal
// nikdo. Otisk 18 typů stránek 29. 10. našel, jak se to bez hlídače
// rozjede: desky ve ČTYŘECH zaobleních (0, 10, 14, 20 px), rámy ve
// TŘECH silách (0,14 / 0,28 / 0,55) a stíny ve ČTYŘECH podobách
// (žádný / e1 / e2 / e3) — a míchalo se to v jedné roli na jedné
// stránce: na inzerátu stála poznámka na 10 px pod kartou s cenou
// na 14, mapa měla stín pro „zvednuté" a vedle ní karta pro „klidné".
//
// RECEPT, KTERÝ SE TU HLÍDÁ:
//   • DESKA (má vlastní plochu a rám nebo stín) = zaoblení --r-plocha;
//   • DROBNOST uvnitř desky (odznak, štítek, náhled — nižší než
//     DROBNOST_V px) smí mít --r-drobnost nebo pilulku;
//   • RÁM desky má jednu sílu: --line. Výjimky se jmenují níž a každá
//     má napsaný důvod;
//   • STÍN: na stránce --e1, nad obsahem --e3. Pro --e2 je místo jen
//     při najetí myší (zvednutí), což se tady neměří — měří se klid.
//   • NULA je v pořádku u pruhu UVNITŘ desky (legenda v mapě, panel
//     pod mapou): rodič ho ořízne, takže vlastní zaoblení by nebylo
//     vidět. Poznáme ho podle toho, že má jen border-top/bottom.
//
// Měří se VYKRESLENÁ hodnota, ne zápis ve stylopisu.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { adresaPozemku } from './adresa-pozemku.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Jedna deska', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Hodnoty se čtou ze stylopisu, ne opisují: kdyby se --r-plocha jednou
   změnilo, zkouška se má přizpůsobit, ne spadnout. */
const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const cti = (jm) => {
  const m = css.match(new RegExp('--' + jm + ':\\s*([^;]+);'));
  return m ? m[1].trim() : null;
};
const zebrik = { 'var(--r-sm)': 10, 'var(--r-md)': 14, '10px': 10, '14px': 14 };
const R_PLOCHA = zebrik[cti('r-plocha')] ?? 14;
const R_DROBNOST = zebrik[cti('r-drobnost')] ?? 10;
const DROBNOST_V = 44;   // vyšší prvek už není odznak, ale deska

/* VÝJIMKY. Píše se sem jméno a důvod — ne aby se dalo pravidlo obejít,
   ale aby se u každé dalo přečíst, proč platí. */
const JINY_RAM = new Set([
  /* Věta „levnější než 97 % pozemků" pod cenou v tipu nese zeleň
     značky jako ozdobu dobré zprávy, ne jako rám desky. Je to
     poznámka uvnitř karty, ne vlastní deska.
     (Do 2. 11. se ta třída jmenovala .deal-badge a stála nad jménem
     obce; při sjednocení tipu s kartou ve výpisu se přesunula pod
     cenu a přejmenovala. Důvod výjimky se nezměnil, jen jméno.) */
  'deal-verdikt',
  /* Nápověda „vyberte kraj" sedí NAD mapou a zelený rám ji k mapě váže. */
  'kraj-hint',
]);
/* ODSAZENÍ: deska má 16 px. Výjimky mají jméno a důvod. */
const PAD_DESKA = 16;
const JINY_PAD = new Map([
  /* Prázdný stav je vycentrovaný a schválně vzdušný — ať je poznat, že
     tam nic není, a ne že se to nenačetlo. Obě místa mají touž míru. */
  ['odl-wrap', '32px 20px'], ['odl-empty', '32px 20px'], ['pf-empty', '32px 20px'],
  /* Přihlašovací karta stojí sama uprostřed stránky místo obsahu. */
  ['auth-card', '32px 28px'],
  /* Pruh se záložkami: odsazení je lůžko pro zapnutou záložku, ne
     odsazení obsahu. */
  ['auth-tabs', '4px'],
]);
const MIMO = new Set([
  /* Leafletové prvky kreslí knihovna, ne náš stylopis. */
  'leaflet-popup-content-wrapper', 'leaflet-control-zoom', 'leaflet-tooltip',
]);

const STRANKY = ['index.html', 'cena-pozemku.html', 'hlidani.html', 'porovnani.html',
  'pridat.html', 'moje-data.html', 'kontakt.html', 'data.html', 'drazby-pozemku.html',
  'muj-inzerat.html', 'zpravy.html', 'nove-pozemky.html', 'pozemky-okres-zlin.html',
  'pozemky-jihomoravsky-kraj.html', 'inzerce.html', '404.html',
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
  viewport: { width: 1280, height: 900 }, locale: 'cs-CZ' });
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
const desky = new Map();
const karty = new Map();
const kartyNabidky = new Map();
/* ZELENÁ PLOCHA MÁ PŘELIV ZNAČKY — sbírá se při témž průchodu.
   Majitel 1. 11.: „všechny zelené věci jako má naše ikonka ten přechod,
   udělej to na všech tlačítkách." Naměřeno tehdy 17 druhů zelených
   ploch, z nichž 4 přeliv neměly (.skip-link, .as-num, .zp-btn,
   .st-btn-1) — a dvě z nich ho nedostaly ani po vypsání do seznamu
   selektorů, protože je přebíjel shorthand `background:` (u .as-num
   pravidlo s vyšší specifičností, u .zp-btn vložený styl zpravy.html,
   který stojí za stylopisem). Právě proto se to měří v PROHLÍŽEČI
   a ne grepem: v souboru to vypsané bylo, na obrazovce ne.
   Plochy menší než 26 px se nepočítají — tečky, špendlíky a 1px pruhy
   zůstávají ploché schválně (ze tří zarážek by na nich byl šum). */
const zelenePlochy = [];
for (const s of STRANKY) {
  await p.goto(BASE + '/' + s, { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(2000);
  for (const z of await p.evaluate(() => {
    const brand = (c) => { const m = String(c).match(/\d+/g); if (!m || m.length < 3) return false;
      if (m.length > 3 && Number(m[3]) === 0) return false;
      const [r, g, b] = m.map(Number);
      return g > r + 12 && g > b + 4 && g < 160 && r < 120; };
    const out = [];
    for (const e of document.querySelectorAll('*')) {
      if (e.offsetParent === null) continue;
      const rc = e.getBoundingClientRect();
      if (rc.width < 26 || rc.height < 26) continue;
      const cs = getComputedStyle(e);
      if (!brand(cs.backgroundColor)) continue;
      out.push({ kdo: (e.tagName + '.' + String(e.className || '').trim().split(/\s+/).slice(0, 2).join('.')).slice(0, 44),
        preliv: /gradient/.test(cs.backgroundImage) });
    }
    return out;
  })) zelenePlochy.push(Object.assign({ stranka: s }, z));
  const nalez = await p.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('div,section,article,aside,li,form,details,header,footer,nav,table')) {
      const rc = e.getBoundingClientRect();
      if (rc.width < 60 || rc.height < 24) continue;
      const cs = getComputedStyle(e);
      const ramy = ['Top', 'Right', 'Bottom', 'Left'].map((k) => parseFloat(cs['border' + k + 'Width']) || 0);
      const maRam = ramy.some((x) => x > 0);
      const celyRam = ramy.every((x) => x > 0);
      const maStin = cs.boxShadow && cs.boxShadow !== 'none';
      const prusvitna = cs.backgroundColor === 'rgba(0, 0, 0, 0)';
      if (!maRam && !maStin) continue;
      if (prusvitna && !maStin) {
        /* Bez vlastní plochy a bez stínu to není deska, ale linka. */
        if (!celyRam) continue;
      }
      const tridy = (e.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      out.push({
        jm: tridy.length ? tridy[0] : e.tagName.toLowerCase(),
        tridy,
        z: Math.round(parseFloat(cs.borderTopLeftRadius) || 0),
        v: Math.round(rc.height),
        celyRam, prusvitna,
        padT: Math.round(parseFloat(cs.paddingTop) || 0),
        padL: Math.round(parseFloat(cs.paddingLeft) || 0),
        ram: maRam ? cs.borderTopColor : null,
        ramSila: ramy[0],
        /* Plocha a styl rámu: podle nich se pozná RODINA KARET (oddíl 5).
           Bez nich by se do ní počítal i vsazený pruh na tlumené ploše
           nebo čárkovaný obrys prázdného stavu. */
        plocha: cs.backgroundColor,
        styl: cs.borderTopStyle,
        stin: maStin ? cs.boxShadow : 'bez',
      });
    }
    return out;
  }).catch(() => []);
  for (const x of nalez) if (!desky.has(x.jm)) desky.set(x.jm, { ...x, kde: s });
  /* DRUHÝ SBĚR: KARTY. Sada výš schválně nesahá na <button> a <a> —
     ovladače mají vlastní pravidla a hlídá je „Jeden ovladač". Jenže
     karta tipu JE <button> (klikne se celá), takže do sady výš nikdy
     nespadla: hlídač ji neviděl vůbec. Karty se proto sbírají zvlášť
     a ptají se jen na recept deskové plochy, kterému ovladač neodpoví
     (jeho rám je zelený, ne --line). */
  for (const x of await p.evaluate(() => {
    const out = [];
    for (const e of document.querySelectorAll('div,section,article,aside,li,button,a')) {
      const rc = e.getBoundingClientRect();
      if (rc.width < 60 || rc.height < 40) continue;
      const cs = getComputedStyle(e);
      if (cs.borderTopStyle !== 'solid') continue;
      if (cs.backgroundColor === 'rgba(0, 0, 0, 0)') continue;
      const tridy = (e.getAttribute('class') || '').split(/\s+/).filter(Boolean);
      out.push({ jm: tridy.length ? tridy[0] : e.tagName.toLowerCase(),
        z: Math.round(parseFloat(cs.borderTopLeftRadius) || 0),
        ramSila: Math.round(parseFloat(cs.borderTopWidth) || 0),
        ram: cs.borderTopColor, plocha: cs.backgroundColor,
        stin: (cs.boxShadow && cs.boxShadow !== 'none') ? cs.boxShadow : 'bez' });
    }
    return out;
  }).catch(() => [])) if (!karty.has(x.jm)) karty.set(x.jm, { ...x, kde: s });

  /* KARTA NABÍDKY SE OD 12. 11. SBÍRÁ ZVLÁŠŤ A PODLE JMÉNA.
     Sběr výš se ptá na recept DESKOVÉ PLOCHY (plný rám a neprůhledná
     výplň) — a karta nabídky ani karta tipu už deska nejsou: majitel
     poslal snímek Sreality se zadáním „všude extrémně moc oddělení
     a orámování", takže rám, stín i bílou plochu nesou obě karty
     pryč a zaoblení drží fotka. Pro sběr výš tím přestaly existovat
     a obě kontroly o kus níž spadly na „není k nalezení" — ne proto,
     že by se web rozešel, ale proto, že měřítko zestárlo s ním.
     Hledají se proto podle svých jmen a čte se z nich to, co je dnes
     dělá stejnými: že ani jedna nemá desku (plocha, rám, stín) a že
     zaoblení nesou obě na fotce. */
  for (const x of await p.evaluate(() => {
    const out = [];
    for (const [jm, sel] of [['opp-item', '#opp-list .opp-item'], ['deal-card', '.deal-card']]) {
      const e = document.querySelector(sel);
      if (!e) continue;
      const cs = getComputedStyle(e);
      const f = e.querySelector('.opp-media');
      const fs = f ? getComputedStyle(f) : null;
      out.push({ jm,
        plocha: cs.backgroundColor,
        ramSila: Math.round(parseFloat(cs.borderTopWidth) || 0),
        stin: (cs.boxShadow && cs.boxShadow !== 'none') ? cs.boxShadow : 'bez',
        zFotky: fs ? Math.round(parseFloat(fs.borderTopLeftRadius) || 0) : -1,
        stinFotky: fs && fs.boxShadow && fs.boxShadow !== 'none' ? fs.boxShadow : 'bez' });
    }
    return out;
  }).catch(() => [])) if (!kartyNabidky.has(x.jm)) kartyNabidky.set(x.jm, { ...x, kde: s });
}
await prohlizec.close();

/* Barvy tokenů se čtou tak, jak je vykreslí prohlížeč: ze stylopisu je
   to rgba(var(--text-rgb),0.14), na obrazovce rgba(16, 21, 19, 0.14). */
const sily = new Map();
for (const [, d] of desky) if (d.ram && d.celyRam) sily.set(d.ram, (sily.get(d.ram) || 0) + 1);
const nejcastejsiRam = [...sily].sort((a, b) => b[1] - a[1])[0];

/* --- zelené plochy: přeliv značky na všech ------------------------- */
{
  const bez = zelenePlochy.filter((x) => !x.preliv);
  const druhy = new Set(zelenePlochy.map((x) => x.kdo));
  pravda(`je co měřit — zelených ploch: ${zelenePlochy.length} v ${druhy.size} druzích`,
    druhy.size >= 8, 'zelených ploch se našlo málo, kontrola pod tím nic nedokazuje');
  const seznam = [...new Set(bez.map((x) => x.kdo + ' (' + x.stranka + ')'))];
  pravda('každá zelená plocha nese přeliv značky', bez.length === 0,
    'bez přelivu: ' + seznam.slice(0, 6).join('; ')
      + ' — pozor na shorthand `background:`, ten přeliv shodí');
}

pravda('je co měřit — desky na všech typech stránek',
  desky.size >= 30, `naměřeno jen ${desky.size} desek`);

/* 1) ZAOBLENÍ */
const zleZaobleni = [];
for (const [jm, d] of desky) {
  if (MIMO.has(jm)) continue;
  if (d.z === 999 || d.z >= d.v / 2) continue;                 // pilulka
  if (!d.celyRam && d.z === 0) continue;                       // pruh uvnitř desky
  if (d.v <= DROBNOST_V && d.z === R_DROBNOST) continue;       // drobnost
  if (d.z === R_PLOCHA) continue;
  zleZaobleni.push(`${jm} ${d.z} px (vysoká ${d.v}, ${d.kde})`);
}
pravda(`každá deska má zaoblení ${R_PLOCHA} px (drobnost do ${DROBNOST_V} px smí ${R_DROBNOST})`,
  zleZaobleni.length === 0, zleZaobleni.join('\n      '));

/* 2) RÁM */
const zleRam = [];
for (const [jm, d] of desky) {
  if (MIMO.has(jm) || !d.celyRam) continue;
  if (d.tridy.some((t) => JINY_RAM.has(t))) continue;
  if (d.ram === nejcastejsiRam[0]) continue;
  zleRam.push(`${jm} má rám ${d.ram} místo ${nejcastejsiRam[0]} (${d.kde})`);
}
pravda(`rám desky má jednu sílu (${nejcastejsiRam[0]}, nese ji ${nejcastejsiRam[1]} desek)`,
  zleRam.length === 0, zleRam.join('\n      '));

/* 3) ODSAZENÍ. Kontejner, jehož děti nesou odsazení samy (karta
   s fotkou, tabulka, mapa), má nulu — to je v pořádku a pozná se tak,
   že je nulové ze všech stran. */
const zlePad = [];
for (const [jm, d] of desky) {
  if (MIMO.has(jm)) continue;
  if (d.z === 999 || d.z >= d.v / 2) continue;
  if (!d.celyRam && d.z === 0) continue;
  if (d.padT === 0 && d.padL === 0) continue;
  /* JEDNOŘÁDKOVÝ PROUŽEK NE. Odznak zdroje a nápověda nad mapou jsou
     vysoké jeden řádek; 16 px nahoře i dole by z nich udělalo desku
     dvakrát vyšší, než je text v nich. Odsazení se u nich řídí výškou,
     ne touhle mírou — a že jsou to opravdu proužky, hlídá ta výška. */
  if (d.v <= DROBNOST_V) continue;
  const vyjimka = d.tridy.map((t) => JINY_PAD.get(t)).find(Boolean);
  if (vyjimka) continue;
  if (d.padT === PAD_DESKA && d.padL === PAD_DESKA) continue;
  zlePad.push(`${jm} má ${d.padT}/${d.padL} px (${d.kde})`);
}
pravda(`odsazení uvnitř desky je ${PAD_DESKA} px (nebo nula u kontejneru)`,
  zlePad.length === 0, zlePad.join('\n      '));

/* 4) STÍN. Měří se jen to, že se nemíchají DVA klidové stíny: na
   stránce jeden, nad obsahem druhý. Který je který, se pozná podle
   rozostření — čím výš prvek plave, tím je stín větší. */
const stiny = new Map();
for (const [, d] of desky) if (d.stin !== 'bez') stiny.set(d.stin, (stiny.get(d.stin) || 0) + 1);
pravda('klidové stíny jsou nejvýš dva (deska na stránce a deska nad obsahem)',
  stiny.size <= 2, [...stiny].map(([s, n]) => `${n}× ${s.slice(0, 60)}`).join('\n      '));

/* 5) KARTA TIPU JE TÁŽ DESKA JAKO KARTA VE VÝPISU.
   ------------------------------------------------------------------
   Oddíly 1–4 měří ROZMANITOST: kolik zaoblení, kolik sil rámu, kolik
   receptů stínu. Ani jeden se neptá, jestli karta svůj stín VŮBEC má —
   a to je slepé místo, které bylo prokázáno sabotáží: po odebrání
   `box-shadow:var(--e1)` kartě tipu zůstalo všech sedm kontrol
   zelených, protože receptů stínu tím ubylo, ne přibylo.
   A byla v tom druhá, horší vada: sada prvků výš sahá na
   `div,section,article,…`, ale NE na <button> — zatímco karta tipu
   <button> je, protože se na ni klepne celá. Hlídač ji tedy neviděl
   vůbec, ať by měla cokoli.
   CO SE TEDY MĚŘÍ: že karta tipu nese TÝŽ recept jako karta ve výpisu.
   To není nový vzhledový nápad, ale rozhodnutí z §199 a §277 („jedna
   karta nabídky pro výpis, tipy i hlídání") — tahle kontrola ho jen
   drží. Modelem je .opp-item, ta deska, podle které se srovnával celý
   web (§151); recept se z ní ČTE, místo aby se opisoval, takže se
   nerozejde ani při změně tokenu.
   PROČ NE OBECNÉ „každá bílá deska musí mít stín": změřeno 11. 11. na
   všech typech stránek — z 25 neprůhledných desek s plným rámem jich
   10 stín nemá a není to vada. Čtyři stojí na tlumené ploše
   (.auth-tabs, .md-vse, .pzm-zaklad, .add-cross), tedy vsazené prvky,
   a šest je bílý panel, který plavat nemá (.aside-card, .pz-gtk,
   .pz-sour, .md-radek, .por-tab-obal, .dt-tab-obal). Takové pravidlo
   by nehlídalo vzhled, ale přemalovalo šest míst — a to je rozhodnutí
   o vzhledu, ne hlídač. */
const model = kartyNabidky.get('opp-item');
pravda('karta výpisu (.opp-item) je k nalezení — je podle čeho měřit',
  !!model, 'bez .opp-item nemá oddíl 5 model a tvrzení o kartě tipu by bylo prázdné');
const tip = kartyNabidky.get('deal-card');
pravda('karta tipu (.deal-card) je k nalezení — tipy se opravdu vykreslily',
  !!tip, 'bez karty tipu by kontrola níž prošla o prázdnu');
/* ANTI-PRÁZDNO: srovnání níž je rovnost, a rovnost dvou nul projde
   i tehdy, když by se karta nevykreslila vůbec nebo kdyby fotka
   přišla o zaoblení. Model proto musí napřed prokázat, že zaoblení
   NA FOTCE opravdu je — to je ta vlastnost, která po zrušení desky
   drží tvar nabídky pohromadě. */
if (model) pravda(`a zaoblení nese fotka (${model.zFotky} px), ne deska`,
  model.zFotky >= 8, `fotka karty má zaoblení ${model.zFotky} px — nabídka pak není jeden tvar`);
if (model && tip) {
  const recept = (d) => `plocha ${d.plocha}, rám ${d.ramSila}px, stín ${d.stin}, `
    + `fotka: zaoblení ${d.zFotky} px, stín ${d.stinFotky}`;
  for (const [co, klic] of [['tutéž plochu', 'plocha'], ['tutéž sílu rámu', 'ramSila'],
    ['tentýž klidový stín', 'stin'], ['totéž zaoblení fotky', 'zFotky'],
    ['tentýž klidový stín fotky', 'stinFotky']]) {
    pravda(`karta tipu má ${co} jako karta ve výpisu`,
      String(tip[klic]) === String(model[klic]),
      `výpis: ${recept(model)}\n      tip:   ${recept(tip)}`);
  }
}

console.log('\nJedna deska: zaoblení, rám a stín na celém webu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Jedna deska: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
