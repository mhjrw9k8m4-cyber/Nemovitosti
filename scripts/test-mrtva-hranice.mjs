// Test: žádný regulární výraz v repozitáři nemá MRTVOU HRANICI SLOVA.
//
// Spuštění: node scripts/test-mrtva-hranice.mjs   (nepotřebuje prohlížeč)
//
// CO JE MRTVÁ HRANICE. V JavaScriptu je `\b` definováno přes `\w`,
// a `\w` je jen [A-Za-z0-9_]. Písmeno s diakritikou do něj nepatří:
//
//     /\bstrojů\b/.test('souboru strojů,')   →  false
//     /\w/.test('ů')                          →  false
//
// Mezi „ů" a „," tedy žádná hranice slova není, protože ani jeden
// z nich není slovní znak. Vzor se nikdy nechytí — a protože se
// nechytí TIŠE, chová se jako kdyby ho tam nikdo nenapsal.
//
// PROČ TO MÁ VLASTNÍ ZKOUŠKU. Tenhle repozitář tu lekci zažil už
// třikrát a třikrát si ji zapsal do komentáře:
//   scripts/cesty-portalu.mjs:591  „můj výraz na ceny byl /\bKč\b/"
//   scripts/sonda-zdroju.mjs:55    „/\bKč\b/ nenajde nic"
//   scripts/test-stranky.mjs:329   „/\buž\b/ by nesedlo"
// A přesto se vada vrátila: v scripts/predpisy-zdroju.mjs stálo
// `/\bstroj(?:e|ů|ní zařízení)\b/`, kde hranice není za písmenem,
// ale za závorkou — takže se na ni nedalo přijít hledáním „znak
// s diakritikou a hned \b". Ostrý pokus na verejnedrazby.cz to
// odhalil až tím, že se dvě nabídky „souboru strojů" nezařadily
// jako movité věci a spadly do „nepoznáno".
//
// Zapsané pravidlo bez hlídky se vrátí. Tohle je ta hlídka.
//
// JAK SE TO POZNÁ. Pro každé `\b` ve zdroji se zjistí, co může stát
// bezprostředně PŘED ním:
//   písmeno         → vada, když to písmeno není \w (á, ů, č, …)
//   `)`             → nahlédne se do skupiny a vezme se poslední znak
//                     KAŽDÉ alternativy; stačí jedna s diakritikou
//   `]`             → nahlédne se do třídy znaků; stačí jeden znak
//                     s diakritikou v ní
//   `+ * ? }`       → kvantifikátor; hledá se dál před ním
//   `\w \d .` a dál → v pořádku
//
// ZNÁMÁ MEZ. Komentáře a řetězcové literály se vyhazují, jinak by
// zkouška hlásila ty tři komentáře výše jako vadu. Vzor složený
// z řetězce (`new RegExp('…\\b')`) proto nevidí; kolik takových
// míst v repozitáři je, měří poslední kontrola, aby se mez nedala
// tiše překročit.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/** Je ten znak slovní tak, jak to chápe `\b`? Jen [A-Za-z0-9_]. */
const slovni = (z) => /^[A-Za-z0-9_]$/.test(z);
/** Je to vůbec písmeno? Diakritika ano, závorka ne. */
const pismeno = (z) => /^\p{L}$/u.test(z);

/* Komentáře a řetězce pryč. Bez tohohle by zkouška našla vadu
   v komentářích, které o té vadě VYPRÁVĚJÍ — a to je přesně ten
   druh falešného nálezu, po kterém se hlídač vypne. */
export function bezKomentaruARetezcu(kod) {
  let s = String(kod || '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const ven = [];
  for (const radek of s.split('\n')) {
    /* Řetězce pryč dřív než `//`, aby „https://" nespolklo řádek. */
    let r = radek
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
    const i = r.indexOf('//');
    if (i !== -1) r = r.slice(0, i);
    ven.push(r);
  }
  return ven.join('\n');
}

/**
 * Co může stát bezprostředně před `\b` na pozici `i` (kde `i` míří na
 * zpětné lomítko). Vrátí pole znaků — u skupiny je jich víc, protože
 * každá alternativa může skončit jinak. Prázdné pole = nedá se zjistit
 * a mlčí se; radši nic než falešný nález.
 */
export function coStojiPred(s, i, hloubka = 0) {
  if (hloubka > 8) return [];
  let j = i - 1;
  if (j < 0) return [];

  /* KVANTIFIKÁTOR ROZHODUJE, JAK DALEKO SE MUSÍ HLEDAT. `\\w+` je
     povinné, takže hranici určuje ono. `\\w*` a `\\w?` ale můžou být
     PRÁZDNÉ — a pak hranici určuje to, co stojí před nimi. Právě na
     tomhle měření 6. 11. přistihlo vzor `/\\born[aáyeou]\\w*\\b/`:
     pro slovo „orná" je `\\w*` prázdné a hranice padne na „á", takže
     vzor na „orná půda" nesedne vůbec. Bez tohoto nahlédnutí by ho
     zkouška přešla. */
  let volitelne = false;
  if ('*?'.includes(s[j])) { volitelne = true; j--; }
  else if (s[j] === '+') j--;
  else if (s[j] === '}') {
    const k = s.lastIndexOf('{', j);
    if (k === -1) return [];
    volitelne = /^\{\s*0\s*[,}]/.test(s.slice(k, j + 1));
    j = k - 1;
  }
  if (j < 0) return [];
  const z = s[j];
  if (z === ')') {
    /* Odpovídající otvírací závorka; vnořené skupiny se počítají, nečtou. */
    let h = 0, zac = -1;
    for (let k = j; k >= 0; k--) {
      if (k >= 1 && s[k - 1] === '\\') continue;
      if (s[k] === ')') h++;
      else if (s[k] === '(') { h--; if (!h) { zac = k; break; } }
    }
    if (zac === -1) return [];
    const vnitr = s.slice(zac + 1, j).replace(/^\?(?::|<[=!]|[=!])/, '');
    const casti = [];
    let hh = 0, od = 0;
    for (let k = 0; k < vnitr.length; k++) {
      if (vnitr[k] === '\\') { k++; continue; }
      if (vnitr[k] === '(') hh++;
      else if (vnitr[k] === ')') hh--;
      else if (vnitr[k] === '|' && !hh) { casti.push(vnitr.slice(od, k)); od = k + 1; }
    }
    casti.push(vnitr.slice(od));
    const ven = casti.map((c) => c.trim()).filter((c) => c).map((c) => c[c.length - 1]);
    /* Prázdná alternativa (`(?:a|)`) dělá ze skupiny volitelnou. */
    const prazdna = casti.some((c) => !c.trim());
    return ven.concat(volitelne || prazdna ? coStojiPred(s, zac, hloubka + 1) : []);
  }

  if (z === ']') {
    const zac = s.lastIndexOf('[', j);
    if (zac === -1) return [];
    const ven = s.slice(zac + 1, j).split('');
    return ven.concat(volitelne ? coStojiPred(s, zac, hloubka + 1) : []);
  }

  /* `\\w`, `\\d`, `\\s` samy hranici neruší; když ale můžou být prázdné,
     rozhoduje to před nimi. */
  if (j >= 1 && s[j - 1] === '\\') return volitelne ? coStojiPred(s, j - 1, hloubka + 1) : [];
  if (z === '\\') return [];
  return [z].concat(volitelne ? coStojiPred(s, j, hloubka + 1) : []);
}

/**
 * Co může stát bezprostředně ZA `\b` na pozici `i` (první znak za
 * ním). Zrcadlo `coStojiPred`, jen o jednu stranu dál: hranice slova
 * je mezi dvěma znaky a mrtvá je, když ani jeden z nich není `\w`.
 * Skupina se čte po PRVNÍCH znacích alternativ, třída znaků celá.
 */
export function coStojiZa(s, i) {
  if (i >= s.length) return [];
  const z = s[i];

  if (z === '(') {
    /* Najdi odpovídající zavírací závorku; vnořené se počítají. */
    let h = 0, kon = -1;
    for (let k = i; k < s.length; k++) {
      if (s[k] === '\\') { k++; continue; }
      if (s[k] === '(') h++;
      else if (s[k] === ')') { h--; if (!h) { kon = k; break; } }
    }
    if (kon === -1) return [];
    const vnitr = s.slice(i + 1, kon).replace(/^\?(?::|<[=!]|[=!])/, '');
    const casti = [];
    let hh = 0, od = 0;
    for (let k = 0; k < vnitr.length; k++) {
      if (vnitr[k] === '\\') { k++; continue; }
      if (vnitr[k] === '(') hh++;
      else if (vnitr[k] === ')') hh--;
      else if (vnitr[k] === '|' && !hh) { casti.push(vnitr.slice(od, k)); od = k + 1; }
    }
    casti.push(vnitr.slice(od));
    return casti.map((c) => c.trim()).filter((c) => c).map((c) => c[0]);
  }

  if (z === '[') {
    const kon = s.indexOf(']', i + 1);
    if (kon === -1) return [];
    return s.slice(i + 1, kon).split('');
  }

  if (z === '\\') return [];          /* \w, \d, \s — ty jsou v pořádku */
  return [z];
}

/** Soubory ke kontrole: náš vlastní kód, ne cizí a ne data. */
function souboryKKontrole() {
  const ven = [];
  const vynech = new Set(['node_modules', '.git', 'data', 'dist', 'coverage', 'vendor']);
  const projdi = (dir) => {
    for (const jm of readdirSync(dir)) {
      if (vynech.has(jm)) continue;
      const p = path.join(dir, jm);
      const st = statSync(p);
      if (st.isDirectory()) projdi(p);
      else if (/\.(mjs|js)$/.test(jm) && !/\.min\.js$/.test(jm)) ven.push(p);
    }
  };
  projdi(KOREN);
  return ven;
}

/* VÝJIMKY S DOLOŽENÝM DŮVODEM. Dva soubory rozpoznávají druh a
   kategorii z textu, který si PŘEDEM zbaví diakritiky
   (`normalize('NFD')` a zahození znamének, js/druh.js:38). Do jejich
   vzorů se tedy „í" nikdy nedostane a `pol[eií]\b` tam nic nekazí:
   změřeno, že `zTextu('Prodej polí u Brna')` vrací „orná půda" a
   `zTextu('Prodej polívky')` správně null.
   Kdyby se tyhle soubory hlásily jako vada, zkouška by měla devět
   falešných nálezů ze čtrnácti — a hlídač, který křičí nadarmo, se
   vypne. Důvod se proto NEVĚŘÍ, ale ověřuje: zmizí-li normalizace,
   výjimka padá a zkouška spadne s ní. */
const VYJIMKY = [
  ['js/druh.js', 'vstup se normalizuje (NFD + zahození znamének), diakritika se do vzoru nedostane'],
  ['js/kategorie.js', 'staví na js/druh.js (bezJmen/srovnej), tedy na témže normalizovaném textu'],
  ['js/min/druh.js', 'minifikovaná kopie js/druh.js, generuje ji sestavení'],
  ['js/min/kategorie.js', 'minifikovaná kopie js/kategorie.js, generuje ji sestavení'],
];
const jeVyjimka = (rel) => VYJIMKY.some(([j]) => j === rel);

/* VÝJIMKY PRO DRUHOU STRANU (§460). Vzor na spisovou značku ÚZSVM
   má ve třídě i velká písmena s diakritikou (`[A-ZÁ-Ž]`), takže
   hlídač na něj ukáže. Měřeno 6. 11. na živých datech: značek je
   osm, VŠECHNY jsou ASCII (`EAS/CB/153/2026`, `EAS/ULT/113/2026`)
   a vzor na všech osmi sedne. Diakritika v té třídě je tedy pojistka
   na tvar, který zdroj neposílá — a oprava „na jistotu" by ten vzor
   rozbila: lookbehind `(?<![\p{L}])` před „Z" v „ÚZSVM" selže,
   protože „Ú" JE písmeno. Změřeno, ne odhadnuto. */
const VYJIMKY_ZA = [
  ['scripts/cti-uzsvm.mjs', 'SPISOVA_ZNACKA', 'všech 8 značek v datech je ASCII — změřeno'],
  ['scripts/nalezce.mjs', 'VZOR_SPISU', 'týž vzor jako SPISOVA_ZNACKA, táž míra'],
];
const jeVyjimkaZa = (rel, radek) => VYJIMKY_ZA.some(([f, jm]) => f === rel && radek.includes(jm));

const souborDruh = readFileSync(path.join(KOREN, 'js', 'druh.js'), 'utf8');
pravda('důvod výjimky platí: js/druh.js normalizuje vstup',
  souborDruh.includes("normalize('NFD')"),
  'v js/druh.js už není normalize(NFD) — výjimky pro druh a kategorii ztrácejí důvod');

const souborKat = readFileSync(path.join(KOREN, 'js', 'kategorie.js'), 'utf8');
pravda('důvod výjimky platí: js/kategorie.js staví na druh.js',
  souborKat.includes('PKDruh') && souborKat.includes('bezJmen'),
  'js/kategorie.js už nebere bezJmen z js/druh.js — výjimka ztrácí důvod');

const soubory = souboryKKontrole();
pravda('je co kontrolovat', soubory.length > 50, `souborů ${soubory.length}`);

const nalezy = [];
let retezcovychB = 0;
for (const p of soubory) {
  const rel = path.relative(KOREN, p);
  const puvodni = readFileSync(p, 'utf8');
  /* POČÍTÁ SE JEN SKUTEČNĚ SESTAVENÝ VZOR, tedy `\\\\b` na řádku
     s `RegExp(`. Kdyby se počítalo každé `\\\\b` v řetězci, byly by
     v tom i testovací vzorky téhle zkoušky, a strop by pak neměřil
     to, o čem mluví. */
  for (const r of puvodni.split('\n')) {
    if (r.includes('RegExp(')) retezcovychB += (r.match(/\\\\b/g) || []).length;
  }
  if (jeVyjimka(rel)) continue;
  const kod = bezKomentaruARetezcu(puvodni);
  const radky = kod.split('\n');
  for (let r = 0; r < radky.length; r++) {
    const radek = radky[r];
    for (let i = 0; i < radek.length - 1; i++) {
      if (radek[i] !== '\\' || radek[i + 1] !== 'b') continue;
      if (i >= 1 && radek[i - 1] === '\\') continue;      /* `\\b` je lomítko a b */
      let hlaseno = false;
      for (const z of coStojiPred(radek, i)) {
        if (pismeno(z) && !slovni(z)) {
          nalezy.push(`${path.relative(KOREN, p)}:${r + 1}:${i + 1} — „${z}" PŘED \\b: `
            + `${radek.trim().slice(0, 78)} → místo \\b použít (?![\\p{L}]) s flagou u`);
          hlaseno = true;
          break;
        }
      }
      /* A DRUHÁ STRANA TÉŽE PASTI (§460). `\b` se neřídí jen tím, co
         je PŘED ním — hranice je mezi dvěma znaky, takže stejně
         mrtvé je `\b` PŘED písmenem s diakritikou. Změřeno na jménech
         krajů: `/\bÚstecký\b/` nesedne ani zleva, protože „Ú" není
         `\w`. Tohle slepé místo měl hlídač sám: hlásil jen jednu
         stranu, a „Ústecký" tím propadl i po opravě druhé. */
      if (!hlaseno && !jeVyjimkaZa(rel, radek)) for (const z of coStojiZa(radek, i + 2)) {
        if (pismeno(z) && !slovni(z)) {
          nalezy.push(`${path.relative(KOREN, p)}:${r + 1}:${i + 1} — „${z}" ZA \\b: `
            + `${radek.trim().slice(0, 78)} → místo \\b použít (?<![\\p{L}]) s flagou u`);
          break;
        }
      }
    }
  }
}

/* A VÝJIMKA NESMÍ BÝT POHODLNÁ. Kdyby v odpuštěném souboru žádná
   mrtvá hranice nebyla, nemá tam výjimka co dělat — zůstala by
   ležet a jednoho dne by zakryla vadu, která přijde později. */
for (const [jm, duvod] of VYJIMKY) {
  let kod = '';
  try { kod = bezKomentaruARetezcu(readFileSync(path.join(KOREN, jm), 'utf8')); } catch { kod = ''; }
  let ma = false;
  for (let i = 0; i < kod.length - 1 && !ma; i++) {
    if (kod[i] !== '\\' || kod[i + 1] !== 'b') continue;
    if (i >= 1 && kod[i - 1] === '\\') continue;
    ma = coStojiPred(kod, i).some((z) => pismeno(z) && !slovni(z));
  }
  pravda(`výjimka ${jm} je ještě k něčemu`, ma, `nic k odpuštění — výjimku smazat (${duvod})`);
}

pravda('žádný výraz nemá mrtvou hranici slova', nalezy.length === 0,
  nalezy.length ? `${nalezy.length}×: ${nalezy.slice(0, 4).join(' | ')}` : '');

/* VLASTNÍ ROZPOZNÁVÁNÍ SE MUSÍ PROKÁZAT. Kdyby `coStojiPred` vracelo
   prázdno, zkouška by byla zelená a nic nehlídala — to je ta třída
   vady, kterou repozitář zná jako §438. Proto se na známých tvarech
   změří, že nález i mlčení fungují. */
const umi = (vzor, cekaSeNalez) => {
  const i = vzor.indexOf('\\b');
  const pred = i === -1 ? [] : coStojiPred(vzor, i);
  const nasel = pred.some((z) => pismeno(z) && !slovni(z));
  pravda(`rozpozná ${cekaSeNalez ? 'vadu' : 'dobrý vzor'}: ${vzor}`, nasel === cekaSeNalez,
    `před \\b stojí [${pred.join(',')}]`);
};
umi('strojů\\b', true);
umi('stroj(?:e|ů|ní zařízení)\\b', true);
umi('stroj[ůy]\\b', true);
umi('stroj[ůy]+\\b', true);
umi('Kč\\b', true);
umi('stroje\\b', false);
umi('stroj(?:e|y)\\b', false);
umi('stroj[ey]\\b', false);
umi('\\w\\b', false);
umi('stroj{2,3}\\b', false);
/* Volitelný kvantifikátor: hranice padá na to, co je PŘED ním. */
umi('orn[aáyeou]\\w*\\b', true);
umi('orn[aáyeou]\\w+\\b', false);
umi('stroj[ůy]?\\b', true);
umi('stroj(?:ů|)\\b', true);
umi('stroj\\w{0,3}\\b', false);
umi('strojů\\w{1,3}\\b', false);

/* A že se komentáře opravdu vyhazují — jinak by tři poznámky
   o téhle vadě dělaly z hlídače křiklouna, který se vypne. */
const vzorek = bezKomentaruARetezcu('/* výraz /\\bKč\\b/ nenajde nic */\nconst a = /\\bstroje\\b/;');
pravda('komentář o té vadě se nepočítá', !vzorek.includes('Kč'), vzorek.replace(/\n/g, '⏎'));
pravda('a kód na dalším řádku zůstane', vzorek.includes('stroje'), vzorek.replace(/\n/g, '⏎'));

/* MEZ, KTEROU ZKOUŠKA NEVIDÍ, A JEJÍ STROP. Vzory složené z řetězce
   (`new RegExp('\\\\b' + k + '\\\\b')`) se staticky rozhodnout nedají:
   hranice tam stojí kolem PROMĚNNÉ a co v ní bude, zkouška neví.
   Takových míst je dnes 61 a nejsou nevinná — v scripts/test-ceny.mjs
   se tak hledá jméno kraje a „Karlovarský" končí na „ý", takže ta
   hranice taky nesedne. Je to ale jiná práce než tenhle hlídač
   (vede se jako vlastní úkol), a aby se mezitím tiše nerozrostla,
   má strop. Když přibude další, zkouška spadne a donutí o něm
   rozhodnout. */
/* STROP JE 27 A TO ČÍSLO JE VLASTNÍ OPRAVA (§460). Stálo tu 61 —
   číslo z ručního grepu přes CELÉ soubory, kdežto hlídač počítá jen
   řádky s `RegExp(`. Mez byla tedy nastavená víc než dvojnásobně
   nad skutečností, takže nehlídala nic: sabotáž, která dvě sestavené
   hranice přidá, se pod ní schová. Měřeno 6. 11.: 27 výskytů ve 12
   souborech. Číslo 61 se navíc dostalo do zápisu §454 a §458 jako
   fakt — tam je opravené.
   PONAUČENÍ: mez se musí spočítat TÍM SAMÝM KÓDEM, který ji pak
   hlídá. Číslo spočítané jinak je domněnka, ne měření.
   Zbylých 27 je doloženo: vkládají se do nich jména SQL funkcí
   (50 hodnot), @keyframes (26), tříd v CSS (999), HTML značek
   a čísla — a ani jedno z nich není s diakritikou. Strop smí jen
   klesat. */
const STROP_RETEZCOVYCH = 27;
pravda('míst se sestavenou hranicí nepřibývá', retezcovychB <= STROP_RETEZCOVYCH,
  `nalezeno ${retezcovychB}, strop ${STROP_RETEZCOVYCH} — ta místa zkouška nevidí, `
  + 'nové se musí posoudit ručně (hranice kolem českého textu nesedne)');

/* ---- A DRUHÁ PODOBA TÉŽE PASTI: `\w` v českém vzoru (§458) ----
   `\b` není jediné, co se řídí `\w`. Samo `\w` taky — a `\w*` jako
   „zbytek českého slova" tedy neprojde přes diakritiku:

     /fotovoltaick\w* panel/i.test('fotovoltaických panelů')  → false
     /^\w+$/.test('ých')                                      → false

   Osmý ostrý pokus na to narazil u pěti nezařazených záznamů, které
   měly vlastní vzor v předpisu a přesto se nepoznaly. Náprava je
   `[\p{L}]` s flagou `u`.

   KRITÉRIUM je měřitelné, ne odhadnuté: vzor, který SÁM obsahuje
   písmeno s diakritikou, zjevně pracuje s češtinou. Má-li v sobě
   zároveň samostatné `\w` (ne uvnitř třídy, kde si autor diakritiku
   doplnil, jako `[\wá-ž]`), je to past. Vzor s flagou `u` se nepočítá
   — tam `\w` zůstává ASCII, ale autor o Unicode ví a `\p{L}` má
   po ruce. */
const DIAKRITIKA = /[áéíóúůýčďěňřšťžÁÉÍÓÚŮÝČĎĚŇŘŠŤŽ]/;
export function pastWVCestine(vzor) {
  const konec = vzor.lastIndexOf('/');
  const telo = konec > 0 ? vzor.slice(1, konec) : vzor;
  const flagy = konec > 0 ? vzor.slice(konec + 1) : '';
  if (flagy.includes('u')) return false;
  if (!DIAKRITIKA.test(telo)) return false;
  /* Třídy znaků vyhodit — `[\wá-ž]` je právě ta správná náprava. */
  const bezTrid = telo.replace(/\[(?:\\.|[^\]\\])*\]/g, '§');
  return /\\w/.test(bezTrid);
}

/* VÝJIMKA S DOLOŽENÝM DŮVODEM. U „nejmenší délk\w+ hesla" je
   diakritika PŘED `\w+` a koncovka je vždycky ASCII: změřeno, že
   „délka hesla", „délku hesla" i „délky hesla" sednou všechny tři.
   Vzor tedy funguje a hlásit ho by byl falešný poplach — a hlídač,
   který křičí nadarmo, se vypne. */
const VYJIMKY_W = [
  ['scripts/test-meze.mjs', 'nejmenší délk\\w+ hesla', 'koncovka je vždy ASCII (délka, délku, délky) — změřeno'],
];
const jeVyjimkaW = (rel, vzor) => VYJIMKY_W.some(([f, cast]) => f === rel && vzor.includes(cast));

const pasti = [];
for (const p of soubory) {
  const rel = path.relative(KOREN, p);
  if (jeVyjimka(rel)) continue;
  const kod = bezKomentaruARetezcu(readFileSync(p, 'utf8'));
  for (const [i, r] of kod.split('\n').entries()) {
    for (const m of r.matchAll(/\/(?![\/*])(?:\\.|\[[^\]]*\]|[^\/\\\n])+\/[a-z]*/g)) {
      if (pastWVCestine(m[0]) && !jeVyjimkaW(rel, m[0])) pasti.push(`${rel}:${i + 1} — ${m[0].slice(0, 80)}`);
    }
  }
}
pravda('žádný český vzor nestaví na \\w', pasti.length === 0,
  pasti.length ? `${pasti.length}×: ${pasti.slice(0, 3).join(' | ')} → místo \\w použít [\\p{L}] s flagou u` : '');

/* I tohle rozpoznávání se musí prokázat, jinak by mlčelo naprázdno. */
const umiW = (vzor, ceka) => pravda(`${ceka ? 'past' : 'v pořádku'}: ${vzor}`,
  pastWVCestine(vzor) === ceka, `vyšlo ${pastWVCestine(vzor)}`);
umiW('/fotovoltaick\\w* panel|\\bstřídač/i', true);
umiW('/fotovoltaick[\\p{L}]* panel|\\bstřídač/iu', false);
umiW('/kancelářsk\\w* vybaven/i', true);
umiW('/[\\wÁ-Žá-ž.-]*ulice/i', false);
umiW('/\\w+@\\w+\\.\\w+/', false);
umiW('/okres\\w* Brno/i', false);

/* A ROZPOZNÁVÁNÍ DRUHÉ STRANY (§460) se musí prokázat taky. */
const umiZa = (vzor, ceka) => {
  const i = vzor.indexOf('\\b');
  const za = i === -1 ? [] : coStojiZa(vzor, i + 2);
  const nasel = za.some((z) => pismeno(z) && !slovni(z));
  pravda(`${ceka ? 'vada' : 'v pořádku'} ZA \\b: ${vzor}`, nasel === ceka, `za \\b stojí [${za.join(',')}]`);
};
umiZa('\\bÚstecký', true);
umiZa('\\bÚ', true);
umiZa('\\b[ÚU]stecký', true);
umiZa('\\b(?:Ústecký|Praha)', true);
umiZa('\\bUstecky', false);
umiZa('\\b(?:Praha|Brno)', false);
umiZa('\\b[Uu]stecky', false);
umiZa('\\bstroj', false);
umiZa('\\b\\w+', false);

console.log('\\nMrtvá hranice slova:');
for (const z of zpravy) console.log(z);
console.log(`\n  ${ok} v pořádku, ${chyb} chyb`);
if (pasti.length) {
  console.log('\nČESKÉ VZORY NA \\w (§458):');
  for (const z of pasti) console.log('  ' + z);
}
if (nalezy.length) {
  console.log('\nVŠECHNY NÁLEZY:');
  for (const n of nalezy) console.log('  ' + n);
}
if (chyb) {
  console.log(`::error::Mrtvá hranice slova: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`);
  process.exit(1);
}
