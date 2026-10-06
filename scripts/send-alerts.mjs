#!/usr/bin/env node
/* ROZESÍLAČ UPOZORNĚNÍ NA NOVÉ POZEMKY (e-mailem)
   ==================================================================
   Uložené hledání dosud žilo jen v aplikaci: kdo si web neotevřel, o nový
   pozemek přišel. U dražeb to má cenu v hodinách — termín je vypsaný pár
   týdnů dopředu a kdo se podívá za měsíc, čte historii.

   CO TENHLE SKRIPT NEDĚLÁ SÁM OD SEBE: nic neposílá. Odesílá se teprve
   s přepínačem --opravdu A s klíčem poštovní služby. Bez obojího jen
   vypíše, co by odeslal, a skončí s nulou. Je to schválně: cron, který
   po prvním zeleném běhu začne psát skutečným lidem, je přesně to, co se
   nemá stát náhodou.

   SHODU POČÍTÁ TÝŽ KÓD JAKO PROHLÍŽEČ — js/hlidani-logika.js, funkce
   noveProHledani(). Druhé pravidlo v SQL by znamenalo, že e-mail slibuje
   něco jiného než web.

   PRVNÍ BĚH NAD HLEDÁNÍM NEPOSÍLÁ. Zapsal by se do něj celý dosavadní
   obsah — u uloženého okresu i dvě stě nabídek. Místo toho se současné
   shody jen zapíšou jako „už poslané" a pošta začne u toho, co přijde
   potom. Vypíše se to, aby se to nepřehlédlo.

   CO POTŘEBUJE (proměnné prostředí):
     SUPABASE_URL                 — bez něj se bere adresa z js/config.js
     SUPABASE_SERVICE_ROLE_KEY    — bez něj skript nic nepřečte a skončí
     RESEND_API_KEY               — klíč poštovní služby; bez něj jen nasucho
     PK_MAIL_FROM                 — odesílatel, např. "Parcelka <hlidani@parcelaka.cz>"
     PK_MAIL_ODSTUP_HODIN         — nejmenší odstup mezi dvěma e-maily (výchozí 20)
     PK_MAIL_LIMIT                — kolik e-mailů nejvíc za jeden běh (výchozí 200)
     PK_MAIL_API                  — adresa poštovní služby (jen pro zkoušku)

   Spuštění:
     node scripts/send-alerts.mjs            # nasucho, vypíše co by odešlo
     node scripts/send-alerts.mjs --opravdu  # odešle (jen s klíčem)
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mapaSouboru, klicNabidky } from './generate-parcel-pages.mjs';
import * as sklad from './mail-sklad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const PKH = require_(path.join(ROOT, 'js', 'hlidani-logika.js'));

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const MAIL_KEY = process.env.RESEND_API_KEY || '';
const FROM = process.env.PK_MAIL_FROM || '';
const ODSTUP = Math.max(parseInt(process.env.PK_MAIL_ODSTUP_HODIN || '20', 10) || 20, 1);
const LIMIT = Math.max(parseInt(process.env.PK_MAIL_LIMIT || '200', 10) || 200, 1);
const OPRAVDU = process.argv.includes('--opravdu');
/* Adresa poštovní služby je proměnná jen proto, aby se dalo vyzkoušet,
   že se nasucho NEODEŠLE nic a s --opravdu právě jeden e-mail s
   odhlašovací hlavičkou. Zkouška si postaví vlastní server; bez téhle
   štěrbiny by se to dalo tvrdit jen na slovo. */
const MAIL_API = process.env.PK_MAIL_API || 'https://api.resend.com/emails';

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

/* Odeslání jedním HTTPS požadavkem, bez knihovny — repozitář závislosti
   nemá a kvůli jednomu POSTu je nechce. List-Unsubscribe je hlavička,
   kterou si poštovní klienti kreslí jako tlačítko „Odhlásit"; bez ní
   lidé místo odhlášení klikají na „spam", a to poškodí doručování všem. */
async function posli({ komu, predmet, text, html, odhlasit }) {
  if (!odhlasit) throw new Error('bez odhlašovacího odkazu se neposílá');
  const r = await fetch(MAIL_API, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + MAIL_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM, to: [komu], subject: predmet, text, html,
      headers: {
        'List-Unsubscribe': `<${odhlasit}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
    }),
  });
  const telo = await r.text();
  if (!r.ok) throw new Error(`pošta ${r.status}: ${telo.slice(0, 200)}`);
  return telo ? JSON.parse(telo) : null;
}

/* Co už se u hledání poslalo. Vrací se jako seen_keys, protože
   noveProHledani() s tím umí pracovat — včetně toho, že týž pozemek
   s jinou cenou není nový. */
async function poslaneKlice(hledaniId) {
  const r = await sb(`mail_poslane?hledani_id=eq.${encodeURIComponent(hledaniId)}&select=klic&limit=100000`);
  return (r || []).map((x) => x.klic);
}

async function main() {
  const dataCesta = path.join(ROOT, 'data', 'opportunities.json');
  if (!fs.existsSync(dataCesta)) { console.error('::error::data/opportunities.json chybí'); process.exit(1); }
  const soubor = JSON.parse(fs.readFileSync(dataCesta, 'utf8'));
  /* Pole se jmenuje „opportunities" — viz data/pole.json, kde je soubor
     popsaný pro každého, kdo si ho vezme. Hádat víc jmen by znamenalo,
     že se při přejmenování nic nepozná: skript by tiše rozesílal nic. */
  const data = Array.isArray(soubor) ? soubor : (soubor.opportunities || []);
  if (!data.length) { console.error('::error::v datech není jediná nabídka — nic se nerozesílá'); process.exit(1); }
  /* ODKAZ SE BERE Z TÉŽE MAPY, ZE KTERÉ VZNIKAJÍ STRÁNKY.
     Dřív tu stálo souborPro(d) — jméno spočítané z klíče (obec, parcela,
     okres, souřadnice). Na tom klíči se ale nabídky srážejí: generátor
     stránek proto druhé z nich dává jméno jiné (souborProDalsi), kdežto
     tenhle skript o tom nevěděl a poslal by člověka na stránku JINÉHO
     pozemku — cizí cenu, cizí výměru, v e-mailu, který si nikdo nevyžádal
     dvakrát. Táž vada byla v kanálech novinek a našla se při jejich
     opravě; tady by byla horší, protože e-mail se nedá vzít zpátky.

     Duplicity se zahodí hned: tentýž pozemek vypsaný dvakrát nemá chodit
     jako dvě upozornění a nemá ani počítat dvakrát do srovnání. Je to
     táž funkce jako na mapě (js/hlidani-logika.js).

     Nabídka bez vlastní stránky se do e-mailu nedá — nebylo by kam
     odkázat — a filtr o pár řádků níž ji odsud vyhodí. */
  const bezDuplicit = PKH.bezDuplicit(data);
  const STRANKY = mapaSouboru(bezDuplicit);
  for (const d of bezDuplicit) {
    const zapis = STRANKY.get(klicNabidky(d));
    d.soubor = zapis ? zapis.soubor : null;
  }
  const bezStranky = bezDuplicit.filter((d) => !d.soubor).length;
  if (bezStranky) log(`${bezStranky} nabídek nemá vlastní stránku — do e-mailu nejdou`);

  if (!SERVICE_KEY) {
    log('SUPABASE_SERVICE_ROLE_KEY není nastavený — není z čeho číst uložená hledání. Nic se nedělá.');
    log(`(v datech je ${data.length} nabídek, takže až klíč bude, je co porovnávat)`);
    return;
  }

  const rezim = (OPRAVDU && MAIL_KEY && FROM) ? 'ODESÍLÁM' : 'NASUCHO';
  if (rezim === 'NASUCHO') {
    const proc = !OPRAVDU ? 'chybí přepínač --opravdu'
      : !MAIL_KEY ? 'chybí RESEND_API_KEY'
        : 'chybí PK_MAIL_FROM (odesílatel)';
    log(`Režim NASUCHO (${proc}): vypíšu, co by odešlo, a neodešlu nic.`);
  }

  let rady;
  try {
    rady = await rpc('hlidani_k_odeslani', { p_odstup_hodin: ODSTUP });
  } catch (e) {
  /* PGRST202 = tahle funkce v databázi není. To není porucha běhu, ale
     stav nasazení: SQL ze supabase/00-vse.sql ještě nikdo nepustil
     v editoru Supabase. Dokud to někdo neudělá, nemá co odejít — a padat
     kvůli tomu každý den cronem znamená jen denní e-mail o chybě, se
     kterou tenhle skript nic nenadělá. Stejnou pojistku má celá tahle
     větev už u klíčů: bez nich běží nasucho, ne načerveno. Jakmile SQL
     proběhne, funkce se najde a tahle větev se přestane uplatňovat. */
    if (!/PGRST202/.test(String((e && e.message) || e))) throw e;
    log('Hlídání ještě není v databázi: chybí funkce hlidani_k_odeslani.');
    log('Nasadí se spuštěním supabase/00-vse.sql v SQL editoru Supabase.');
    return;
  }
  if (!rady || !rady.length) { log('Není komu psát: žádné hledání se zapnutým posíláním.'); return; }

  /* Jeden člověk, jeden e-mail. Kdo si zapne pět hledání, nemá dostat
     pět zpráv naráz — to je z pohledu příjemce spam, i když si o každou
     z nich řekl. */
  const podleLidi = new Map();
  for (const r of rady) {
    if (!podleLidi.has(r.email)) podleLidi.set(r.email, { email: r.email, token: r.token, hledani: [] });
    podleLidi.get(r.email).hledani.push(r);
  }

  let poslano = 0, zasetych = 0, bezNovych = 0, chyb = 0;
  for (const clovek of podleLidi.values()) {
    if (poslano >= LIMIT) { log(`Dosažen limit ${LIMIT} e-mailů na běh — zbytek až příště.`); break; }
    const skupiny = [];
    const kZapsani = [];
    for (const h of clovek.hledani) {
      let poslaneUz;
      try { poslaneUz = await poslaneKlice(h.hledani_id); } catch (e) { chyb++; log('  ! ' + e.message); continue; }
      const hledani = { ...h, seen_keys: poslaneUz };
      const nove = PKH.noveProHledani(hledani, bezDuplicit).filter((d) => d.soubor);
      /* PRVNÍ BĚH: zapíše se stav a nic se neposílá. */
      if (!poslaneUz.length && !h.mail_odeslano_at) {
        const klice = data.filter((d) => PKH.matches(hledani, d)).map((d) => PKH.keyOf(d));
        if (rezim === 'ODESÍLÁM') await rpc('mail_odeslan', { p_hledani: h.hledani_id, p_klice: klice });
        zasetych++;
        log(`  ○ ${clovek.email} / ${h.label || 'hledání'}: první běh — zapsáno ${klice.length} dosavadních, nic se neposílá`);
        continue;
      }
      if (!nove.length) { bezNovych++; continue; }
      skupiny.push({ label: h.label, celkem: nove.length, nove, hledani_id: h.hledani_id });
      kZapsani.push({ id: h.hledani_id, klice: nove.slice(0, sklad.MAX_V_MAILU).map((d) => PKH.keyOf(d)) });
    }
    if (!skupiny.length) continue;

    let zprava;
    try {
      zprava = {
        komu: clovek.email,
        predmet: sklad.predmet(skupiny),
        text: sklad.text(skupiny, clovek.token),
        html: sklad.html(skupiny, clovek.token),
        odhlasit: sklad.odhlasitOdkaz(clovek.token),
      };
    } catch (e) { chyb++; log(`  ! ${clovek.email}: ${e.message}`); continue; }

    if (rezim === 'ODESÍLÁM') {
      try {
        await posli(zprava);
        /* Zapisuje se JEN to, co v e-mailu opravdu stálo. Zapsat i zbytek
           by znamenalo, že se nabídky nad MAX_V_MAILU nikdy nepošlou —
           tiše by zmizely. Takhle přijdou v dalším e-mailu. */
        for (const z of kZapsani) await rpc('mail_odeslan', { p_hledani: z.id, p_klice: z.klice });
        poslano++;
        log(`  ✓ ${clovek.email}: ${zprava.predmet}`);
      } catch (e) { chyb++; log(`  ! ${clovek.email}: ${e.message}`); }
    } else {
      poslano++;
      log(`  → ${clovek.email}: ${zprava.predmet}`);
      log(zprava.text.split('\n').map((r) => '      ' + r).join('\n'));
    }
  }

  log(`\n${rezim}: ${poslano} e-mailů, ${zasetych} prvních běhů (bez odeslání), `
    + `${bezNovych} hledání bez novinek, ${chyb} chyb.`);
  if (chyb) process.exit(1);
}

main().catch((e) => { console.error('::error::' + (e && e.message || e)); process.exit(1); });
