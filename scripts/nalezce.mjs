/* NÁLEZCE — CO SI MÁ STROJ NAJÍT SÁM
   ==================================================================
   Tenhle soubor NECHODÍ po síti a NIC nemění. Čte data a repozitář
   a vrací NÁLEZY: pojmenované, s důkazem a s třídou příčiny.
   Smyčka, která z nich dělá práci, je scripts/samorozvoj.mjs.

   PROČ TO VZNIKÁ. Každá vada, kterou jsem dnes našel, se našla stejně:
   něco se nesrovnalo v ČÍSLECH a já se zeptal proč. Postup je vždycky
   týž, jen předmět jiný:

     · zdroj stáhl 91 nabídek a na web dal 0 (§371),
     · 19 ze 118 nabídek mělo jako obec číslo parcely,
     · dva různé pozemky dostaly týž klíč archivu,
     · mez „víc než 20 dražeb" měřila staré složení dat (§372),
     · sabotáž prošla zeleně, protože zkouška měla slepé místo (§369).

   Všech pět se dá SPOČÍTAT. Nálezce je proto soustavná podoba toho,
   co jsem dělal po jednom: projde ta měření pokaždé, pojmenuje, co
   nesedí, a přiloží důkaz.

   CO NÁLEZCE NEDĚLÁ A DĚLAT NEBUDE. Nerozhoduje. Nález není oprava
   ani úkol „udělej to takhle" — je to věta „tady čísla nesedí a tady
   je důkaz". Co z toho plyne pro web, rozhoduje člověk; stroj to
   smí nejvýš spočítat a ukázat. A nic nepřepisuje: zápis do dat ani
   do kódu tenhle soubor neumí (hlídá test-samorozvoj).
   ================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');

/* Třídy příčin. Jméno třídy rozhoduje, kdo to má v ruce — a proto se
   nemíchají: „data" spraví zdroj nebo čtečka, „kód" my, „zkouška"
   znamená, že vada je v měření, ne v měřeném. */
export const TRIDY = ['data', 'kód', 'zkouška', 'hlídač'];

export function nalez(jmeno, trida, tiha, dukaz, co) {
  return { jmeno, trida, tiha, dukaz: String(dukaz).slice(0, 400), co: co || '' };
}

/* ------------------------------------------------------------------
   1) ZDROJ STÁHL A NA WEB NEDAL. Tohle je §371: ÚZSVM mělo stav „ok",
   91 nabídek a na webu nulu, protože ho výběr prodejů poznával podle
   prózy. Hlídka zdrojů mlčela správně — stav se počítá z toho, co se
   STÁHLO. Chybělo porovnání se tím, co se ZVEŘEJNILO, a to je tohle.
   ------------------------------------------------------------------ */
export const MEZ_NEVYSVETLENE = 0.25;      // víc než čtvrtina pryč bez jména = nález

export function zdrojeNaWebu(data) {
  const nabidky = (data && data.opportunities) || [];
  const zdroje = (data && data.sources) || [];
  const publikovano = new Map();
  for (const o of nabidky) {
    const z = String((o && o.zdroj) || '?');
    publikovano.set(z, (publikovano.get(z) || 0) + 1);
  }
  const ven = [];
  for (const z of zdroje) {
    const jmeno = String(z.nazev || '?');
    const stazeno = Number(z.pocet) || 0;
    const naWebu = publikovano.get(jmeno) || 0;
    const sito = Number(z.nepustilo) || 0;
    /* Co se dá vysvětlit: síto (s důvodem) a kroky za sítem. Zbytek
       je nevysvětlený úbytek — a ten je nález.
       KROKY ZA SÍTEM SE AŽ DO 4. 11. NEPOČÍTALY a nálezce proto hlásil
       úbytek i tam, kde byl celý vysvětlený: zdroj Dražby stáhl 45,
       na webu 20, síto 6 — a devatenáct chybějících byly proběhlé
       dražby, které robot vyhazuje právem. Teď to robot počítá komu
       (`zaSitem`), takže nálezce nehádá. */
    const zaSitem = Number(z.zaSitem) || 0;
    const vysvetleno = sito + zaSitem;
    const nevysvetleno = Math.max(0, stazeno - naWebu - vysvetleno);
    if (stazeno > 0 && naWebu === 0) {
      ven.push(nalez(`zdroj ${jmeno} nedává na web nic`, 'kód', 3,
        `stav „${z.stav}", stáhl ${stazeno}, síto nepustilo ${sito}, na webu 0`,
        'Mezi stažením a zveřejněním se nabídky ztrácejí beze jména (§371).'));
      continue;
    }
    if (stazeno >= 20 && nevysvetleno / stazeno > MEZ_NEVYSVETLENE) {
      ven.push(nalez(`zdroj ${jmeno}: nevysvětlený úbytek`, 'kód', 2,
        `stáhl ${stazeno}, na webu ${naWebu}, síto ${sito}, za sítem ${zaSitem}`
        + ` (${z.zaSitemDuvod || 'bez rozpisu'}), bez jména ${nevysvetleno}`,
        'Každý krok, který nabídku zahodí, se má jmenovat a počítat (§366).'));
    }
  }
  return ven;
}

/* ------------------------------------------------------------------
   2) MÍSTO, KTERÉ MÍSTEM NENÍ. Naměřeno dnes: 19 ze 118 nabídek ÚZSVM
   mělo jako obec „p. p. č. 1759/1" nebo jednací značku aukce
   „EAS/ULT/130/2026". Na kartě to stojí vedle okresu a geokodér to
   hledá v mapě.
   ------------------------------------------------------------------ */
export const VZOR_PARCELY = /p\.?\s*p?\.?\s*[čc]\.?\s*\d|parc\.?\s*[čc]|^\s*\d+\s*\/\s*\d/i;
export const VZOR_SPISU = /\b[A-ZÁ-Ž]{2,4}\/[A-ZÁ-Ž0-9]{1,6}\/\d+\/\d{2,4}\b/;

export function mistaKteraNejsouMisto(data) {
  const nabidky = (data && data.opportunities) || [];
  const spatne = [];
  for (const o of nabidky) {
    const m = String((o && o.place) || '');
    if (!m) continue;
    if (VZOR_PARCELY.test(m) || VZOR_SPISU.test(m)) {
      spatne.push({ place: m, zdroj: String(o.zdroj || '?'), okres: String(o.okres || '?') });
    }
  }
  if (!spatne.length) return [];
  const podleZdroje = new Map();
  for (const s of spatne) podleZdroje.set(s.zdroj, (podleZdroje.get(s.zdroj) || 0) + 1);
  const rozpis = [...podleZdroje.entries()].map(([z, n]) => `${z} ${n}×`).join(', ');
  return [nalez('místo, které místem není', 'data', 3,
    `${spatne.length} nabídek (${rozpis}); např. „${spatne[0].place}" v okrese ${spatne[0].okres}`,
    'Vymyšlené místo je horší než chybějící nabídka: geokodér hledá v mapě číslo parcely.')];
}

/* ------------------------------------------------------------------
   3) DVĚ NABÍDKY, JEDEN KLÍČ. Klíč archivu drží historii cen jedné
   nabídky. Když ho dvě nabídky sdílí, jedna o svou historii přijde —
   a druhá dostane cizí. Naměřeno dnes na dvou nabídkách Lesů ČR,
   které se lišily jen parametrem `?id=`.
   ------------------------------------------------------------------ */
export function klicKoliduje(data, klicArchivu) {
  const nabidky = (data && data.opportunities) || [];
  if (typeof klicArchivu !== 'function') return [];
  const podle = new Map();
  for (const o of nabidky) {
    let k = '';
    try { k = klicArchivu(o); } catch { k = ''; }
    if (!k) continue;
    if (!podle.has(k)) podle.set(k, []);
    podle.get(k).push(o);
  }
  const kolize = [...podle.entries()].filter(([, v]) => v.length > 1);
  if (!kolize.length) return [];
  const [k, dve] = kolize[0];
  return [nalez('dvě nabídky mají týž klíč archivu', 'kód', 3,
    `${kolize.length} kolizí; „${k}": ${dve.map((o) => `${o.area} m² za ${o.price} Kč`).join(' vs ')}`
    + (dve[0].url ? ` (${dve[0].url} / ${dve[1].url})` : ''),
    'Jedna z nich přijde o historii cen a druhá dostane cizí.')];
}

/* ------------------------------------------------------------------
   4) ZKOUŠKA, KTEROU NIKDO NEPOUŠTÍ. Zkouška mimo CI je zkouška, která
   nehlídá nic — a je to tišší vada než červená kontrola, protože
   vypadá jako práce hotová. Hlídá to i test-staticka, tady je to
   proto, aby nález uměl stroj spočítat sám a dohromady s ostatními.
   ------------------------------------------------------------------ */
export function zkouskyMimoCI(kdeWorkflow, kdeScripts) {
  /* ČTOU SE VŠECHNY WORKFLOW, NE JEN `testy.yml`. První ostrý běh na
     tomhle uklouzl: nálezce hlásil „3 zkoušky nikdo nepouští" a
     jmenoval `test-chat`, `test-listing` a `test-search` — všechny tři
     přitom pouští `.github/workflows/test-chat.yml`, protože potřebují
     živou Supabase. Byl to FALEŠNÝ NÁLEZ, tedy vada nálezce, ne
     repozitáře; a falešný nález je drahý jinak než chybějící: učí
     člověka hlášení nečíst. (Táž past, kterou `test-staticka.mjs`
     obešel tím, že si čte i ostatní workflow.) */
  const wfDir = kdeWorkflow || join(KOREN, '.github', 'workflows');
  let wf = '';
  try {
    wf = readdirSync(wfDir)
      .filter((f) => /\.ya?ml$/.test(f))
      .map((f) => readFileSync(join(wfDir, f), 'utf8'))
      .join('\n');
  } catch { return [nalez('workflow nejdou přečíst', 'hlídač', 3, wfDir + ' chybí', '')]; }
  if (!wf.trim()) return [nalez('workflow nejdou přečíst', 'hlídač', 3, 'ani jeden soubor', '')];
  const vsechny = readdirSync(kdeScripts || join(KOREN, 'scripts'))
    .filter((f) => /^test-[a-z0-9-]+\.mjs$/.test(f));
  const mimo = vsechny.filter((f) => !wf.includes(f));
  if (!mimo.length) return [];
  return [nalez('zkouška, kterou nikdo nepouští', 'hlídač', 2,
    `${mimo.length} z ${vsechny.length}: ${mimo.slice(0, 5).join(', ')}`,
    'Zkouška mimo CI vypadá jako hotová práce a nehlídá nic.')];
}

/* ------------------------------------------------------------------
   5) HLÍDAČ, KTERÝ NIKDY NIC NEPROKÁZAL. Zkouška, u které ještě ani
   jedna sabotáž neproběhla, je slib, ne důkaz — a §369 ukázal, že
   slib umí být prázdný (dvě sabotáže, které nic nezměnily, a zkoušky
   přitom svítily zeleně). Soupis vede data/sabotaze.json, který plní
   scripts/samorozvoj.mjs.
   ------------------------------------------------------------------ */
export function hlidaciBezDukazu(soupis, vsechnyZkousky) {
  const prokazane = new Set(Object.keys((soupis && soupis.zkousky) || {})
    .filter((k) => ((soupis.zkousky[k] || {}).chytila || 0) > 0));
  const vse = vsechnyZkousky || (() => {
    try {
      return readdirSync(join(KOREN, 'scripts')).filter((f) => /^test-[a-z0-9-]+\.mjs$/.test(f));
    } catch { return []; }
  })();
  const bez = vse.filter((f) => !prokazane.has(f));
  /* A ZVLÁŠŤ TY, KE KTERÝM STROJ NEDOSÁHNE. Zkouška v prohlížeči hlídá
     `js/…`, ale stránky servírují `js/min/…`, které se po sabotáži
     nepřestaví — mechanická sabotáž se k produktu nedostane (viz
     scripts/sabotuj.mjs, verdikt „nedoručená"). Kdyby se tyhle
     hlídače jmenovaly jen „ještě nic neprokázal", smyčka by je brala
     dokola a nikdy by neuspěla. Jejich důkaz zůstává na člověku —
     a dá se udělat: opravit, změřit, že hlídač na starém kódu padal,
     a pak že na opraveném prochází (tak vznikl §382). */
  const z = (soupis && soupis.zkousky) || {};
  const nedosazitelne = bez.filter((f) => (((z[f] || {}).nedorucene) || []).length > 0);
  const ven = [];
  if (bez.length) {
    /* Tíha je 1: není to vada, je to nedokončený důkaz. Smyčka podle
       toho vybírá, co prokázat příště — tím se sama rozvíjí. */
    ven.push(nalez('hlídač, který ještě nic neprokázal', 'hlídač', 1,
      `${bez.length} z ${vse.length} zkoušek nemá ani jednu chycenou sabotáž;`
      + ` na řadě: ${bez.slice(0, 5).join(', ')}`,
      'Zkouška, která nikdy nic nechytila, je slib, ne důkaz (§369).'));
  }
  if (nedosazitelne.length) {
    ven.push(nalez('hlídač, ke kterému stroj nedosáhne', 'hlídač', 1,
      `${nedosazitelne.length} z nich sabotáž vůbec neuvidí — stránky servírují`
      + ` minifikovanou kopii, která se nepřestavuje: ${nedosazitelne.slice(0, 5).join(', ')}`,
      'Mechanická sabotáž tu nemá jak dojít k produktu; důkaz zůstává na člověku.'));
  }
  return ven;
}

/* ------------------------------------------------------------------
   VŠECHNO DOHROMADY. Řadí se podle tíhy, protože člověk čte shora.
   ------------------------------------------------------------------ */
export function vsechnyNalezy({ data, klicArchivu, soupisSabotazi } = {}) {
  const ven = [];
  if (data) {
    ven.push(...zdrojeNaWebu(data));
    ven.push(...mistaKteraNejsouMisto(data));
    if (klicArchivu) ven.push(...klicKoliduje(data, klicArchivu));
  }
  ven.push(...zkouskyMimoCI());
  ven.push(...hlidaciBezDukazu(soupisSabotazi || {}));
  return ven.sort((a, b) => b.tiha - a.tiha || a.jmeno.localeCompare(b.jmeno));
}

export function hlaseniNalezu(nalezy) {
  if (!nalezy || !nalezy.length) return ['Nálezce: nic nenašel. Čísla si dnes odpovídají.'];
  const radky = [`Nálezce: ${nalezy.length} nálezů.`];
  for (const n of nalezy) {
    radky.push(`  [${n.tiha}] ${n.jmeno}  (${n.trida})`);
    radky.push(`        ${n.dukaz}`);
    if (n.co) radky.push(`        ${n.co}`);
  }
  return radky;
}
