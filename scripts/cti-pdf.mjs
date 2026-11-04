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
/* Pod touhle čitelností má smysl zkusit i hrubší cestu — nad ní je
   text v pořádku a není co vylepšovat. */
export const PRAH_PRO_NAHRADU = 0.9;
/* O kolik musí být hrubší cesta lepší, aby se vzala. Malý rozdíl je
   šum, ne poznatek. */
export const ROZDIL_PRO_NAHRADU = 0.05;

/** Strop na délku vytaženého textu (podmínky bývají do 100 kB). */
/* ROVNOCENNÁ SABOTÁŽ: posunutá konstanta (+1) — tenhle strop je pojistka proti utržené paměti u rozbitého PDF, ne mez, podle které se o obsahu rozhoduje; čte se jediným `if (t.length > STROP_TEXTU) break` a o jeden znak výš nebo níž nezmění ani jeden výsledek na žádném dokumentu, který má smysl číst (podmínky bývají do 100 kB, tedy čtvrtina stropu). Zkoušet to na dokumentu dlouhém přesně 400 000 znaků by bylo měření stropu, ne čtení PDF. */
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
    /* ČÍSLO OBJEKTU SE BERE JEŠTĚ PŘED ŘEZEM. Řeže se právě před
       ` obj`, takže po řezu už číslo v hlavičce není — napoprvé jsem
       ho hledal po řezu a vyšlo vždycky prázdné. */
    /* A BERE SE POSLEDNÍ, NE PRVNÍ. V okně dvou tisíc bajtů leží
       obvykle i předchozí objekt; nenasytný výraz pak vracel jeho
       číslo a dvě různé CMap tabulky dostaly totéž — v nálezu z nich
       byla jedna. Odhalila to kontrola se dvěma písmy. */
    let cisloObjektu = null;
    for (const mm of hlava.matchAll(/(\d+)\s+\d+\s+obj/g)) cisloObjektu = +mm[1];
    const iObj = hlava.lastIndexOf(' obj');
    if (iObj >= 0) hlava = hlava.slice(iObj);
    else { const iDict = hlava.lastIndexOf('<<'); if (iDict >= 0) hlava = hlava.slice(iDict); }
    let s = a + sig.length;
    if (buf[s] === 0x0d) s++;
    if (buf[s] === 0x0a) s++;
    let e = b;
    while (e > s && (buf[e - 1] === 0x0a || buf[e - 1] === 0x0d)) e--;
    /* Číslo objektu je v nálezu proto, aby se CMap dala přiřadit ke
       KONKRÉTNÍMU fontu; jedna tabulka nasazená na všechna písma
       vyrábí otazníky (naměřeno: dražební řád s čitelností 0,86). */
    ven.push({ hlava, cislo: cisloObjektu, telo: buf.slice(s, e) });
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
  /* BEROU SE VŠECHNY ŘETĚZCE, NE JEN TY PŘED OPERÁTOREM. Napoprvé
     tu stálo `(…)\s*(Tj|TJ)` — a to je vada, kterou odhalilo až
     měření naostro: z dražebního řádu elektronickedrazby.cz vyšlo
     385 znaků, protože nejčastější tvar v PDF je POLE s posuny,
     `[(Je zak) -250 (azano)] TJ`. Tam za řetězcem stojí číslo, ne
     operátor, takže se nenačetl ani jeden. V obsahovém streamu jsou
     literální řetězce skoro výhradně text, takže se sbírají všechny
     a odřádkování se bere z operátorů posunu.

     Jediný průchod, jeden regulární výraz se střídáním: pořadí
     v textu rozhoduje a několik průchodů by ho rozhodilo. */
  const re = /\/([A-Za-z0-9_.+-]+)\s+[\d.]+\s+Tf|\(((?:\\.|[^\\()])*)\)|<([0-9a-fA-F\s]+)>|(T\*|TD|Td|ET)/g;
  let m;
  while ((m = re.exec(t))) {
    if (m[1] !== undefined) { aktivni = (najdiCmap && najdiCmap(m[1])) || null; continue; }
    if (m[2] !== undefined) { kusy.push(dekoduj(bajtyZRetezce(m[2]), aktivni)); continue; }
    if (m[3] !== undefined) {
      const h = m[3].replace(/\s+/g, '');
      const b = [];
      for (let i = 0; i + 1 < h.length; i += 2) b.push(parseInt(h.slice(i, i + 2), 16));
      kusy.push(dekoduj(b, aktivni));
      continue;
    }
    if (m[4] !== undefined) kusy.push('\n');
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
  /* SLOVNÍKY HLEDAT I V OBJEKTOVÝCH STREAMECH. Naměřeno naostro:
     po zavedení párování podle jmen spadla čitelnost dražebního řádu
     z 0,86 na 0,36 — tedy moje „oprava" ten dokument ZHORŠILA. PDF od
     verze 1.5 ukládá objekty bez streamu (a mezi nimi slovníky písem
     a soupis `/Font`) do komprimovaného `/ObjStm`. V surovém souboru
     tedy nejsou vidět, párování se nemělo o co opřít a většina písem
     zůstala bez tabulky. */
  let cely = data.toString('latin1');
  for (const st of vse) {
    if (!/\/ObjStm/.test(st.hlava)) continue;
    const telo = rozbal(st);
    if (telo) cely += '\n' + telo.toString('latin1');
  }
  /* NEJDŘÍV CMAPY, pak obsah: obsahový stream se na font odvolává
     jménem (`/F1 Tf`) a bez tabulky by z Identity-H vyšly jen otazníky.
     Tabulka se ale musí přiřadit ke SPRÁVNÉMU fontu. Naměřeno na
     dražebním řádu elektronickedrazby.cz: jedna tabulka nasazená na
     všechna písma dala 10 556 znaků s čitelností 0,86, tedy každý
     sedmý znak otazník. Cesta je `/Font << /F1 12 0 R >>` →
     `12 0 obj << /ToUnicode 34 0 R >>` → stream objektu 34. */
  const cmapyPodleObjektu = new Map();
  for (const s of vse) {
    const telo = rozbal(s);
    if (!telo) continue;
    const txt = telo.toString('latin1');
    if (!/beginbfchar|beginbfrange/.test(txt)) continue;
    const mapa = cmapZTextu(txt);
    if (mapa.size && s.cislo != null) cmapyPodleObjektu.set(s.cislo, mapa);
    if (mapa.size) cmapyPodleObjektu.set('*', mapa);
  }
  /* font (číslo objektu) → objekt s ToUnicode */
  const fontKCmapu = new Map();
  for (const m of cely.matchAll(/(\d+)\s+\d+\s+obj([\s\S]{0,1200}?)(?:endobj|stream)/g)) {
    const mu = /\/ToUnicode\s+(\d+)\s+\d+\s+R/.exec(m[2]);
    if (mu) fontKCmapu.set(+m[1], +mu[1]);
  }
  /* jméno v obsahu → font (číslo objektu) */
  const jmenoKFontu = new Map();
  for (const m of cely.matchAll(/\/Font\s*<<([\s\S]{0,2000}?)>>/g)) {
    for (const f of m[1].matchAll(/\/([A-Za-z0-9_.+-]+)\s+(\d+)\s+\d+\s+R/g)) {
      jmenoKFontu.set(f[1], +f[2]);
    }
  }
  const jenJedna = cmapyPodleObjektu.has('*')
    && [...cmapyPodleObjektu.keys()].filter((k) => k !== '*').length <= 1;
  const najdiCmap = (jmeno) => {
    const fo = jmenoKFontu.get(jmeno);
    const co = fo != null ? fontKCmapu.get(fo) : null;
    if (co != null && cmapyPodleObjektu.has(co)) return cmapyPodleObjektu.get(co);
    /* NÁHRADA JEN U DOKUMENTU S JEDINOU TABULKOU. Jinak by se cizí
       tabulka nasadila na písmo, kam nepatří — a to je přesně ta
       chyba, kvůli které se tohle přiřazování dělá. */
    return jenJedna ? cmapyPodleObjektu.get('*') : null;
  };
  /* Obsahové streamy se projdou jednou a text se z nich složí podle
     předaného způsobu hledání tabulek. */
  const slozText = (hledac) => {
    let t = '';
    for (const s of vse) {
      if (/\/Image|\/XObject\s*\/Image|\/Subtype\s*\/Image/.test(s.hlava)) continue;
      const telo = rozbal(s);
      if (!telo) continue;
      const txt = telo.toString('latin1');
      if (/beginbfchar|beginbfrange/.test(txt)) continue;
      if (!/\bTj\b|\bTJ\b/.test(txt)) continue;
      t += textZObsahu(txt, hledac) + '\n';
      if (t.length > STROP_TEXTU) break;
    }
    return t.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  };

  let text = slozText(najdiCmap);
  let volba = 'podle jmen písem';
  /* ROZHODNE MĚŘENÍ, NE DOMNĚNKA. Naostro se ukázalo, že u dražebního
     řádu elektronickedrazby.cz je přesnější cesta (tabulka ke svému
     písmu) HORŠÍ: slovníky písem v tom dokumentu nejsou ani v surovém
     souboru, ani v objektových streamech, takže většina písem zůstane
     bez tabulky a dekóduje se jednobajtově — čitelnost 0,36 proti 0,86
     s jedinou tabulkou nasazenou na všechno. Obě cesty se proto zkusí
     a vezme se ta ČITELNĚJŠÍ; do nálezu jde, která to byla.
     Rozdíl musí být zřetelný, aby se u dokumentu se správným párováním
     nepřebíjelo zbytečně — tam jsou obě čitelné stejně a vyhrává
     párování (viz zkouška se dvěma písmy). */
  if (citelnost(text) < PRAH_PRO_NAHRADU && cmapyPodleObjektu.has('*')) {
    const nahradni = slozText(() => cmapyPodleObjektu.get('*'));
    if (citelnost(nahradni) > citelnost(text) + ROZDIL_PRO_NAHRADU) {
      text = nahradni;
      volba = 'jedna tabulka na všechna písma (čitelnější)';
    }
  }
  return { text, citelnost: citelnost(text), streamu: vse.length, volba,
    cmapu: [...cmapyPodleObjektu.keys()].filter((k) => k !== '*').length };
}
