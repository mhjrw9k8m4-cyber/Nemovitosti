#!/usr/bin/env node
/* ROZESÍLÁNÍ HLÍDÁNÍ JAKO UPOZORNĚNÍ DO TELEFONU (push)
   ==================================================================
   Spuštění: node scripts/send-push.mjs            (nasucho, nic neodejde)
             node scripts/send-push.mjs --opravdu  (odešle)

   Prostředí:
     SUPABASE_SERVICE_ROLE_KEY   — bez něj není z čeho číst uložená hledání
     PK_VAPID_PRIVATNI           — privátní klíč VAPID (secret!)
     PK_VAPID_VEREJNY            — veřejný klíč VAPID (týž jako v js/config.js)
     PK_VAPID_SUBJECT            — např. mailto:vase@adresa.cz
     PK_PUSH_ODSTUP_HODIN        — nejmenší odstup mezi dvěma upozorněními (20)
     PK_PUSH_LIMIT               — kolik nejvíc za jeden běh (200)

   NASUCHO JE VÝCHOZÍ STAV, a to schválně. Upozornění se nedá vzít
   zpátky — na rozdíl od e-mailu ho člověk dostane na uzamčenou obrazovku.
   Bez --opravdu se tedy jen vypíše, co by odešlo.

   SHODU POČÍTÁ TÁŽ FUNKCE JAKO PROHLÍŽEČ (js/hlidani-logika.js), ne
   vlastní SQL. Dvě různá pravidla by znamenala, že upozornění slibuje
   něco jiného než web. Ze stejného důvodu se odkaz bere z mapy souborů
   generátoru stránek, ne z vlastního počítání jména: na klíči nabídky se
   pozemky srážejí a generátor dává druhému z nich jméno jiné — tenhle
   skript by jinak poslal člověka na stránku JINÉHO pozemku. (Táž vada už
   byla v kanálech novinek i v e-mailech.)

   PRVNÍ BĚH NEPOSÍLÁ NIC. Zapíše se, co je v hledání dnes, a teprve co
   přibude potom, je „nové". Bez toho by si každý, kdo si upozornění
   zapne, odnesl upozornění na padesát pozemků, které už dávno viděl.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mapaSouboru, klicNabidky } from './generate-parcel-pages.mjs';
import { posli as posliPush } from './web-push.mjs';
import { terminText, tvarNovyPozemek } from './mail-sklad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const PKH = require_(path.join(ROOT, 'js', 'hlidani-logika.js'));

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const VAPID = {
  privatni: process.env.PK_VAPID_PRIVATNI || '',
  verejny: process.env.PK_VAPID_VEREJNY || '',
  subject: process.env.PK_VAPID_SUBJECT || '',
};
const OPRAVDU = process.argv.includes('--opravdu');
const ODSTUP = Math.max(parseInt(process.env.PK_PUSH_ODSTUP_HODIN || '20', 10) || 20, 1);
const LIMIT = Math.max(parseInt(process.env.PK_PUSH_LIMIT || '200', 10) || 200, 1);
/* Kolik pozemků se vejde do jednoho upozornění. Víc než tři názvy obcí se
   na uzamčené obrazovce neukáže, takže zbytek by nikdo nepřečetl — a přitom
   by se zapsal jako odeslaný a už nikdy nepřišel. */
const MAX_V_UPOZORNENI = 3;

const log = (...a) => console.log(...a);

async function sb(cesta, volby = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + cesta, {
    ...volby,
    headers: {
      apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json', ...(volby.headers || {}),
    },
  });
  const telo = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${telo.slice(0, 300)}`);
  return telo ? JSON.parse(telo) : null;
}
const rpc = (jmeno, args) => sb('rpc/' + jmeno, { method: 'POST', body: JSON.stringify(args || {}) });

async function poslaneKlice(hledaniId) {
  const r = await sb(`push_poslane?hledani_id=eq.${encodeURIComponent(hledaniId)}&select=klic&limit=100000`);
  return (r || []).map((x) => x.klic);
}

/* TEXT UPOZORNĚNÍ. Krátce a konkrétně: na uzamčené obrazovce je vidět
   jeden řádek nadpisu a dva řádky textu. „Máte 3 nové pozemky" je
   k ničemu — nedá se podle toho rozhodnout, jestli se na to teď podívat.
   Proto obce a ceny. */
export function zprava(hledani, nove) {
  const prvni = nove.slice(0, MAX_V_UPOZORNENI);
  const kusy = prvni.map((d) => {
    const misto = d.place || d.okres || 'pozemek';
    const cena = (d.price > 0 && d.area > 0) ? ` ${Math.round(d.price / d.area)} Kč/m²` : '';
    /* TERMÍN DRAŽBY JDE PŘED CENU. Naměřeno: ze 166 dražeb a exekucí je
       24 do týdne a 6 do dvou dnů. U dražby je termín ta jediná věc, která
       nutí jednat hned — cena se dá přečíst i za dva dny, dražba ne.
       Na uzamčené obrazovce jsou vidět dva řádky, takže na místě, kde se
       krátí, musí zůstat on. Odpočet („zítra") i datum: upozornění se čte
       i později a odpočet by pak lhal. */
    const termin = terminText(d);
    return misto + (termin ? ` — ${termin}` : cena);
  });
  const zbytek = nove.length - prvni.length;
  return {
    nadpis: nove.length === 1
      ? 'Nový pozemek v hlídání'
      : `${nove.length} ${tvarNovyPozemek(nove.length)} v hlídání`,
    text: (hledani.label ? hledani.label + ': ' : '') + kusy.join(' · ')
      + (zbytek > 0 ? ` a ${zbytek} dalších` : ''),
    /* Vede se na Upozornění, kde jsou vypsané — ne na mapu, kde by se
       nové od ostatních nijak nelišily. */
    odkaz: 'upozorneni.html',
    /* Značka slučuje upozornění z téhož hledání: tři zprávy ze stejného
       hledání nemají vyskočit třikrát. */
    znacka: String(hledani.hledani_id || 'parcelka'),
  };
}

async function main() {
  const dataCesta = path.join(ROOT, 'data', 'opportunities.json');
  if (!fs.existsSync(dataCesta)) { console.error('::error::data/opportunities.json chybí'); process.exit(1); }
  const soubor = JSON.parse(fs.readFileSync(dataCesta, 'utf8'));
  const data = Array.isArray(soubor) ? soubor : (soubor.opportunities || []);
  if (!data.length) { console.error('::error::v datech není jediná nabídka — nic se nerozesílá'); process.exit(1); }

  const bezDuplicit = PKH.bezDuplicit(data);
  const STRANKY = mapaSouboru(bezDuplicit);
  for (const d of bezDuplicit) {
    const zapis = STRANKY.get(klicNabidky(d));
    d.soubor = zapis ? zapis.soubor : null;
  }

  if (!SERVICE_KEY) {
    log('SUPABASE_SERVICE_ROLE_KEY není nastavený — není z čeho číst uložená hledání. Nic se nedělá.');
    log(`(v datech je ${data.length} nabídek, takže až klíč bude, je co porovnávat)`);
    return;
  }

  const maKlice = !!(VAPID.privatni && VAPID.verejny && VAPID.subject);
  const rezim = (OPRAVDU && maKlice) ? 'ODESÍLÁM' : 'NASUCHO';
  if (rezim === 'NASUCHO') {
    const proc = !OPRAVDU ? 'chybí přepínač --opravdu'
      : !VAPID.privatni ? 'chybí PK_VAPID_PRIVATNI'
        : !VAPID.verejny ? 'chybí PK_VAPID_VEREJNY'
          : 'chybí PK_VAPID_SUBJECT';
    log(`Režim NASUCHO (${proc}): vypíšu, co by odešlo, a neodešlu nic.`);
  }

  let rady;
  try {
    rady = await rpc('hlidani_k_odeslani_push', { p_odstup_hodin: ODSTUP });
  } catch (e) {
  /* PGRST202 = tahle funkce v databázi není. To není porucha běhu, ale
     stav nasazení: SQL ze supabase/00-vse.sql ještě nikdo nepustil
     v editoru Supabase. Dokud to někdo neudělá, nemá co odejít — a padat
     kvůli tomu každý den cronem znamená jen denní e-mail o chybě, se
     kterou tenhle skript nic nenadělá. Stejnou pojistku má celá tahle
     větev už u klíčů: bez nich běží nasucho, ne načerveno. Jakmile SQL
     proběhne, funkce se najde a tahle větev se přestane uplatňovat. */
    if (!/PGRST202/.test(String((e && e.message) || e))) throw e;
    log('Upozornění do telefonu ještě nejsou v databázi: chybí funkce hlidani_k_odeslani_push.');
    log('Nasadí se spuštěním supabase/00-vse.sql v SQL editoru Supabase.');
    return;
  }
  if (!rady || !rady.length) { log('Není komu posílat: žádné hledání se zapnutým upozorněním.'); return; }

  /* Jedno hledání může mít víc zařízení (telefon, tablet, počítač).
     Nové pozemky se počítají JEDNOU na hledání a rozešlou na všechna —
     počítat je na každé zařízení zvlášť by znamenalo tolikrát načítat
     poslané klíče a riskovat, že se mezi tím rozejdou. */
  const podleHledani = new Map();
  for (const r of rady) {
    if (!podleHledani.has(r.hledani_id)) podleHledani.set(r.hledani_id, { h: r, odbery: [] });
    podleHledani.get(r.hledani_id).odbery.push({ endpoint: r.endpoint, p256dh: r.p256dh, auth: r.auth });
  }

  let poslano = 0, zasetych = 0, bezNovych = 0, chyb = 0, mrtvych = 0;
  for (const { h, odbery } of podleHledani.values()) {
    if (poslano >= LIMIT) { log(`Dosažen limit ${LIMIT} upozornění na běh — zbytek až příště.`); break; }
    let poslaneUz;
    try { poslaneUz = await poslaneKlice(h.hledani_id); } catch (e) { chyb++; log('  ! ' + e.message); continue; }
    const hledani = { ...h, seen_keys: poslaneUz };
    const nove = PKH.noveProHledani(hledani, bezDuplicit).filter((d) => d.soubor);

    if (!poslaneUz.length && !h.push_odeslano_at) {
      const klice = data.filter((d) => PKH.matches(hledani, d)).map((d) => PKH.keyOf(d));
      if (rezim === 'ODESÍLÁM') await rpc('push_odeslan', { p_hledani: h.hledani_id, p_klice: klice });
      zasetych++;
      log(`  ○ ${h.label || 'hledání'}: první běh — zapsáno ${klice.length} dosavadních, nic se neposílá`);
      continue;
    }
    if (!nove.length) { bezNovych++; continue; }

    const z = zprava(h, nove);
    const telo = JSON.stringify(z);
    if (rezim === 'ODESÍLÁM') {
      let aspoňJedno = false;
      for (const o of odbery) {
        try {
          const r = await posliPush(o, telo, VAPID);
          if (r.pryc) {
            /* Odběr zanikl. Smaže se, jinak by se do něj tlačilo
               donekonečna a každý běh by hlásil chybu. */
            await rpc('push_odber_mrtvy', { p_endpoint: o.endpoint });
            mrtvych++;
            log(`  – zaniklý odběr smazán (${r.stav})`);
          } else if (r.stav >= 200 && r.stav < 300) {
            aspoňJedno = true;
          } else { chyb++; log(`  ! push služba odpověděla ${r.stav}`); }
        } catch (e) { chyb++; log(`  ! ${e.message}`); }
      }
      /* Zapíše se jen tehdy, když to aspoň na jedno zařízení došlo.
         Jinak by se nabídky označily za odeslané, aniž je kdo viděl. */
      if (aspoňJedno) {
        await rpc('push_odeslan', {
          p_hledani: h.hledani_id,
          p_klice: nove.slice(0, MAX_V_UPOZORNENI).map((d) => PKH.keyOf(d)),
        });
        poslano++;
        log(`  ✓ ${h.label || 'hledání'} → ${odbery.length} zařízení: ${z.nadpis}`);
      }
    } else {
      poslano++;
      log(`  → ${h.label || 'hledání'} → ${odbery.length} zařízení`);
      log(`      ${z.nadpis}`);
      log(`      ${z.text}`);
    }
  }

  log('');
  log(`Hotovo: ${rezim === 'ODESÍLÁM' ? 'odesláno' : 'k odeslání'} ${poslano}`
    + `, první běh ${zasetych}, bez nových ${bezNovych}`
    + (mrtvych ? `, zaniklých odběrů smazáno ${mrtvych}` : '')
    + (chyb ? `, chyb ${chyb}` : ''));
  if (chyb) process.exitCode = 1;
}

/* Při přímém spuštění se rozesílá; při importu (test) se jen nabídne
   zprava(), ať se text dá zkoušet bez databáze. */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('::error::' + e.message); process.exit(1); });
}
