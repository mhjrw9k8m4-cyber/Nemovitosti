/**
 * Sonda zdrojů: které zdroje jde vůbec číst.
 * ====================================================================
 * Spuštění:  node scripts/sonda-zdroju.mjs            (chodí po síti)
 *            node scripts/sonda-zdroju.mjs --suchy     (nic nestahuje, nic nezapíše)
 *            node scripts/sonda-zdroju.mjs --jen-cile  (zapíše, co se bude měřit)
 *
 * CO TO DĚLÁ. U každého zdroje ze scripts/zdroje-kandidati.mjs a u
 * každého hostitele, kterého robot našel ve vlastních datech, zjistí
 * tři věci a zapíše je do data/zdroje-sonda.json:
 *   1) co dovoluje robots.txt pro naše jméno,
 *   2) jestli adresa odpovídá (stav, čas, velikost),
 *   3) hrubý odhad, jestli na té stránce vůbec jsou pozemky.
 *
 * PROČ TO NENÍ STAHOVAČ. Stahovač se dá napsat až na základě měření:
 * jinak se píše naslepo a první, co se o zdroji dozvíme, je, že jeho
 * data jsou v datech webu špatně. Tahle sonda nic nepublikuje a do
 * nabídek nezasahuje — jen měří a zapisuje nález.
 *
 * POŘADÍ JE POVINNÉ: NEJDŘÍV ROBOTS.TXT. Když zakazuje, stránka se
 * nestahuje vůbec; v nálezu zůstane „zakázané" a důvod. Když se
 * robots.txt nepodaří přečíst, platí totéž — nevíme, co je dovolené,
 * takže nebereme (viz smimeCist v scripts/robots.mjs).
 *
 * ŠETRNOST. Na zdroj jdou nejvýš dva dotazy za běh (robots.txt a jedna
 * stránka), mezi hostiteli se čeká PAUZA_MS a případný Crawl-delay
 * z robots.txt se respektuje. Sonda běží jednou týdně, ne v robotu dat.
 *
 * ŽÁDNÉ OBCHÁZENÍ. Hlavička user-agent je jediná (scripts/bot-ua.mjs),
 * nestřídá se a nepředstírá prohlížeč. Hlídá scripts/test-sonda-zdroju.mjs.
 */
import { writeFileSync, readFileSync } from 'node:fs';
import { BOT_UA } from './bot-ua.mjs';
import { smimeCist } from './robots.mjs';
import { ZAPOJENE, KANDIDATI, kandidatiZDat } from './zdroje-kandidati.mjs';

export const PAUZA_MS = 2000;          // mezi hostiteli, ať sonda nebuší
export const CAS_LIMIT_MS = 20000;     // na jeden dotaz
export const SONDA_OUT = new URL('../data/zdroje-sonda.json', import.meta.url);
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Hrubý odhad, jestli na stránce jsou pozemky. Je to ukazatel, ne
 * důkaz — proto se vrací počty, ne verdikt: ať je v nálezu vidět,
 * z čeho se soudí. (Na JSON z otevřených dat tahle čísla nic neřeknou
 * a nemají; u nich rozhoduje, že odpověď vůbec přišla.)
 */
export function vyteznost(text) {
  const t = String(text || '');
  const spocti = (re) => (t.match(re) || []).length;
  /* POZOR NA \b U ČESKÝCH ZNAKŮ. „Kč" ani „m²" na slovní hranici
     nekončí — `č` a `²` nejsou pro JavaScript písmena slova, takže
     /\bKč\b/ nenajde nic. Napsané to tak bylo a zkouška to odhalila:
     na textu „1 000 m² za 500 000 Kč" naměřila nula metrů a nula
     korun. Místo \b se proto hlídá, že za jednotkou nenásleduje další
     písmeno (aby „Kčsi" nebo „m2x" neprošly). */
  return {
    metru: spocti(/m(?:²|2)(?![\p{L}])/gu),
    korun: spocti(/K[čc](?![\p{L}])/gu),
    /* „pozemk" NESEDÍ NA „pozemek" — mezi m a k je e. Napsané to tak
       bylo a výpis plný slova „Pozemek" by dostal nulu. */
    slovoPozemek: spocti(/pozemek|pozemk|parcel/gi),
    odkazu: spocti(/href="[^"]*(?:detail|nabidk|drazb|pozemek|parcel)[^"]*"/gi),
    bajtu: t.length,
  };
}

/** Z počtů udělá jedno slovo. Mez je nízká schválně: sonda má říct
 *  „tady se dá hledat dál", ne „tady je 42 pozemků". */
export function slibuje(v) {
  if (!v) return 'nevíme';
  if (v.slovoPozemek >= 3 && (v.korun >= 3 || v.metru >= 3)) return 'slibné';
  if (v.slovoPozemek >= 1 || v.korun >= 1) return 'slabé';
  return 'nic nenasvědčuje';
}

/**
 * Jedno měření. Vrací záznam do nálezu; nikdy nevyhodí výjimku —
 * selhání je výsledek, ne pád.
 */
export async function sondujZdroj(cil, { stahni, ua, mezipamet } = {}) {
  const zapis = {
    jmeno: cil.jmeno || cil.host, host: cil.host, url: cil.url, typ: cil.typ || '?',
    stav: cil.stav || 'kandidát', adresaOverena: cil.adresaOverena === true,
    kdy: new Date().toISOString().slice(0, 10),
  };
  const jmeno = ua || BOT_UA;
  let r = null;
  try { r = await smimeCist(cil.url, { stahni, ua: jmeno, mezipamet }); }
  catch (e) { r = { dovoleno: false, duvod: 'robots.txt: ' + (e && e.message ? e.message : e) }; }
  /* TŘI STAVY, NE DVA. „nedovoluje" je tvrzení o cizim webu — že čtení
     zakazuje. Když se robots.txt nepodaří přečíst, číst se nebude stějů
     co stěj (RFC 9309), ale říct tomu „zakázané" je lhaní do nálezu:
     nález pak slouží k rozhodování, který zdroj zapojit, a zdroj, co se
     dnes nedal změřit, není zdroj, který si nepřeje být čten.
     Napsané po tom, co první běh sondy ohlásil 12 ze 16 zdrojů jako
     zakázané — a byla to vada u nás (viz `telo()` v robots.mjs). */
  zapis.robots = r.dovoleno ? 'dovoluje' : (r.nejdePrecist ? 'nevíme' : 'nedovoluje');
  zapis.robotsDuvod = r.duvod || '';
  if (r.delay != null) zapis.crawlDelay = r.delay;
  if (!r.dovoleno) {
    zapis.verdikt = r.nejdePrecist ? 'robots neznámý' : 'zakázané';
    /* U ZAPOJENÝCH zdrojů se do nálezu připojí celý text robots.txt.
       Důvod je v robots.mjs: odpojit zdroj je rozhodnutí, které se nemá
       dělat podle jedné věty. U kandidátů to netreba — tam je zákaz
       prostě „tím se nezabýváme". */
    if (cil.stav === 'zapojeno' && r.text) zapis.robotsText = r.text;
    return zapis;
  }
  if (r.delay) await spi(Math.min(r.delay, 30) * 1000);
  const zacatek = Date.now();
  try {
    const odp = await stahni(cil.url, { casLimit: CAS_LIMIT_MS, pokusy: 1 });
    zapis.odpoved = odp.status;
    const text = await odp.text();
    zapis.ms = Date.now() - zacatek;
    zapis.vyteznost = vyteznost(text);
    zapis.verdikt = odp.ok ? 'dostupné' : 'neodpovídá';
    zapis.slibuje = odp.ok ? slibuje(zapis.vyteznost) : 'nevíme';
  } catch (e) {
    zapis.ms = Date.now() - zacatek;
    zapis.verdikt = 'neodpovídá';
    zapis.chyba = String(e && e.message ? e.message : e).slice(0, 160);
  }
  return zapis;
}

/**
 * Ukazuje nález na vadu u NÁS, místo na cizí weby?
 *
 * Napsané po tom, co první běh sondy ohlásil 12 ze 16 zdrojů jako
 * zakázané — a u VŠECH DVANÁCTI stál týž důvod, „robots.txt odpověděl
 * 200". Nebyla to pravda o cizích webech, byla to vada v našem čtení
 * (§337). Nález se přitom zapsal jako pravda a diagnostika podle něj
 * radila odebrat zdroje, které nic nezakazují.
 *
 * Pravidlo, které z toho plyne: dvanáct různých webů — od státního
 * úřadu po soukromé dražebníky — se nerozhodne stejně a ze stejného
 * důvodu. Když většina zdrojů dopadne stejně a se SLOVO OD SLOVA
 * týmž vysvětlením, je nejpravděpodobnější vysvětlení naše vada.
 *
 * Mez je polovina měřených zdrojů, nejméně tři. Polovina proto, že
 * právě tak se pozná „většina", a ne „shodou okolností dva weby":
 * dva weby s týmž CMS mají robots.txt klidně stejný. Vrací popis
 * nálezu, ne jen ano/ne, ať se dá do hlášky napsat číslo.
 */
export function vzorecNasiVady(nalez) {
  const zdroje = Array.isArray(nalez) ? nalez : [];
  const nepovoleno = zdroje.filter((z) => z && z.robots !== 'dovoluje');
  const podleDuvodu = new Map();
  for (const z of nepovoleno) {
    const d = String((z && z.robotsDuvod) || '(bez důvodu)');
    podleDuvodu.set(d, (podleDuvodu.get(d) || 0) + 1);
  }
  let duvod = '', kolik = 0;
  for (const [d, n] of podleDuvodu) if (n > kolik) { duvod = d; kolik = n; }
  const mez = Math.max(3, Math.ceil(zdroje.length / 2));
  return { duvod, kolik, mez, celkem: zdroje.length, nasiVada: kolik >= mez };
}

/** Celý seznam cílů: zapojené, kandidáti a to, co robot našel sám. */
export function cileSondy(nabidky) {
  const cile = [
    ...ZAPOJENE.map((z) => ({ ...z, stav: 'zapojeno' })),
    ...KANDIDATI.map((z) => ({ ...z, stav: 'kandidát' })),
  ];
  for (const n of kandidatiZDat(nabidky)) {
    cile.push({
      jmeno: n.host, host: n.host, url: n.priklad, typ: 'drazba',
      stav: 'z vlastních dat', adresaOverena: true,
      proc: `Tenhle hostitel se ${n.pocet}× objevil v odkazech našich nabídek`
        + ' (centrální evidence dražeb odkazuje na dražebníky), seznam ho nezná.',
    });
  }
  return cile;
}

/** Kolik procent nabídek nese nejsilnější zdroj — číslo, kvůli kterému
 *  tahle sonda existuje. */
export function zavislost(nabidky, zdrojNabidky) {
  const podle = new Map();
  for (const o of (nabidky || [])) {
    const z = zdrojNabidky(o) || '(nepřiřazeno)';
    podle.set(z, (podle.get(z) || 0) + 1);
  }
  const serazene = [...podle.entries()].sort((a, b) => b[1] - a[1]);
  const celkem = (nabidky || []).length || 1;
  return {
    celkem,
    nejsilnejsi: serazene[0] ? serazene[0][0] : null,
    podil: serazene[0] ? Math.round((serazene[0][1] / celkem) * 100) : 0,
    podleZdroje: Object.fromEntries(serazene),
  };
}

async function main() {
  const suchy = process.argv.includes('--suchy');
  let nabidky = [];
  try { nabidky = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities || []; }
  catch { nabidky = []; }
  const { stahni, zdrojNabidky } = await import('./fetch-opportunities.mjs');
  const cile = cileSondy(nabidky);
  const zav = zavislost(nabidky, zdrojNabidky);
  console.log(`Zdrojů k měření: ${cile.length}.`
    + ` Nejsilnější zdroj dnes nese ${zav.podil} % nabídek (${zav.nejsilnejsi}).`);
  if (suchy) {
    for (const c of cile) console.log(`  · ${c.stav.padEnd(16)} ${c.jmeno} — ${c.url}`);
    console.log('Suchý běh: nic se nestahovalo, nic se nezapsalo.');
    return;
  }
  /* --jen-cile: do souboru se zapíše SEZNAM CÍLŮ bez měření. Je to
     stav „sonda ještě neběžela" napsaný tak, aby se nedal přečíst
     jako nález: u každého zdroje stojí verdikt „neměřeno". Diagnostika
     podle toho pozná rozdíl mezi „nezměřeno" a „nedostupné". */
  if (process.argv.includes('--jen-cile')) {
    writeFileSync(SONDA_OUT, JSON.stringify({
      updated: null, updated_at: null, zavislost: zav,
      souhrn: { dostupne: 0, zakazane: 0, nezjisteno: 0, neodpovida: 0, slibnych: 0 },
      zdroje: cile.map((c) => ({
        jmeno: c.jmeno, host: c.host, url: c.url, typ: c.typ, stav: c.stav,
        adresaOverena: c.adresaOverena === true, verdikt: 'neměřeno',
      })),
    }) + '\n', 'utf8');
    console.log(`Zapsán seznam ${cile.length} cílů bez měření (verdikt „neměřeno").`);
    return;
  }
  const nalez = [];
  const mezipamet = new Map();
  for (const c of cile) {
    const z = await sondujZdroj(c, { stahni, ua: BOT_UA, mezipamet });
    nalez.push(z);
    console.log(`  ${(z.verdikt || '?').padEnd(12)} ${z.jmeno} — robots ${z.robots}`
      + (z.odpoved ? `, odpověď ${z.odpoved}` : '')
      + (z.slibuje ? `, obsah ${z.slibuje}` : '')
      + (z.chyba ? `, ${z.chyba}` : ''));
    await spi(PAUZA_MS);
  }
  const souhrn = {
    dostupne: nalez.filter((z) => z.verdikt === 'dostupné').length,
    zakazane: nalez.filter((z) => z.verdikt === 'zakázané').length,
    /* Zvlášť od zakázaných: tyhle zdroje číst nebudeme, ale ne proto,
       že by si to nepřály — proto, že se to dnes nedalo zjistit. */
    nezjisteno: nalez.filter((z) => z.verdikt === 'robots neznámý').length,
    neodpovida: nalez.filter((z) => z.verdikt === 'neodpovídá').length,
    slibnych: nalez.filter((z) => z.slibuje === 'slibné' && z.stav !== 'zapojeno').length,
  };
  /* POJISTKA PROTI MĚŘENÍ Z ROZBITÉ SÍTĚ. Když neodpoví ANI JEDEN
     zdroj, zdaleka nejpravděpodobnější vysvětlení není, že deset webů
     spadlo naráz — ale že nefunguje síť na naší straně. Přepsat tím
     dřívější nález by znamenalo o cizích webech tvrdit, že jsou mrtvé,
     protože jsme se k nim nedostali. Soubor se proto nechá být a úloha
     skončí chybou, ať přijde upozornění. (Je to táž úvaha jako
     u globální pojistky robota dat, viz §332.) */
  let drive = null;
  try { drive = JSON.parse(readFileSync(SONDA_OUT, 'utf8')); } catch { drive = null; }
  const drivDostupnych = drive && drive.souhrn ? (drive.souhrn.dostupne || 0) : 0;
  if (souhrn.dostupne === 0 && drivDostupnych > 0) {
    console.error(`CHYBA: neodpověděl ani jeden z ${nalez.length} zdrojů, minule jich`
      + ` odpovídalo ${drivDostupnych}. To nevypadá na výpadek zdrojů, ale na síť`
      + ' na naší straně — nález nechávám být.');
    process.exit(1);
  }
  /* DRUHÁ POJISTKA: STEJNÝ DŬVOD U VĚTŠINY ZDROJŮ UKAZUJE NA NÁS.
     Úvaha i mez jsou u `vzorecNasiVady` výš; tady se jen jedná. */
  const vzorec = vzorecNasiVady(nalez);
  if (vzorec.nasiVada) {
    console.error(`CHYBA: ${vzorec.kolik} z ${vzorec.celkem} zdrojů dopadlo stejně`
      + ` a se stejným důvodem („${vzorec.duvod}"). Tolik různých webů se stejně`
      + ' nerozhodne — tohle ukazuje na vadu v našem čtení, ne na cizí weby.'
      + ' Nález nechávám být (viz §337).');
    process.exit(1);
  }
  writeFileSync(SONDA_OUT, JSON.stringify({
    updated: new Date().toISOString().slice(0, 10),
    updated_at: new Date().toISOString(),
    zavislost: zav, souhrn, zdroje: nalez,
  }) + '\n', 'utf8');
  console.log(`Zapsáno do data/zdroje-sonda.json: ${souhrn.dostupne} dostupných,`
    + ` ${souhrn.zakazane} zakázaných, ${souhrn.nezjisteno} s neznámým robots.txt,`
    + ` ${souhrn.neodpovida} bez odpovědi,`
    + ` ${souhrn.slibnych} slibných kandidátů.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Sonda zdrojů spadla:', e); process.exit(1); });
}
