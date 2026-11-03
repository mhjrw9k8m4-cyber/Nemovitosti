/* Čtení textu z PDF — bez jediné nové závislosti
   ==================================================================
   PROČ TENHLE SOUBOR VZNIKL. Sonda podmínek skončila 3. 11. u tří
   zdrojů na odkazu: „text se nejspíš vykresluje až v prohlížeči nebo
   je v odkazovaném dokumentu". U Bezrealitek je to pět PDF, u
   elektronickedrazby.cz dražební řád, u verejnedrazby.cz tři přílohy.
   Dokud je nepřečteme, je odpověď na majitelovu otázku („smělo by se
   to čist?") nedokončená — a odkaz na PDF není odpověď, je to domácí
   úkol pro člověka.

   ŽÁDNÁ NOVÁ ZÁVISLOST. Dekomprese je zlib, který je v Node; ostatní
   je čtení struktury. Balíček na PDF by znamenal cizí kód v nočním
   robotu, a to kvůli třem dokumentům nestojí za riziko.

   CO TAHLE ČTEČKA UMÍ, A CO NE — a je to podstatné, protože PDF je
   formát pro tisk, ne pro čtení strojem:
     · umí nekomprimovaný text i FlateDecode,
     · umí `ToUnicode` CMap (bfchar i bfrange), tedy i fonty
       Identity-H, kterými se česká diakritika sází nejčastěji,
     · u jednobajtových fontů bez CMap zkusí cp1250 (středoevropské
       Windows) — to je u českých PDF nejčastější volba,
     · NEUMÍ naskenovaný papír (tam žádný text není, jen obrázek),
       šifrovaná PDF ani exotické kódování.

   A PROTO SE ČITELNOST MĚŘÍ. Špatně dekódovaný text není prázdný, je
   to mojibake — a ten by sítem na zákazy propadl jako „nic o automatu
   se nenašlo", což by byla lež. `citelnost()` proto vrací podíl znaků,
   které v českém textu mít smysl mohou, a volající se podle něj
   rozhoduje. Lepší přiznat „nepřečetli jsme to" než tvrdit verdikt
   z rozsypaného čaje.
   ================================================================== */
import { inflateSync, inflateRawSync } from 'node:zlib';

/** Strop na velikost dokumentu. Větší se nečte — robot není archiv. */
export const STROP_PDF = 8 * 1024 * 1024;
/** Strop na délku vytaženého textu (podmínky bývají do 100 kB). */
export const STROP_TEXTU = 400000;

/* cp1250 (středoevropské Windows) pro bajty 0x80–0xFF. Prázdné místo
   znamená „v téhle tabulce nic není" — nevymýšlí se náhrada. */
const CP1250 = (
  '€ ‚ „…†‡ ‰Š‹ŚŤŽŹ'
  + ' ‘’“”•–— ™š›śťžź'
  + ' ˇ˘Ł¤Ą¦§¨©Ş«¬­®Ż'
  + '°±˛ł´µ¶·¸ąş»Ľ˝ľż'
  + 'ŔÁÂĂÄĹĆÇČÉĘËĚÍÎĎ'
  + 'ĐŃŇÓÔŐÖ×ŘŮÚŰÜÝŢß'
  + 'ŕáâăäĺćçčéęëěíîď'
  + 'đńňóôőö÷řůúűüýţ˙'
).split('');

/** Podíl znaků, které v českém textu smysl mít mohou (0–1). */
export function citelnost(text) {
  const s = String(text || '');
  if (!s.length) return 0;
  let dobre = 0;
  for (const ch of s) {
    if (/[\p{L}\p{N}\s.,;:!?()[\]{}'"„“”–—/\\%§@+*=<>&#$€Kč°|~^`-]/u.test(ch)) dobre++;
  }
  return dobre / [...s].length;
}

/* ---- struktura PDF ----------------------------------------------- */

/** Všechny `stream … endstream` bloky s hlavičkou slovníku před nimi. */
function streamy(buf) {
  const ven = [];
  const sig = Buffer.from('stream');
  const end = Buffer.from('endstream');
  let i = 0;
  while (i < buf.length) {
    const a = buf.indexOf(sig, i);
    if (a < 0) break;
    const b = buf.indexOf(end, a);
    if (b < 0) break;
    /* SLOVNÍK JE JEN TEN BEZPROSTŘEDNĚ PŘED `stream`, a to se musí
       uříznout. Napoprvé jsem bral prostě 600 bajtů dozadu — a u
       objektu, před kterým ležel komprimovaný CMap, se do okna vešlo
       CIZÍ `/Filter /FlateDecode`. Nekomprimovaný obsah se pak marně
       rozbaloval, vrátil null a celý text vyšel prázdný. Řeže se tedy
       po poslední značce ` obj`, jinak po posledním `<<`. */
    let hlava = buf.slice(Math.max(0, a - 2000), a).toString('latin1');
    const iObj = hlava.lastIndexOf(' obj');
    if (iObj >= 0) hlava = hlava.slice(iObj);
    else { const iDict = hlava.lastIndexOf('<<'); if (iDict >= 0) hlava = hlava.slice(iDict); }
    let s = a + sig.length;
    if (buf[s] === 0x0d) s++;
    if (buf[s] === 0x0a) s++;
    let e = b;
    while (e > s && (buf[e - 1] === 0x0a || buf[e - 1] === 0x0d)) e--;
    ven.push({ hlava, telo: buf.slice(s, e) });
    i = b + end.length;
  }
  return ven;
}

/** Rozbalí stream, když je komprimovaný. Co nejde, se zahodí. */
function rozbal(s) {
  if (!/\/FlateDecode/.test(s.hlava)) return s.telo;
  try { return inflateSync(s.telo); } catch { /* zkusí se raw */ }
  try { return inflateRawSync(s.telo); } catch { return null; }
}

/* ---- ToUnicode CMap ---------------------------------------------- */

/**
 * Z CMap udělá tabulku kód → znak.
 * Čte `beginbfchar` (dvojice) i `beginbfrange` (rozsahy i seznamy).
 */
export function cmapZTextu(text) {
  const t = String(text || '');
  const mapa = new Map();
  const hexNaZnak = (h) => {
    const cisty = h.replace(/[^0-9a-fA-F]/g, '');
    let out = '';
    for (let i = 0; i + 3 < cisty.length + 1; i += 4) {
      const k = parseInt(cisty.slice(i, i + 4), 16);
      if (Number.isFinite(k)) out += String.fromCharCode(k);
    }
    return out;
  };
  for (const m of t.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) {
    for (const d of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      mapa.set(parseInt(d[1], 16), hexNaZnak(d[2]));
    }
  }
  for (const m of t.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) {
    /* Rozsah s jedním cílem: <od> <do> <cíl> */
    for (const d of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]*)>/g)) {
      const od = parseInt(d[1], 16), doo = parseInt(d[2], 16);
      const zaklad = parseInt(d[3].replace(/[^0-9a-fA-F]/g, '').slice(0, 4) || '0', 16);
      if (!Number.isFinite(od) || !Number.isFinite(doo) || doo - od > 65535) continue;
      for (let k = od; k <= doo; k++) mapa.set(k, String.fromCharCode(zaklad + (k - od)));
    }
    /* Rozsah se seznamem: <od> <do> [ <a> <b> … ] */
    for (const d of m[1].matchAll(/<([0-9a-fA-F]+)>\s*<([0-9a-fA-F]+)>\s*\[([\s\S]*?)\]/g)) {
      const od = parseInt(d[1], 16);
      const prvky = [...d[3].matchAll(/<([0-9a-fA-F]*)>/g)].map((x) => hexNaZnak(x[1]));
      prvky.forEach((z, i) => mapa.set(od + i, z));
    }
  }
  return mapa;
}

/* ---- text z obsahového streamu ----------------------------------- */

/** Rozebere PDF řetězec `( … )` na bajty (včetně escapů a osmičkových). */
function bajtyZRetezce(s) {
  const out = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c !== '\\') { out.push(s.charCodeAt(i) & 0xff); continue; }
    const d = s[++i];
    if (d === undefined) break;
    if (d === 'n') out.push(10);
    else if (d === 'r') out.push(13);
    else if (d === 't') out.push(9);
    else if (d === 'b') out.push(8);
    else if (d === 'f') out.push(12);
    else if (d >= '0' && d <= '7') {
      let o = d;
      while (o.length < 3 && s[i + 1] >= '0' && s[i + 1] <= '7') o += s[++i];
      out.push(parseInt(o, 8) & 0xff);
    } else if (d === '\n') { /* pokračování řádku — nic */ }
    else out.push(s.charCodeAt(i) & 0xff);
  }
  return out;
}

/** Bajty → text podle CMap (dvoubajtové kódy) nebo cp1250. */
function dekoduj(bajty, cmap) {
  if (cmap && cmap.size) {
    /* Identity-H a spol. mají kódy po dvou bajtech. */
    let out = '';
    for (let i = 0; i + 1 < bajty.length; i += 2) {
      const k = (bajty[i] << 8) | bajty[i + 1];
      const z = cmap.get(k);
      out += z != null ? z : '�';
    }
    if (bajty.length % 2) {
      const z = cmap.get(bajty[bajty.length - 1]);
      if (z != null) out += z;
    }
    return out;
  }
  let out = '';
  for (const b of bajty) {
    if (b < 0x80) out += String.fromCharCode(b);
    else out += (CP1250[b - 0x80] || '�');
  }
  return out;
}

/**
 * Text z jednoho obsahového streamu.
 * `najdiCmap(jmenoFontu)` vrací tabulku, nebo null. Je to FUNKCE, ne
 * mapa, schválně: dokument s jedinou sadou písem vrací tutéž tabulku
 * pro každé jméno, a tenhle rozdíl nemá do čtení obsahu prosakovat.
 */
export function textZObsahu(obsah, najdiCmap) {
  const t = String(obsah || '');
  let aktivni = null;
  const kusy = [];
  /* Jediný průchod přes operátory, které nás zajímají: výběr fontu,
     řetězce a odřádkování. Pořadí v textu rozhoduje, proto jeden
     regulární výraz se střídáním, ne několik průchodů. */
  const re = /\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|\(((?:\\.|[^\\()])*)\)\s*(Tj|TJ|'|")|<([0-9a-fA-F\s]*)>\s*(Tj|TJ)|(T\*|TD|Td|ET)/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1] !== undefined) { aktivni = (najdiCmap && najdiCmap(m[1])) || null; continue; }
    if (m[2] !== undefined) { kusy.push(dekoduj(bajtyZRetezce(m[2]), aktivni)); continue; }
    if (m[4] !== undefined) {
      const h = m[4].replace(/\s+/g, '');
      const b = [];
      for (let i = 0; i + 1 < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
      kusy.push(dekoduj(b, aktivni));
      continue;
    }
    if (m[6] !== undefined) kusy.push('\n');
  }
  return kusy.join('');
}

/**
 * Text celého dokumentu.
 * Vrací `{ text, citelnost, streamu, cmapu }` — čísla jsou doklad,
 * aby se dalo poznat, PROČ je text prázdný nebo rozsypaný.
 */
export function textZPdf(buf) {
  const data = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (!data.length) return { text: '', citelnost: 0, streamu: 0, cmapu: 0, duvod: 'prázdný soubor' };
  if (data.length > STROP_PDF) {
    return { text: '', citelnost: 0, streamu: 0, cmapu: 0,
      duvod: `dokument je větší než strop (${data.length} B)` };
  }
  if (data.slice(0, 5).toString('latin1') !== '%PDF-') {
    return { text: '', citelnost: 0, streamu: 0, cmapu: 0, duvod: 'není to PDF' };
  }
  if (/\/Encrypt\b/.test(data.toString('latin1', 0, Math.min(data.length, 200000)))) {
    return { text: '', citelnost: 0, streamu: 0, cmapu: 0, duvod: 'dokument je zašifrovaný' };
  }
  const vse = streamy(data);
  /* NEJDŘÍV CMAPY, pak obsah: obsahový stream se na font odvolává
     jménem (`/F1 Tf`) a bez tabulky by z Identity-H vyšly jen otazníky. */
  const cmapy = new Map();
  for (const s of vse) {
    if (!/\/ToUnicode|CMapName|beginbfchar|beginbfrange/.test(s.hlava)) {
      /* Hlavička CMapu bývá chudá, takže se rozbalí a pozná po obsahu. */
    }
    const telo = rozbal(s);
    if (!telo) continue;
    const txt = telo.toString('latin1');
    if (!/beginbfchar|beginbfrange/.test(txt)) continue;
    const mapa = cmapZTextu(txt);
    if (!mapa.size) continue;
    /* Jméno fontu se z CMapu nepozná, tak se použije pro všechny —
       u dokumentu s jednou sadou písem to stačí a víc jich podmínky
       nemívají. Kdyby jich bylo víc, poslední vyhrává; projeví se to
       nižší čitelností, ne tichou lží. */
    cmapy.set('*', mapa);
  }
  /* Dotaz na jakékoli jméno fontu vrátí tutéž tabulku — viz komentář
     u textZObsahu. */
  const najdiCmap = cmapy.has('*') ? () => cmapy.get('*') : null;
  let text = '';
  for (const s of vse) {
    if (/\/Image|\/XObject\s*\/Image|\/Subtype\s*\/Image/.test(s.hlava)) continue;
    const telo = rozbal(s);
    if (!telo) continue;
    const txt = telo.toString('latin1');
    if (/beginbfchar|beginbfrange/.test(txt)) continue;
    if (!/\bTj\b|\bTJ\b/.test(txt)) continue;
    text += textZObsahu(txt, najdiCmap) + '\n';
    if (text.length > STROP_TEXTU) break;
  }
  text = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { text, citelnost: citelnost(text), streamu: vse.length, cmapu: cmapy.size };
}
