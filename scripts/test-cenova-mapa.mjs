/* Test: cenová mapa okresů říká totéž, co seznam pod ní.
   ==================================================================
   Spuštění: node scripts/test-cenova-mapa.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Stránka „Kolik stojí pozemek?" ukazuje ceny po okresech dvakrát: jako
   mapu a jako seznam. Dvě podoby téhož údaje jsou přesně ta situace, ve
   které si web začne odporovat — na tomhle webu se to už stalo mezi
   mapou a stránkou pozemku (viz js/ceny.js) a vedlo to k tomu, že 310
   stránek tvrdilo o ceně něco jiného než mapa.

   Hlavní kontrola je proto SHODA: pro každý okres, který je v mapě, se
   porovná cena z bubliny v mapě s cenou v řádku seznamu. Čte se to
   z vykreslené stránky, ne z generátoru — takže se měří to, co uvidí
   člověk, a ne to, co jsme zamýšleli.

   Druhá polovina je o tom, co se slibuje: mapa je bez podkladových
   dlaždic, takže otevření stránky nesmí vyvolat spojení s žádným cizím
   serverem. A barva musí být monotónní v ceně — tmavší = dražší — jinak
   legenda lže.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nCenová mapa okresů');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Cenová mapa: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* Staticky: hranice okresů a ostrůvek dat musí existovat a sedět. */
const hranice = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'okresy-hrube.json'), 'utf8'));
pravda(`obrysy okresů existují (${Object.keys(hranice).length})`,
  Object.keys(hranice).length === 77, `${Object.keys(hranice).length}, čekáno 77`);

const stranka = fs.readFileSync(path.join(KOREN, 'cena-pozemku.html'), 'utf8');
const ostrov = /<script type="application\/json" id="cen-mapa-data">([\s\S]*?)<\/script>/.exec(stranka);
pravda('stránka nese ostrůvek dat pro mapu', !!ostrov, 'nenašel se #cen-mapa-data');
if (!ostrov) hotovo();
let data = null;
try { data = JSON.parse(ostrov[1]); } catch (e) { data = null; }
pravda('a dá se přečíst jako JSON', !!data && typeof data === 'object', 'neplatný JSON');
if (!data) hotovo();
const okresyVDatech = Object.keys(data);
pravda(`jsou v něm okresy s cenou (${okresyVDatech.length})`, okresyVDatech.length >= 20,
  `jen ${okresyVDatech.length} — pak kontrola shody nic neváží`);
const cizi = okresyVDatech.filter((o) => !hranice[o]);
pravda('a všechny mají obrys (jinak by se nevykreslily)', cizi.length === 0, cizi.join(', '));

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 1000 },
    serviceWorkers: 'block' });
  const p = await ctx.newPage();
  const ciziPozadavky = [];
  const chybyKonzole = [];
  p.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) ciziPozadavky.push(r.url()); });
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));

  await p.goto(`${BASE}/cena-pozemku.html`, { waitUntil: 'load' });
  /* Mapa se kreslí až na dohled, takže se k ní musí dorolovat. */
  await p.evaluate(() => {
    const el = document.getElementById('cen-mapa');
    if (el) el.scrollIntoView({ block: 'center' });
  });
  const vykresleno = await p.waitForFunction(() => {
    const el = document.getElementById('cen-mapa');
    return el && el.getAttribute('data-hotovo') ? Number(el.getAttribute('data-hotovo')) : false;
  }, null, { timeout: 20000 }).then((h) => h.jsonValue()).catch(() => 0);
  pravda('mapa se vykreslila a nakreslila všech 77 okresů', vykresleno === 77,
    `nakresleno ${vykresleno}`);
  if (!vykresleno) hotovo();

  /* HLAVNÍ KONTROLA: mapa proti seznamu. Okres i cena se čtou z atributů
     vykreslených obrysů (data-okres, data-cena — zapisuje je
     js/cenova-mapa.js), seznam z textu řádků. Dvě nezávisle vysázené
     podoby téhož údaje. */
  const zMapy = await p.evaluate(() => Array.from(document.querySelectorAll('#cen-mapa path[data-okres]'))
    .map((el) => ({
      okres: el.getAttribute('data-okres'),
      cena: el.hasAttribute('data-cena') ? Number(el.getAttribute('data-cena')) : null,
      malo: el.hasAttribute('data-malo'),
      kryti: (() => {
        const m = /rgba?\([^)]*?,\s*([\d.]+)\s*\)/.exec(el.getAttribute('fill') || '');
        return m ? Number(m[1]) : null;
      })()
    })));
  pravda(`z mapy se přečetlo všech 77 obrysů (${zMapy.length})`, zMapy.length === 77,
    `${zMapy.length} — pak se shoda neměří na všem`);

  const zeSeznamu = await p.evaluate(() => {
    const out = {};
    for (const el of document.querySelectorAll('.okr-item')) {
      const jmeno = el.querySelector('.okr-place');
      const meta = el.querySelector('.okr-meta');
      if (!jmeno || !meta) continue;
      /* Mezera před „Kč" je PEVNÁ (&nbsp;), ne obyčejná — s literální
         mezerou ve vzoru se neshodlo nic a kontrola shody procházela
         naprázdno. Chytila to až předběžná kontrola „seznam se přečetl". */
      const m = /([\d\s\u00a0]+)Kč\/m²/.exec(meta.textContent || '');
      if (m) out[jmeno.textContent.trim().replace(/\s*·\s*$/, '')] = Number(m[1].replace(/[\s\u00a0]/g, ''));
    }
    return out;
  });
  pravda(`seznam pod mapou se přečetl (${Object.keys(zeSeznamu).length} řádků)`,
    Object.keys(zeSeznamu).length >= 20, `jen ${Object.keys(zeSeznamu).length}`);

  const rozpory = [];
  let srovnano = 0;
  for (const { okres, cena } of zMapy) {
    if (cena == null) continue;              // okres bez dat — cenu nemá
    if (!(okres in zeSeznamu)) continue;     // v seznamu jsou i kraje; okres tam být nemusí
    srovnano++;
    if (zeSeznamu[okres] !== cena) rozpory.push(`${okres}: mapa ${cena}, seznam ${zeSeznamu[okres]}`);
  }
  pravda(`srovnalo se dost okresů (${srovnano})`, srovnano >= 20,
    `jen ${srovnano} — kontrola shody by nic neznamenala`);
  pravda('mapa a seznam říkají u každého okresu TOTÉŽ', rozpory.length === 0,
    rozpory.slice(0, 4).join(' | '));

  /* Barva musí růst s cenou, jinak legenda lže. */
  const sCenou = zMapy.filter((x) => x.cena != null && x.kryti != null);
  pravda(`krytí se přečetlo (${sCenou.length} okresů s cenou)`, sCenou.length >= 20, `${sCenou.length}`);
  let obracene = 0, parCelkem = 0;
  for (let i = 0; i < sCenou.length; i++) {
    for (let j = i + 1; j < sCenou.length; j++) {
      if (sCenou[i].cena === sCenou[j].cena) continue;
      parCelkem++;
      const drazsi = sCenou[i].cena > sCenou[j].cena ? sCenou[i] : sCenou[j];
      const levnejsi = sCenou[i].cena > sCenou[j].cena ? sCenou[j] : sCenou[i];
      if (drazsi.kryti < levnejsi.kryti) obracene++;
    }
  }
  pravda(`porovnalo se dost párů okresů (${parCelkem})`, parCelkem > 100, `${parCelkem}`);
  pravda('tmavší opravdu znamená dražší u každého páru okresů', obracene === 0,
    `${obracene} z ${parCelkem} párů je obráceně — legenda by lhala`);

  /* Okresy bez dostatku nabídek musí být poznat, a NE jako „nejlevnější". */
  const malo = zMapy.filter((x) => x.malo);
  if (malo.length) {
    const kryti = [...new Set(malo.map((x) => x.kryti))];
    pravda(`okresy bez dat (${malo.length}) mají vlastní odstín, ne odstín nejlevnějšího`,
      kryti.length === 1 && !sCenou.some((x) => x.kryti === kryti[0]),
      `krytí bez dat ${kryti.join(',')}, s cenou nejmenší ${Math.min(...sCenou.map((x) => x.kryti))}`);
  } else {
    pravda('okresy bez dat — žádné nejsou, nic k rozlišení', true);
  }

  pravda('otevření stránky s mapou nevolá ŽÁDNÝ cizí server',
    ciziPozadavky.length === 0, ciziPozadavky.slice(0, 3).join(', '));
  pravda('a nic nespadlo do konzole', chybyKonzole.length === 0, chybyKonzole.slice(0, 2).join(' | '));
  await ctx.close();
} finally {
  await prohlizec.close();
}
hotovo();
