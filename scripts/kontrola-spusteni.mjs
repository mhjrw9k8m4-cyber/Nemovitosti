#!/usr/bin/env node
/* PŘIPRAVENO KE SPUŠTĚNÍ? JEDEN PŘÍKAZ, JEDEN VERDIKT.
   ====================================================================
   Spuštění:  node scripts/kontrola-spusteni.mjs
              node scripts/kontrola-spusteni.mjs --bez-site   (jen repozitář)

   PROČ TO VZNIKLO. Kontrol má tenhle repozitář dost — 253 zkoušek,
   kontrola-databaze.mjs, kontrola-inzeratu.mjs, diagnostika.html —
   ale ani jedna neodpoví na otázku, kterou má majitel: „můžu to
   pustit?" Zkoušky navíc dokazují něco jiného, než se zdá: mluví
   s FALEŠNOU Supabase na místním serveru, takže ověřují, že se web
   ptá správně. Jestli na druhé straně někdo odpovídá, o tom nevědí nic.
   A celá půlka webu (účty, inzerce, zprávy, poznámky, hlídání) proti
   opravdovému projektu neběžela ani jednou.

   CO TO DĚLÁ. Rozdělí nálezy do tří hromádek a na konci vydá verdikt:
     ✕ BLOKUJE      — bez tohohle je web napůl rozbitý
     ! PŘIJDETE O TO — spustit jde, ale něco hotového zůstane nevyužité
     ? NEZKOUŠENO    — nemám klíč nebo síť; NEPLATÍ za „v pořádku"

   Ta třetí hromádka je tu nejdůležitější. Kontrola, která neumí přiznat,
   co nezměřila, je horší než žádná: svítí zeleně a mlčí přesně o tom,
   na co se ptáte.

   CO NEPOTŘEBUJE. Servisní klíč ne. Čtyři nejdůležitější živé kontroly
   se dají udělat VEŘEJNÝM klíčem z js/config.js, protože se ptají
   přesně na to, co uvidí každý návštěvník. Žádná z nich nic nezapisuje.
   Na hlubší prohlídku oprávnění je scripts/kontrola-databaze.mjs
   a ta servisní klíč potřebuje — tenhle soubor na ni jen odkáže.
   ==================================================================== */
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fetchSLimitem } from './fetch-s-limitem.mjs';
import { ocekavaneZeSQL } from './kontrola-databaze.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BEZ_SITE = process.argv.includes('--bez-site');
const cti = (p) => { try { return readFileSync(path.join(KOREN, p), 'utf8'); } catch (e) { return ''; } };

const blokuje = [], ztrata = [], nezkouseno = [], hotovo = [];
const ANO = (co) => hotovo.push(co);
const NE = (co, jak) => blokuje.push({ co, jak });
const SKODA = (co, jak) => ztrata.push({ co, jak });
const NEVIM = (co, proc) => nezkouseno.push({ co, proc });

/* ---------- 1) CO SE POZNÁ Z REPOZITÁŘE ------------------------- */
const config = cti('js/config.js');
const adresa = (/window\.PK_SUPABASE_URL\s*=\s*'([^']+)'/.exec(config) || [])[1] || '';
const klic = (/window\.PK_SUPABASE_KEY\s*=\s*'([^']*)'/.exec(config) || [])[1] || '';
if (!adresa) NE('adresa databáze v js/config.js', 'PK_SUPABASE_URL je prázdná — web se nemá kam připojit');
else ANO('adresa databáze je v js/config.js');
/* Dvě podoby klíče: nová „sb_publishable_…" a stará JWT „eyJ…". Cokoli
   jiného je buď překlep, nebo — a to je horší — servisní klíč, který
   ve veřejném souboru nemá co dělat. */
if (/^sb_publishable_/.test(klic) || /^eyJ/.test(klic)) ANO('veřejný klíč je v js/config.js a má známý tvar');
else if (!klic) NE('veřejný klíč v js/config.js', 'PK_SUPABASE_KEY je prázdný — nepřihlášený neuvidí nic');
else if (/^sb_secret_|service_role/.test(klic)) NE('veřejný klíč v js/config.js',
  'vypadá to na SERVISNÍ klíč — ten obchází všechna oprávnění a ve veřejném souboru nesmí být');
else NE('veřejný klíč v js/config.js', 'neznámý tvar klíče');

const sql = cti('supabase/00-vse.sql');
const ocek = sql ? ocekavaneZeSQL(sql) : { tabulky: [], funkce: [] };
/* POČET NESTAČÍ, JMÉNA ANO. Napoprvé tu stála mez „aspoň 50 funkcí"
   a hlásila osekaný balík nad balíkem, který je v pořádku:
   ocekavaneZeSQL() počítá RŮZNÉ funkce (46), ne jejich definice (71 —
   táž funkce se v migracích přepisuje víckrát). Mez na počtu by se
   navíc rozešla s každou přidanou funkcí. Ptá se proto na jména těch,
   bez kterých web nefunguje: každé z nich odpovídá jedna věc, kterou
   člověk na webu dělá. */
const MUSI_BYT = ['public_listings', 'create_listing', 'moje_poznamky', 'moje_ulozene',
  'my_threads', 'my_searches', 'hlidani_k_odeslani', 'unsubscribe_mail', 'zapis_chybu'];
const chybiVSQL = MUSI_BYT.filter((f) => !ocek.funkce.includes(f));
if (!sql) NE('balík supabase/00-vse.sql', 'chybí — spusťte node scripts/build-sql.mjs');
else if (chybiVSQL.length) NE('balík supabase/00-vse.sql',
  'v balíku chybí ' + chybiVSQL.join(', ') + ' — spusťte node scripts/build-sql.mjs');
else ANO(`balík supabase/00-vse.sql je složený (${ocek.tabulky.length} tabulek,`
  + ` ${ocek.funkce.length} různých funkcí)`);

for (const [soubor, co] of [['404.html', 'stránka pro neznámou adresu'],
  ['robots.txt', 'robots.txt'], ['sitemap.xml', 'mapa webu']]) {
  if (existsSync(path.join(KOREN, soubor))) ANO(co + ' existuje');
  else SKODA(co, soubor + ' chybí');
}
const sitemap = cti('sitemap.xml');
const adresVMape = (sitemap.match(/<loc>/g) || []).length;
if (adresVMape > 1000) ANO(`v mapě webu je ${adresVMape} adres`);
else SKODA('mapa webu', `je v ní jen ${adresVMape} adres — vyhledávač nemá co indexovat`);

/* Data musí být svěží: robot je obnovuje čtyřikrát denně, takže stará
   data znamenají, že se rozesílač nebo robot zastavil. */
let stariDat = null;
try {
  const d = JSON.parse(cti('data/opportunities.json'));
  const kdy = Date.parse(d.updated_at || d.updated || '');
  if (isFinite(kdy)) stariDat = (Date.now() - kdy) / 86400000;
  const pocet = (d.opportunities || []).length;
  if (pocet > 500) ANO(`v datech je ${pocet} nabídek`);
  else NE('nabídky v datech', `jen ${pocet} — web by byl prázdný`);
} catch (e) { NE('data/opportunities.json', 'nedá se přečíst'); }
if (stariDat == null) SKODA('stáří dat', 'v datech není datum obnovení');
else if (stariDat > 2) SKODA('svěžest dat', `naposledy obnoveno před ${stariDat.toFixed(1)} dny — robot možná stojí`);
else ANO(`data jsou svěží (obnoveno před ${stariDat.toFixed(1)} dny)`);

const stranek = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)).length;
if (stranek > 500) ANO(`stránek pozemků na disku: ${stranek}`);
else NE('stránky pozemků', `jen ${stranek} — spusťte node scripts/oprav.mjs`);

/* ---------- 2) CO JE HOTOVÉ A VYPNUTÉ -------------------------- */
if (/window\.PK_MAIL_ZAPNUTO\s*=\s*true/.test(config)) ANO('web o posílání pošty mluví (PK_MAIL_ZAPNUTO)');
else SKODA('e-maily hlídání', 'PK_MAIL_ZAPNUTO = false — web o posílání mlčí, i kdyby pošta odcházela');
/* PŘEPÍNAČ SE HLEDÁ V PŘÍKAZU, NE V KOMENTÁŘI. Napoprvé jsem hledal
   „--opravdu" kdekoli v souboru — a ono to tam je, dvakrát, ve
   vysvětlujícím komentáři. Kontrola tím prošla, aniž cokoli ověřila.
   A po opravě se ukázalo něco užitečnějšího: v příkazu ten přepínač JE,
   ale jen pro ruční spuštění (`workflow_dispatch` + vstup). Noční běh
   podle hodin tedy pošlapává nasucho — což je záměr, ale znamená to,
   že pošta nezačne odcházet sama tím, že se něco nasadí. */
const rozesilani = cti('.github/workflows/rozesilani.yml');
const prikazy = rozesilani.split('\n')
  .filter((l) => /^\s*run:/.test(l) && /send-(alerts|push)\.mjs/.test(l));
const sOpravdu = prikazy.filter((l) => l.includes('--opravdu'));
const jenRucne = sOpravdu.filter((l) => /workflow_dispatch/.test(l));
if (!prikazy.length) SKODA('rozesílač', 've .github/workflows/rozesilani.yml se nepouští send-alerts ani send-push');
else if (!sOpravdu.length) SKODA('rozesílač',
  'v příkazu chybí --opravdu, takže běh jen vypíše, co by odešlo');
else if (jenRucne.length === sOpravdu.length) SKODA('noční rozesílání',
  '--opravdu je v příkazu jen pro ruční spuštění (workflow_dispatch), takže běh podle hodin'
  + ' jede nasucho. Pošta odejde teprve po stisku tlačítka se zapnutým přepínačem.');
else ANO('rozesílač má --opravdu i v běhu podle hodin');
NEVIM('RESEND_API_KEY a PK_MAIL_FROM', 'jsou v GitHub Secrets, odsud je vidět nejde');
if ((/window\.PK_PUSH_VEREJNY_KLIC\s*=\s*'([^']*)'/.exec(config) || [])[1]) ANO('veřejný klíč pro push je nastavený');
else SKODA('upozornění do telefonu', 'PK_PUSH_VEREJNY_KLIC je prázdný — push se nikomu nenabídne');

/* ---------- 3) ŽIVÁ DATABÁZE (jen veřejným klíčem, nic se nezapisuje) */
const zaklad = (process.env.SUPABASE_URL || adresa || '').replace(/\/+$/, '');
async function zkus(popis, cesta, volby) {
  const r = await fetchSLimitem(zaklad + cesta, {
    ...volby,
    headers: { apikey: klic, 'Content-Type': 'application/json', ...(volby && volby.headers) },
  });
  const telo = await r.text();
  return { stav: r.status, telo };
}
if (BEZ_SITE) {
  NEVIM('živá databáze', 'spuštěno s --bez-site');
} else if (!zaklad || !klic) {
  NEVIM('živá databáze', 'chybí adresa nebo veřejný klíč');
} else {
  try {
    /* a) Je SQL vůbec nasazené? public_listings() je ta funkce, kterou
          volá každý návštěvník při otevření mapy, a jen čte. */
    const a = await zkus('public_listings', '/rest/v1/rpc/public_listings', { method: 'POST', body: '{}' });
    if (a.stav === 200) ANO('databáze odpovídá a public_listings() v ní je');
    else if (/PGRST202|does not exist|Could not find/i.test(a.telo)) {
      NE('nasazené SQL', 'public_listings() v databázi NENÍ — pusťte supabase/00-vse.sql'
        + ' (workflow nasad-sql.yml). Bez toho selže registrace, inzerce, zprávy, poznámky i hlídání.');
    } else NE('nasazené SQL', `databáze odpověděla ${a.stav}: ${a.telo.slice(0, 120)}`);

    /* b) Funkce, kterou nepřihlášený volat NESMÍ. Když odpoví 200,
          je to nález, ne nastavení — zrovna na tomhle už web jednou
          pohořel (prehled_navstevnosti si mohl zavolat každý). */
    const b = await zkus('prehled', '/rest/v1/rpc/prehled_navstevnosti', { method: 'POST', body: '{"p_dni":1}' });
    if (b.stav === 200) NE('oprávnění funkcí', 'prehled_navstevnosti() odpověděla NEPŘIHLÁŠENÉMU —'
      + ' návštěvnost celého webu vidí kdokoli');
    else ANO(`uzavřená funkce je uzavřená (odpověď ${b.stav})`);

    /* c) Úložiště fotek. Neexistující soubor ve existujícím kbelíku
          vrátí 404, chybějící kbelík 400 „Bucket not found" — takhle
          se to pozná bez servisního klíče a bez zápisu. */
    const c = await zkus('kbelik', '/storage/v1/object/public/listing-photos/__neexistuje__.jpg', {});
    if (/bucket not found/i.test(c.telo) || c.stav === 400) {
      NE('úložiště fotek', 'kbelík listing-photos neexistuje — bez něj neprojde nahrání fotky');
    } else ANO(`kbelík listing-photos existuje (odpověď ${c.stav})`);

    /* d) Potvrzování e-mailu. Supabase vydá nastavení přihlašování
          veřejně; `mailer_autoconfirm: true` znamená, že se e-mail
          NEPOTVRZUJE a účet vznikne na libovolnou adresu. */
    const d = await zkus('auth', '/auth/v1/settings', {});
    if (d.stav === 200) {
      let j = null; try { j = JSON.parse(d.telo); } catch (e) { /* níž */ }
      if (!j) NEVIM('potvrzování e-mailu', 'nastavení přihlašování se nepovedlo přečíst');
      else if (j.mailer_autoconfirm === true) NE('potvrzování e-mailu',
        'mailer_autoconfirm = true, takže se adresa nepotvrzuje a účet vznikne na cizí e-mail');
      else ANO('potvrzování e-mailu je zapnuté');
    } else NEVIM('potvrzování e-mailu', `nastavení přihlašování odpovědělo ${d.stav}`);
    /* e) Hlášení chyb z prohlížeče. Kdyby funkce v databázi nebyla,
          web by hlásil do prázdna: PostgREST odpoví 404 a js/chyby.js
          odpověď schválně ignoruje (hlásič nemá rozbít stránku). Byla
          by to tedy tichá ztráta — přesně ten druh, kvůli kterému
          tenhle skript existuje.
          ZÁPIS SE TÍM NEDĚLÁ: hláška „ab" je kratší než tři znaky
          a funkce ji odmítne ještě před insertem (hlídá to
          scripts/test-chyby-klienta.mjs na opravdovém PostgreSQL).
          Jde tedy jen o otázku „jsi tam?". */
    const e2 = await zkus('chyby', '/rest/v1/rpc/zapis_chybu', { method: 'POST',
      body: '{"p_stranka":"index.html","p_zprava":"ab","p_zdroj":"","p_prohlizec":"jine"}' });
    if (e2.stav >= 200 && e2.stav < 300) ANO('hlášení chyb z prohlížeče je nasazené');
    else if (/PGRST202|does not exist|Could not find/i.test(e2.telo)) {
      SKODA('hlášení chyb z prohlížeče', 'zapis_chybu() v databázi NENÍ — pády v prohlížečích'
        + ' návštěvníků by se hlásily do prázdna; pusťte supabase/00-vse.sql');
    } else NEVIM('hlášení chyb z prohlížeče', `zapis_chybu() odpověděla ${e2.stav}`);
  } catch (e) {
    NEVIM('živá databáze', 'na databázi se nepodařilo dosáhnout — ' + String(e.message || e).slice(0, 90));
  }
}
NEVIM('hlubší prohlídka oprávnění', 'pustí ji node scripts/kontrola-databaze.mjs se servisním klíčem');
NEVIM('průchod naostro (registrace → inzerát s fotkou → zpráva → hlídání)',
  'tohle neudělá žádný skript — musí to projít člověk; seznam pěti průchodů'
  + ' je v docs/pro-majitele.md, bod 0b');

/* ---------- VERDIKT -------------------------------------------- */
const r = [];
r.push('\nKONTROLA PŘIPRAVENOSTI KE SPUŠTĚNÍ\n');
r.push(`V pořádku (${hotovo.length}):`);
for (const x of hotovo) r.push('  ✓ ' + x);
if (blokuje.length) {
  r.push(`\nBLOKUJE SPUŠTĚNÍ (${blokuje.length}):`);
  for (const x of blokuje) r.push(`  ✕ ${x.co}\n      ${x.jak}`);
}
if (ztrata.length) {
  r.push(`\nSPUSTIT JDE, ALE PŘIJDETE O TO (${ztrata.length}):`);
  for (const x of ztrata) r.push(`  ! ${x.co}\n      ${x.jak}`);
}
r.push(`\nNEZKOUŠENO — NEPLATÍ ZA „V POŘÁDKU" (${nezkouseno.length}):`);
for (const x of nezkouseno) r.push(`  ? ${x.co}\n      ${x.proc}`);
r.push('\n' + (blokuje.length
  ? `VERDIKT: NESPOUŠTĚT. ${blokuje.length} ${blokuje.length === 1 ? 'věc blokuje' : 'věcí blokuje'}, viz výš.`
  : 'VERDIKT: nic z toho, co umím změřit, spuštění nebrání.'
    + '\n  Zbývá ta jedna věc, kterou neumí žádný skript: projít web naostro jako člověk.'));
console.log(r.join('\n') + '\n');
process.exit(blokuje.length ? 1 : 0);
