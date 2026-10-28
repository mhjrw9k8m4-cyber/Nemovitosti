// Test: hlavička stránky pozemku — snímek, odznak, nadpis, místo.
//
// Spuštění: PW_CHROMIUM=… node scripts/test-hlavicka-pozemku.mjs
//
// Je to první obrazovka, kterou člověk z vyhledávače uvidí, a sešly se
// v ní dva nálezy z měření v prohlížeči: nadpis, který se po vykreslení
// lišil od servírovaného, a odznak nad snímkem, který se na telefonu
// natáhl přes celý náhled a svým rozostřením rozmazal popisku.
//
// NALEZENO MĚŘENÍM v prohlížeči. Stránka pozemku existuje ve dvou
// podobách: ta servírovaná (statická, pro vyhledávače a pro toho, kdo
// nemá JavaScript) a ta vykreslená, kterou js/pozemek.js postaví na
// její místo. Nadpisy se rozcházely:
//
//   servírovaný <h1>:  „Trvalý travní porost 4 889 m² — Bystřice"
//   vykreslený <h1>:   „Bystřice"
//
// To druhé je jméno obce, a to sdílí víc nabídek: 1 269 z 1 941
// stránek (65 %) mělo po vykreslení nadpis shodný s nějakou jinou
// stránkou — osmnáct se jich jmenovalo „Slatina". A protože
// vyhledávač stránku vykresluje, je to ten horší z obou, který se
// počítá. Totéž u <title>: servírovaný titulek skript přepisoval na
// „Bystřice — 190 550 Kč · Parcelka".
//
// Nadpis se proto skládá JEDNOU, v generátoru, a do stránky se vkládá
// ostrůvkem — stejně jako vzdálenosti, obec a srovnatelné pozemky.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { BASE, PORT } from './port-zkousky.mjs';

/* STRÁNKA, NA KTERÉ SE DETAIL NEVYKRESLÍ.
   Pruh nahoře (třída `pz-konec`) nosí dva různé stavy: ukončenou
   nabídku a rozcestí na novou adresu (`pz-konec pz-presun`, vzniká při
   opravě jména obce — to je součást jména souboru). Na ani jedné
   js/pozemek.js detail nekreslí, takže se na nich nedá měřit.
   HLEDÁ SE TŘÍDA, NE PŘESNÝ ŘETĚZEC `class="pz-konec"`. Na tom spadla
   v CI scripts/test-parametry.mjs: uzavírací uvozovka za `pz-konec`
   u dvou tříd nesedí, zkouška si proto vybrala rozcestí a čekala na
   dlaždice, které nikdy nepřijdou. Tady se to spravilo zároveň,
   protože stránku k měření vybírá stejným způsobem. */
const NEVYKRESLI = /class="[^"]*\bpz-konec\b/;

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Hlavička pozemku', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const bezNbsp = (s) => String(s == null ? '' : s).replace(/ /g, ' ');
const cti = (f) => bezNbsp(readFileSync(path.join(KOREN, f), 'utf8'));

const vsechny = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
/* Ukončené stránky se sem nepočítají: nabídka v datech není, takže
   nemají co vykreslovat a statická část na nich zůstane celá i s
   nadpisem. Hlídá je scripts/test-ukoncena-v-prohlizeci.mjs. */
const ukoncene = vsechny.filter((f) => NEVYKRESLI.test(cti(f)));
const stranky = vsechny.filter((f) => !ukoncene.includes(f));
console.log(`Stránek pozemků: ${vsechny.length} (živých ${stranky.length}, ukončených ${ukoncene.length})`);
pravda('je co měřit — živé stránky pozemků se našly', stranky.length >= 500,
  `našlo se ${stranky.length}`);
/* Ostrůvek musí mít KAŽDÁ živá stránka. Kdyby se generátor rozbil
   a přestal ho psát, nadpis by tiše spadl zpátky na jméno obce
   a kontroly níž by neměly co porovnávat. */
{
  const bez = stranky.filter((f) => cti(f).indexOf('id="pz-titul-data"') < 0);
  pravda('a každá z nich nese ostrůvek s nadpisem', bez.length === 0,
    `${bez.length} bez něj, např. ${bez.slice(0, 3).join(', ')}`);
}

// ---- 1) servírovaná podoba: čtyři místa, jeden nadpis -------------
const nadpisy = new Map();   // soubor → titul
const nesedi = [];
for (const f of stranky) {
  const h = cti(f);
  const h1 = (h.match(/<article class="pz-staticky">[\s\S]*?<h1>(.*?)<\/h1>/) || [])[1];
  const titulek = (h.match(/<title>(.*?)<\/title>/) || [])[1];
  const ostruvek = (h.match(/<script type="application\/json" id="pz-titul-data">(.*?)<\/script>/) || [])[1];
  let zOstruvku = null;
  try { zOstruvku = JSON.parse(ostruvek); } catch (e) { /* zůstane null */ }
  if (!h1 || !titulek || typeof zOstruvku !== 'string') {
    nesedi.push(`${f}: h1=${!!h1} title=${!!titulek} ostrůvek=${typeof zOstruvku}`);
    continue;
  }
  /* NADPIS JE „CO", TITULEK JE CELÝ. Od 26. 10. se titul dělí na
     pomlčce: v <h1> zůstane, co se prodává („Ostatní plocha 6 336 m²"),
     a místo jde do řádku pod ním (.pz-staticky-kde ve statické podobě,
     .pz-okres ve vykreslené) — tak to mají reality.idnes i Sreality.
     <title> a ostrůvek nesou CELÝ titul dál: vyhledávač místo
     potřebuje a js/pozemek.js si z ostrůvku dělí sám.
     Hlídá se tedy skládačka, ne rovnost: h1 + řádek místa = ostrůvek. */
  const iP = zOstruvku.indexOf(' — ');
  const ocekCo = iP < 0 ? zOstruvku : zOstruvku.slice(0, iP);
  const ocekKde = iP < 0 ? '' : zOstruvku.slice(iP + 3);
  const kde = (h.match(/<p class="pz-staticky-kde">(.*?)<\/p>/) || [])[1] || '';
  /* TITULEK SE S OSTRŮVKEM ROVNAT NEMUSÍ, NADPIS ANO. Do 27. 10. byly
     všechny tři texty týž řetězec. Od předlohy (reality.idnes,
     Sreality) vede nadpis slovesem — „Prodej ostatní plochy 6 336 m²" —
     jenže titulek pro vyhledávač se musí vejít do 65 znaků i se jménem
     webu a sloveso v něm ustupuje dřív než okres a výměra (naměřeno:
     slovesem začíná 1 003 titulků z 2 198). Co platí dál a hlídá se:
     servírovaný <h1> a ostrůvek, ze kterého nadpis skládá js/pozemek.js,
     musí být DOSLOVA totéž — jinak by vyhledávač viděl jiný nadpis než
     člověk. A titulek musí pořád nést místo, jinak je k ničemu. */
  const titulekMaMisto = titulek.indexOf(ocekKde) >= 0
    || (ocekKde.indexOf(',') > 0 && titulek.indexOf(ocekKde.slice(0, ocekKde.indexOf(','))) >= 0);
  if (h1 !== ocekCo || kde !== ocekKde || !titulekMaMisto) {
    nesedi.push(`${f}: h1 „${h1}" / kde „${kde}" / ostrůvek „${zOstruvku}" / title „${titulek}"`);
    continue;
  }
  nadpisy.set(f, zOstruvku);
}
pravda('servírovaný nadpis, titulek stránky a ostrůvek nesou týž text',
  nesedi.length === 0, `${nesedi.length}×, např. ${nesedi.slice(0, 2).join(' || ')}`);

// ---- 2) nadpis skoro nikdy nesdílí znění s jinou stránkou ---------
/* Nadpis je to, co o stránce říká vyhledávač. Když ho sdílí dvacet
   stránek, je to pro něj dvacetkrát táž stránka. Pár shod zbývá:
   tatáž výměra téhož druhu v téže obci se rozlišit nedá jinak než
   cenou a ta do nadpisu nepatří. */
{
  const pocty = {};
  for (const t of nadpisy.values()) pocty[t] = (pocty[t] || 0) + 1;
  const sdilenych = [...nadpisy.values()].filter((t) => pocty[t] > 1).length;
  const podil = sdilenych / Math.max(1, nadpisy.size);
  pravda('nadpis sdílí znění s jinou stránkou nejvýš u 5 % stránek',
    podil <= 0.05,
    `${sdilenych} z ${nadpisy.size} (${(podil * 100).toFixed(0)} %) — `
    + 'před opravou to bylo 65 % (nadpisem bylo jen jméno obce)');
}

// ---- 3) vykreslená podoba říká totéž ------------------------------
const TYPY = { '.html': 'text/html;charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webp': 'image/webp', '.xml': 'application/xml', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0].split('#')[0]);
  if (p === '/') p = '/index.html';
  const f = path.join(KOREN, p);
  if (!f.startsWith(KOREN)) { res.writeHead(403); return res.end(); }
  let telo;
  try { telo = readFileSync(f); } catch (e) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPY[path.extname(f)] || 'application/octet-stream' });
  res.end(telo);
});
await new Promise((r) => server.listen(PORT, r));

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM });
const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block' });
const page = await ctx.newPage();

/* Vzorek napříč abecedou, ne prvních deset: první soubory jsou
   z jednoho okresu a vyšel by z toho jeden kraj a jeden druh. */
const vzorek = [];
const krok = Math.max(1, Math.floor([...nadpisy.keys()].length / 12));
const klice = [...nadpisy.keys()].sort();
for (let i = 0; i < klice.length && vzorek.length < 12; i += krok) vzorek.push(klice[i]);

const rozesle = [];
const dvakrat = [];
let sOkresemVNadpisu = 0;
for (const f of vzorek) {
  await page.goto(`${BASE}/${f}`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const el = document.querySelector('#pz-detail h1');
    return el && !document.querySelector('.pz-staticky');
  }, null, { timeout: 15000 }).catch(() => {});
  const vykresleny = bezNbsp(await page.$eval('#pz-detail h1', (e) => e.textContent).catch(() => ''));
  const titulek = bezNbsp(await page.title());
  const ocekavany = nadpisy.get(f);           // CELÝ titul z ostrůvku
  const iP = ocekavany.indexOf(' — ');
  const ocekCo = iP < 0 ? ocekavany : ocekavany.slice(0, iP);
  const ocekKde = iP < 0 ? '' : ocekavany.slice(iP + 3);
  if (vykresleny !== ocekCo) rozesle.push(`${f}: vykresleno „${vykresleny}", čekáno „${ocekCo}"`);
  else if (titulek !== `${ocekavany} | Parcelka`) rozesle.push(`${f}: titulek „${titulek}"`);
  /* Místo se NESMÍ opakovat v nadpisu i pod ním. Dřív to hrozilo
     obráceně (okres byl v nadpisu a řádek ho psal podruhé); teď je
     dělba pevná, a tohle je past na to, aby se zpátky nesešly. */
  const podNadpisem = bezNbsp(
    await page.$eval('#pz-detail .pz-okres', (e) => e.textContent).catch(() => ''));
  if (ocekKde) {
    if (podNadpisem.indexOf(ocekKde) < 0) {
      dvakrat.push(`${f}: pod nadpisem chybí místo „${ocekKde}" (stojí tam „${podNadpisem}")`);
    } else if (vykresleny.indexOf(ocekKde) >= 0) {
      dvakrat.push(`${f}: místo „${ocekKde}" je i v nadpisu „${vykresleny}"`);
    }
    sOkresemVNadpisu++;
  }
}
pravda('je co měřit — vzorek stránek se v prohlížeči otevřel', vzorek.length >= 10,
  `${vzorek.length} stránek`);
pravda('vykreslený nadpis i titulek jsou tytéž jako servírované',
  rozesle.length === 0, `${rozesle.length}×, např. ${rozesle.slice(0, 2).join(' || ')}`);
pravda('je co měřit — ve vzorku jsou tituly s místem za pomlčkou',
  sOkresemVNadpisu >= 3, `${sOkresemVNadpisu} z ${vzorek.length}`);
pravda('a místo stojí POD nadpisem, ne v něm',
  dvakrat.length === 0, `${dvakrat.length}×, např. ${dvakrat.slice(0, 2).join(' || ')}`);

// ---- 4) odznak nad snímkem: chip, ne pruh přes celý náhled -------
/* NALEZENO MĚŘENÍM na telefonu (390 px): odznak „Na prodej" byl
   95 × 202 px místo 95 × 31 a svým rozostřením (backdrop-filter)
   rozmazal popisku pod sebou — jméno obce i výměra byly nečitelné.
   Příčina: v úzkém zobrazení posouvá společné pravidlo odznak na
   `bottom:7px` kvůli KARTÁM NA MAPĚ, kde je náhled vysoký 116 px;
   stránka pozemku mu dává `top:13px`, ale `bottom` nepřebíjela, takže
   se natáhl mezi oba okraje.
   Měří se na úzkém displeji, protože na širokém to bylo v pořádku —
   a kontrola, která se na telefon nepodívá, by to zase minula. */
{
  const uzky = await ctx.newPage();
  await uzky.setViewportSize({ width: 390, height: 844 });
  const spatne = [];
  for (const f of vzorek.slice(0, 4)) {
    await uzky.goto(`${BASE}/${f}`, { waitUntil: 'load' });
    await uzky.waitForTimeout(1200);
    const m = await uzky.evaluate(() => {
      const o = (e) => (e ? e.getBoundingClientRect() : null);
      const b = o(document.querySelector('.pz-media .opp-badge'));
      const p = o(document.querySelector('.pz-media .sn-popis'));
      return { b: b && { v: Math.round(b.height), s: Math.round(b.width), y: b.bottom },
        p: p && { y: p.top } };
    });
    if (!m.b) { spatne.push(`${f}: odznak na snímku není`); continue; }
    if (m.b.v > 48) spatne.push(`${f}: odznak je ${m.b.s}×${m.b.v} px`);
    if (m.p && m.b.y > m.p.y) {
      spatne.push(`${f}: odznak sahá na popisku (končí ${Math.round(m.b.y)}, popiska začíná ${Math.round(m.p.y)})`);
    }
  }
  pravda('odznak nad snímkem je na telefonu chip, ne pruh přes celý náhled',
    spatne.length === 0, spatne.slice(0, 3).join(' | '));

  /* A JE TO TÝŽ ODZNAK JAKO NA KARTĚ. Stránka pozemku si pravidlo
     opsala z css/styles.css a opis se rozešel: váha 700 proti 600,
     odsazení 4px 12px proti 4px 8px, podklad .6 proti .74 a navíc
     rozostření pod ním (bílá na tom podkladu dávala 4,94 : 1 proti
     8,09 : 1). Měří se SROVNÁNÍM s odznakem, který na téže stránce
     stojí mimo `.pz-media` — kdyby se ty vlastnosti znovu někde
     přepsaly, srovnání se rozejde. Poloha se nesrovnává, ta se tu
     přepisovat MÁ (viz výš). */
  const opis = await uzky.evaluate(() => {
    const zivy = document.querySelector('.pz-media .opp-badge');
    if (!zivy) return null;
    const vzor = document.createElement('span');
    vzor.className = zivy.className;
    vzor.textContent = zivy.textContent;
    document.body.appendChild(vzor);
    const co = ['fontSize', 'fontWeight', 'letterSpacing', 'padding', 'borderRadius',
      'color', 'backgroundColor', 'backdropFilter', 'gap'];
    const a = getComputedStyle(zivy), b = getComputedStyle(vzor);
    const rozdil = co.filter((k) => a[k] !== b[k]).map((k) => `${k}: ${a[k]} ≠ ${b[k]}`);
    const blur = a.backdropFilter;
    vzor.remove();
    return { rozdil, blur };
  });
  pravda('odznak na snímku se neliší od odznaku na kartě ničím než polohou',
    !!opis && opis.rozdil.length === 0, opis ? opis.rozdil.join(' | ') : 'odznak nenalezen');
  pravda('a nic pod ním nerozostřuje',
    !!opis && (opis.blur === 'none' || !opis.blur), opis && opis.blur);
  await uzky.close();
}

// ---- 5) odkud nabídka je: pod cenou, a jen tam -------------------
/* NALEZENO MĚŘENÍM na 1440 px: cena stála na y 168, údaj „Stav / zdroj"
   až na y 854 — tedy o obrazovku a půl níž, v tabulce parametrů.
   „Kdo to říká" je přitom otázka k ceně, ne k parametrům. Zápis se
   přestěhoval pod cenu a z tabulky zmizel; hlídá se OBOJÍ, protože
   tentýž údaj dvakrát na jedné stránce je horší než pozdě.
   A ještě jedna past: u dražby nese datum dlaždice „Termín dražby",
   takže v zápisu o zdroji nemá co dělat. */
{
  const siroky = await ctx.newPage();
  await siroky.setViewportSize({ width: 1440, height: 900 });
  const vse = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort();
  /* Doběhlá nabídka ukáže hlášku „už není aktuální" a cenu nevykreslí.
     Zdroj se hledá ve STATICKÉ verzi stránky, kde zápis zůstává jako
     řádek definičního seznamu — podle něj se pozná, co která stránka
     o svém původu ví, bez otevírání v prohlížeči. */
  const zivaSe = (vzor) => vse.find((f) => {
    const h = readFileSync(path.join(KOREN, f), 'utf8');
    return !NEVYKRESLI.test(h) && vzor.test(h);
  });
  const sDrazbou = zivaSe(/<dt>Stav \/ zdroj<\/dt><dd>[^<]*dražba[^<]*\d{4}/);
  const sInzeratem = zivaSe(/<dt>Stav \/ zdroj<\/dt><dd>[^<]*inzerát/);
  pravda('je co měřit — stránka s inzerátem i stránka s dražbou',
    !!sDrazbou && !!sInzeratem, `inzerát: ${sInzeratem || 'nenalezen'}, dražba: ${sDrazbou || 'nenalezen'}`);
  const zmer = async (f) => {
    await siroky.goto(`${BASE}/${f}`, { waitUntil: 'load' });
    await siroky.waitForSelector('.pz-price', { timeout: 20000 }).catch(() => {});
    return siroky.evaluate(() => {
      const z = document.querySelector('.pz-zdroj');
      const c = document.querySelector('.pz-price');
      const rz = z && z.getBoundingClientRect(), rc = c && c.getBoundingClientRect();
      return {
        text: z ? z.textContent.replace(/\s+/g, ' ').trim() : null,
        podCenou: !!(rz && rc) && rz.top >= rc.bottom - 2 && (rz.top - rc.bottom) <= 120,
        odstup: (rz && rc) ? Math.round(rz.top - rc.bottom) : null,
        vTabulce: [...document.querySelectorAll('.pz-spec .k')]
          .some((e) => /zdroj/i.test(e.textContent || '')),
        termin: [...document.querySelectorAll('.pz-klic')]
          .some((e) => /Termín dražby/.test(e.textContent || '')),
      };
    });
  };
  if (sInzeratem) {
    const m = await zmer(sInzeratem);
    pravda('u inzerátu stojí zdroj hned pod cenou',
      !!m.text && m.podCenou, `„${m.text}", odstup od ceny ${m.odstup} px`);
    pravda('a jmenuje ten web', /inzerát/i.test(m.text || '') && /[–·]/.test(m.text || ''), m.text);
    pravda('v tabulce parametrů už podruhé není', m.vTabulce === false,
      'řádek „Stav / zdroj" je zpátky v tabulce — týž údaj dvakrát');
  }
  if (sDrazbou) {
    const m = await zmer(sDrazbou);
    pravda('u dražby stojí zdroj taky pod cenou a jmenuje dražebníka',
      !!m.text && m.podCenou && /[–·]/.test(m.text || ''), `„${m.text}", odstup ${m.odstup} px`);
    pravda('je co měřit — datum dražby nese dlaždice', m.termin === true,
      'dlaždice „Termín dražby" na stránce není, takže se opakování datumu nedá poznat');
    pravda('a zápis o zdroji datum neopakuje',
      !/\d{1,2}\.\s*\d{1,2}\.\s*\d{4}/.test(m.text || ''), m.text);
  }
  await siroky.close();
}

await prohlizec.close();
server.close();

console.log('\nHlavička stránky pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) { console.log(`\n::error::Hlavička pozemku: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
