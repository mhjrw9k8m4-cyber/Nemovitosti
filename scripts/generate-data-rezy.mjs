#!/usr/bin/env node
/* ŘEZY DAT PO OKRESECH A KRAJÍCH
   ==================================================================
   Celý soubor data/opportunities.json má 637 kB a 2 012 nabídek. Komu
   jde o jeden okres — a to je většina těch, kdo si data berou —
   si dosud musel stáhnout všechno a vyhodit 97 % z toho. Řez okresu
   Benešov má 10,8 kB.

   Statický web nemůže mít REST ani GraphQL: není kde běžet. Tohle je
   jeho obdoba, která funguje líp než většina skutečných rozhraní —
   obyčejný soubor na obyčejném serveru, cachovatelný, bez klíče, bez
   limitů a bez výpadku aplikační vrstvy.

   TVAR JE TÝŽ JAKO U CELKU. Kdo umí číst data/opportunities.json, umí
   přečíst i řez: stejná hlavička, stejné pole „opportunities", stejná
   pole u nabídky (viz data/pole.json). Jediný rozdíl je „rez", kde
   stojí, čí výběr to je — aby se řez nedal splést s celkem.

   data/index.json je rozcestník: co existuje, kolik to má nabídek
   a jak je to velké. Bez něj by se muselo hádat, jak se soubor okresu
   jmenuje.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Jméno souboru se skládá TOUŽ funkcí jako jméno stránky okresu, ať
   si člověk může řez odvodit z adresy stránky, na které stojí. */
export function slug(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* SESTAVENÍ JE VE FUNKCI, NE NA NEJVYŠŠÍ ÚROVNI.
   Zkouška scripts/test-data-rezy.mjs si odtud bere slug() — a dokud
   bylo sestavení v těle modulu, prostý import ho SPUSTIL: zkouška si
   řezy přestavěla a teprve pak je kontrolovala. Všechny čtyři sabotáže
   (chybějící nabídka, cizí okres v řezu, zastaralá hlavička, lhoucí
   rozcestník) proto prošly — kontrola si je sama spravila dřív, než se
   podívala. Tohle je přesně ta vada, kterou zkouška nepozná na sobě. */
export async function spust() {
  /* ---- sestavení ---- */
  const celek = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
  const vse = celek.opportunities || [];
  if (!vse.length) {
    console.error('::error::data/opportunities.json je prázdný — řezy by přepsaly dobrá data prázdnem.');
    process.exit(1);
  }

  const { createRequire } = await import('node:module');
  const require_ = createRequire(import.meta.url);
  const CENY = (() => {
    require_(path.join(ROOT, 'js', 'ceny.js'));
    return globalThis.PK_CENY;
  })();
  const OKRES_KRAJ = (CENY && CENY.OKRES_KRAJ) || {};
  if (!Object.keys(OKRES_KRAJ).length) {
    console.error('::error::tabulka okres → kraj se nenačetla z js/ceny.js');
    process.exit(1);
  }

  const hlavicka = {
    updated: celek.updated,
    updated_at: celek.updated_at,
    source: celek.source,
  };

  function zapis(rel, obj) {
    const cesta = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(cesta), { recursive: true });
    const text = JSON.stringify(obj);
    const stare = fs.existsSync(cesta) ? fs.readFileSync(cesta, 'utf8') : null;
    if (stare !== text) fs.writeFileSync(cesta, text);
    return Buffer.byteLength(text);
  }

  const podleOkresu = new Map();
  const podleKraje = new Map();
  for (const o of vse) {
    if (!o || !o.okres) continue;
    if (!podleOkresu.has(o.okres)) podleOkresu.set(o.okres, []);
    podleOkresu.get(o.okres).push(o);
    const k = OKRES_KRAJ[o.okres];
    if (!k) continue;
    if (!podleKraje.has(k)) podleKraje.set(k, []);
    podleKraje.get(k).push(o);
  }

  /* Co na disku zůstalo po okresu, který už nabídku nemá, by lhalo:
     soubor by se neobnovil a vypadal by jako aktuální. Přepíše se tedy
     na prázdný řez — ne smaže, aby odkaz nevracel 404. */
  function uklid(adresar, ziveSoubory, uroven) {
    const dir = path.join(ROOT, 'data', adresar);
    if (!fs.existsSync(dir)) return 0;
    let prazdnych = 0;
    for (const f of fs.readdirSync(dir)) {
      if (!f.endsWith('.json') || ziveSoubory.has(f)) continue;
      const obj = Object.assign({}, hlavicka, {
        rez: { uroven, nazev: null, soubor: `data/${adresar}/${f}`, pocet: 0 },
        opportunities: [],
      });
      zapis(`data/${adresar}/${f}`, obj);
      prazdnych++;
    }
    return prazdnych;
  }

  const rejstrik = { updated: celek.updated, updated_at: celek.updated_at, rezy: [] };
  let bajtu = 0;
  const ziveOkres = new Set();

  for (const [okres, polozky] of [...podleOkresu].sort()) {
    const soubor = `data/okres/${slug(okres)}.json`;
    ziveOkres.add(`${slug(okres)}.json`);
    const b = zapis(soubor, Object.assign({}, hlavicka, {
      rez: { uroven: 'okres', nazev: okres, kraj: OKRES_KRAJ[okres] || null, soubor, pocet: polozky.length },
      opportunities: polozky,
    }));
    bajtu += b;
    rejstrik.rezy.push({ uroven: 'okres', nazev: okres, kraj: OKRES_KRAJ[okres] || null, soubor, pocet: polozky.length, bajtu: b });
  }
  /* KRAJSKÉ ŘEZY SE NEDĚLAJÍ, A JE TO ÚMYSL.
     Kraj je součet svých okresů, takže by to byla druhá kopie týchž
     nabídek — dohromady 1 302 kB místo 637 kB. A ten soubor se obnovuje
     ČTYŘIKRÁT DENNĚ, takže by se tím zdvojnásobil přírůstek historie
     repozitáře (dnes už má .git 875 MB). Kdo chce kraj, vezme si jeho
     okresy; které to jsou, stojí v rejstříku níž, takže to nikdo
     nemusí hádat. */
  const kraje = {};
  for (const [kraj, polozky] of [...podleKraje].sort()) {
    kraje[kraj] = {
      pocet: polozky.length,
      okresy: [...podleOkresu.keys()].filter((o) => OKRES_KRAJ[o] === kraj).sort()
        .map((o) => `data/okres/${slug(o)}.json`),
    };
  }
  const prazdnych = uklid('okres', ziveOkres, 'okres');

  rejstrik.celek = {
    soubor: 'data/opportunities.json',
    pocet: vse.length,
    bajtu: fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size,
  };
  rejstrik.kraje = kraje;
  rejstrik.popis = 'Řezy téhož souboru po okresech. Tvar je stejný jako u celku '
    + '(viz data/pole.json), navíc je tu „rez" s tím, čí výběr to je. Kdo chce jeden okres, '
    + 'nemusí stahovat celek. Krajské řezy nejsou schválně — kraj je součet svých okresů '
    + 'a jejich soubory najdete v „kraje".';
  zapis('data/index.json', rejstrik);

  console.log(`Řezy dat: ${podleOkresu.size} okresů (${podleKraje.size} krajů jako soupis)`
    + ` = ${(bajtu / 1024).toFixed(0)} kB dohromady`
    + ` (celek má ${(rejstrik.celek.bajtu / 1024).toFixed(0)} kB, nejmenší řez`
    + ` ${(Math.min(...rejstrik.rezy.map((r) => r.bajtu)) / 1024).toFixed(1)} kB)`
    + (prazdnych ? `, vyprázdněno ${prazdnych} bez nabídek` : ''));

}

if (import.meta.url === `file://${process.argv[1]}`) await spust();
