#!/usr/bin/env node
/* ROZESÍLAČ E-MAILŮ — zkouška bez jediného odeslaného e-mailu.
   ==================================================================
   E-mail je jediná část webu, která se nedá vzít zpátky. Opravit stránku
   jde za minutu; odeslanou poštu ne. Proto se tady kontroluje především
   to, co se NESMÍ stát:

     — že se pošta rozjede, aniž si o ni někdo řekl (souhlas),
     — že e-mail odejde bez odkazu na odhlášení (povinnost ze zákona),
     — že se stejná nabídka pošle dvakrát,
     — že první běh nad hledáním zasype člověka celým archivem,
     — že e-mail zamlčí spoluvlastnický podíl nebo to, že ceny jsou
       nabídkové — tedy přesně ty dvě pasti, které web pojmenovává
       na každé stránce.

   Rozesílač se pouští DOOPRAVDY, proti vlastnímu falešnému Supabase
   a falešné poštovní službě na vlastním portu. Kdyby se kontrolovala jen
   skládací funkce, nevědělo by se nic o tom, co dělá skript kolem ní —
   a právě tam je rozhodnutí „poslat / neposlat".
   ================================================================== */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import * as sklad from './mail-sklad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hodi(popis, f, cast) {
  let zprava = null;
  try { f(); } catch (e) { zprava = e.message; }
  pravda(popis, zprava !== null && (!cast || zprava.includes(cast)),
    zprava === null ? 'neodmítlo to — prošlo to bez chyby' : `odmítnuto jinak: „${zprava}"`);
}

const nabidka = (p) => ({
  place: 'Kuřim', okres: 'Brno-venkov', druh: 'Zahrada', type: 'sale',
  price: 1250000, area: 820, lat: 49.3, lng: 16.53, soubor: 'pozemek-brno-venkov-kurim-abc123.html',
  ...p,
});

/* ---------- 1) SKLÁDÁNÍ: co nesmí vzniknout -------------------- */
hodi('e-mail bez odhlašovacího tokenu nevznikne',
  () => sklad.text([{ label: 'A', celkem: 1, nove: [nabidka()] }], ''), 'odhlaš');
hodi('a v podobě HTML taky ne',
  () => sklad.html([{ label: 'A', celkem: 1, nove: [nabidka()] }], null), 'odhlaš');
hodi('prázdný e-mail nevznikne',
  () => sklad.text([{ label: 'A', celkem: 0, nove: [] }], 'tok'), 'prázdn');
hodi('ani předmět pro prázdný e-mail', () => sklad.predmet([{ label: 'A', celkem: 0, nove: [] }]), 'prázdn');
hodi('nabídka bez vlastní stránky se do e-mailu nedostane',
  () => sklad.text([{ label: 'A', celkem: 1, nove: [nabidka({ soubor: null })] }], 'tok'), 'nikam');

const jeden = sklad.text([{ label: 'Zahrady u Kuřimi', celkem: 1, nove: [nabidka()] }], 'TOKEN1');
pravda('v e-mailu je odhlašovací odkaz s tokenem', jeden.includes('odhlasit-maily.html?t=TOKEN1'), jeden.slice(-200));
pravda('a říká, že ceny jsou nabídkové, ne prodejní',
  /NABÍDKOVÉ|nabídkové/.test(jeden) && /ne prodejní/.test(jeden), 'ta věta v e-mailu není');
pravda('odkaz vede na vlastní stránku pozemku',
  jeden.includes('https://www.parcelaka.cz/pozemek-brno-venkov-kurim-abc123.html'), jeden);

const podil = sklad.text([{ label: 'A', celkem: 1, nove: [nabidka({ podil: true, podil_zlomek: '1/6' })] }], 'T');
pravda('spoluvlastnický podíl se v e-mailu pojmenuje', /spoluvlastnický podíl 1\/6/.test(podil), podil);
pravda('a vysvětlí se, že cena je za podíl a výměra celá',
  /cena za podíl, ale výměra celé parcely/.test(podil), 'vysvětlení chybí');

/* Strop: víc než MAX_V_MAILU se nevypisuje, ale počet se řekne celý. */
const mnoho = Array.from({ length: sklad.MAX_V_MAILU + 5 },
  (_, i) => nabidka({ price: 1000000 + i, soubor: `pozemek-x-${i}.html` }));
const dlouhy = sklad.text([{ label: 'Celý okres', celkem: mnoho.length, nove: mnoho }], 'T');
pravda(`vypíše se nejvíc ${sklad.MAX_V_MAILU} nabídek`,
  (dlouhy.match(/parcelaka\.cz\/pozemek-x-/g) || []).length === sklad.MAX_V_MAILU,
  `vypsáno ${(dlouhy.match(/parcelaka\.cz\/pozemek-x-/g) || []).length}`);
pravda('a o zbytku se nemlčí', dlouhy.includes(`a dalších ${mnoho.length - sklad.MAX_V_MAILU}`), dlouhy);

pravda('předmět se skloňuje podle počtu',
  sklad.predmet([{ label: 'A', celkem: 1, nove: [nabidka()] }]).includes('1 nový pozemek')
  && sklad.predmet([{ label: 'A', celkem: 3, nove: mnoho.slice(0, 3) }]).includes('3 nové pozemky')
  && sklad.predmet([{ label: 'A', celkem: 9, nove: mnoho.slice(0, 9) }]).includes('9 nových pozemků'),
  [1, 3, 9].map((n) => sklad.predmet([{ label: 'A', celkem: n, nove: mnoho.slice(0, n) }])).join(' | '));

const zlobivy = sklad.html([{ label: '<script>zle()</script>', celkem: 1, nove: [nabidka({ place: 'Ves & Ves' })] }], 'T');
pravda('do HTML se nedostane cizí značka ani surový ampersand',
  !/<script>/.test(zlobivy) && zlobivy.includes('&amp;') && zlobivy.includes('&lt;script&gt;'),
  zlobivy.slice(0, 300));

/* ---------- 2) SQL: souhlas se nepředpokládá ------------------- */
const sql = fs.readFileSync(path.join(ROOT, 'supabase', 'hlidani-mailem.sql'), 'utf8');
pravda('posílání je ve výchozím stavu vypnuté',
  /add column if not exists mailem boolean not null default false/.test(sql),
  'sloupec mailem není výslovně default false');
pravda('žádná migrace nikomu posílání nezapne',
  !/update\s+saved_searches\s+set\s+mailem\s*=\s*true/i.test(sql),
  'v migraci je update, který zapíná mailem');
pravda('odhlášení vypne všechna hledání naráz, ne jen příznak',
  /unsubscribe_mail[\s\S]*update saved_searches set mailem = false where user_id = uid/.test(sql),
  'odhlášení nechává jednotlivá hledání zapnutá');
pravda('rozesílač vidí jen potvrzené e-maily a nedohlášené účty',
  /email_confirmed_at is not null/.test(sql) && /n\.vypnuto = false/.test(sql),
  'hlidani_k_odeslani nefiltruje potvrzení nebo odhlášení');
pravda('seznam k odeslání smí číst jen server',
  /revoke all on function hlidani_k_odeslani\(integer\) from public, anon, authenticated/.test(sql)
  && /grant execute on function hlidani_k_odeslani\(integer\) to service_role/.test(sql),
  'oprávnění na hlidani_k_odeslani nejsou zúžená');

/* ---------- 2b) WEB O POŠTĚ MLČÍ, DOKUD NEODCHÁZÍ ------------- */
const config = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
pravda('vlajka posílání je v js/config.js vypnutá',
  /window\.PK_MAIL_ZAPNUTO\s*=\s*false\s*;/.test(config),
  'PK_MAIL_ZAPNUTO není false — web by sliboval poštu, která nechodí');
const hlidani = fs.readFileSync(path.join(ROOT, 'hlidani.html'), 'utf8');
pravda('přepínač u hledání se bez té vlajky ani nevykreslí',
  /function mailRow\(s\) \{\s*\n\s*if \(!window\.PK_MAIL_ZAPNUTO\) return '';/.test(hlidani),
  'mailRow() nezačíná kontrolou vlajky');
/* Že to v prohlížeči opravdu drží (a že se přepínač se zapnutou vlajkou
   naopak objeví), měří scripts/test-odhlaseni.mjs — tady je jen pojistka
   na to, aby vlajka v repozitáři nezůstala zapnutá omylem. */

/* ---------- 3) Shoda se počítá týmž kódem jako v prohlížeči ---- */
const zdroj = fs.readFileSync(path.join(ROOT, 'scripts', 'send-alerts.mjs'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
pravda('rozesílač bere shodu z js/hlidani-logika.js',
  /hlidani-logika\.js/.test(zdroj) && /noveProHledani\(/.test(zdroj),
  'nenašel se import logiky hlídání');
pravda('a nepíše si filtry znovu po svém',
  !/max_perm2\s*[<>]/.test(zdroj) && !/d\.price\s*<=\s*\w+\.max_price/.test(zdroj),
  'v rozesílači je vlastní porovnávání ceny nebo ceny za m²');

/* ---------- 4) DOOPRAVDY: falešné Supabase + falešná pošta ----- */
const PORT = 8317;
const stav = { poslano: [], zapsano: [], poslaneKlice: [] };
let hledani = [];
const server = http.createServer((req, res) => {
  let telo = '';
  req.on('data', (c) => { telo += c; });
  req.on('end', () => {
    const odpoved = (kod, data) => {
      res.writeHead(kod, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(data === undefined ? null : data));
    };
    if (req.url.startsWith('/posta')) { stav.poslano.push(JSON.parse(telo || '{}')); return odpoved(200, { id: 'x' }); }
    if (req.url.startsWith('/rest/v1/rpc/hlidani_k_odeslani')) return odpoved(200, hledani);
    if (req.url.startsWith('/rest/v1/rpc/mail_odeslan')) { stav.zapsano.push(JSON.parse(telo || '{}')); return odpoved(200, 1); }
    if (req.url.startsWith('/rest/v1/mail_poslane')) return odpoved(200, stav.poslaneKlice.map((k) => ({ klic: k })));
    return odpoved(404, { message: 'neznámá cesta ' + req.url });
  });
});

function spust(args, env) {
  return new Promise((splnit) => {
    execFile(process.execPath, [path.join(ROOT, 'scripts', 'send-alerts.mjs'), ...args], {
      cwd: ROOT,
      env: {
        ...process.env,
        SUPABASE_URL: `http://127.0.0.1:${PORT}`,
        SUPABASE_SERVICE_ROLE_KEY: 'falesny',
        PK_MAIL_API: `http://127.0.0.1:${PORT}/posta`,
        ...env,
      },
    }, (chyba, vystup, chybovy) => splnit({ kod: chyba ? (chyba.code || 1) : 0, vystup: vystup + chybovy }));
  });
}

await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
try {
  const radek = {
    hledani_id: '11111111-1111-1111-1111-111111111111',
    user_id: '22222222-2222-2222-2222-222222222222',
    email: 'nekdo@example.com', label: 'Zahrady u Kuřimi', token: 'TOK-1',
    okres: 'Brno-venkov', druh: '', ptype: '', max_price: null, min_area: null,
    min_price: null, max_area: null, max_perm2: null, jen_celek: null, features: [],
    stred_lat: null, stred_lng: null, okruh_km: null, mail_odeslano_at: null,
  };

  /* a) PRVNÍ BĚH nad hledáním: nic neodejde, jen se zapíše stav. */
  hledani = [radek]; stav.poslano = []; stav.zapsano = []; stav.poslaneKlice = [];
  let v = await spust(['--opravdu'], { RESEND_API_KEY: 'k', PK_MAIL_FROM: 'a@b.cz' });
  pravda('první běh nad hledáním neodešle nic', stav.poslano.length === 0, `odesláno ${stav.poslano.length}`);
  pravda('a místo toho si zapíše, co už v datech bylo',
    stav.zapsano.length === 1 && (stav.zapsano[0].p_klice || []).length > 50,
    `zapsáno ${stav.zapsano.length} dávek, klíčů ${(stav.zapsano[0] && stav.zapsano[0].p_klice || []).length}`);
  pravda('a skončí bez chyby', v.kod === 0, v.vystup.slice(-300));
  const prvniKlice = (stav.zapsano[0] && stav.zapsano[0].p_klice) || [];

  /* b) DRUHÝ BĚH se stejnými daty: pořád nic nového, nic neodejde. */
  hledani = [{ ...radek, mail_odeslano_at: new Date().toISOString() }];
  stav.poslano = []; stav.zapsano = []; stav.poslaneKlice = prvniKlice;
  v = await spust(['--opravdu'], { RESEND_API_KEY: 'k', PK_MAIL_FROM: 'a@b.cz' });
  pravda('co už se poslalo, se neposílá znovu', stav.poslano.length === 0,
    `odesláno ${stav.poslano.length}: ` + JSON.stringify(stav.poslano[0] || {}).slice(0, 200));

  /* c) NOVÁ NABÍDKA: teď e-mail odejít MÁ — jinak by předchozí dvě
        kontroly mohly procházet jen proto, že rozesílač neposílá nikdy. */
  stav.poslano = []; stav.zapsano = [];
  stav.poslaneKlice = prvniKlice.slice(1);     // jeden klíč „zapomeneme" = jedna novinka
  v = await spust(['--opravdu'], { RESEND_API_KEY: 'k', PK_MAIL_FROM: 'a@b.cz' });
  pravda('na novou nabídku e-mail odejde (jinak zkouška nic neměří)',
    stav.poslano.length === 1, `odesláno ${stav.poslano.length}; výstup: ` + v.vystup.slice(-300));
  const m = stav.poslano[0] || {};
  pravda('odeslaný e-mail nese hlavičku pro odhlášení jedním klikem',
    m.headers && /odhlasit-maily\.html\?t=TOK-1/.test(m.headers['List-Unsubscribe'] || '')
    && m.headers['List-Unsubscribe-Post'] === 'List-Unsubscribe=One-Click',
    JSON.stringify(m.headers || {}));
  pravda('a jde na adresu z databáze', m.to && m.to[0] === 'nekdo@example.com', JSON.stringify(m.to));
  pravda('a zapíše se jen to, co v e-mailu stálo',
    stav.zapsano.length === 1 && (stav.zapsano[0].p_klice || []).length === 1,
    `zapsáno klíčů ${(stav.zapsano[0] && stav.zapsano[0].p_klice || []).length}`);

  /* cc) VÍC NOVINEK, NEŽ SE DO E-MAILU VEJDE. Bez téhle dvojice by
         kontrola „zapíše se jen to, co v e-mailu stálo" procházela i
         rozbitá: při jediné novince je „prvních osm" totéž jako „všechno".
         Tady se zapomene jedenáct klíčů, do e-mailu se jich vejde osm —
         a zapsat se smí právě těch osm, jinak by tři nabídky nikdo nikdy
         neuvidel. */
  stav.poslano = []; stav.zapsano = [];
  /* Zapomene se jich o hodně víc, než se do e-mailu vejde: část klíčů
     padne na tutéž nabídku ze dvou zdrojů nebo na týž pozemek s jinou
     cenou (to noveProHledani() správně slučuje), takže „zapomenutých
     jedenáct" nemusí znamenat „jedenáct novinek". Čtyřicet stačí
     s rezervou a kontrola níž se neopírá o moje vlastní přepočítání. */
  stav.poslaneKlice = prvniKlice.slice(40);
  v = await spust(['--opravdu'], { RESEND_API_KEY: 'k', PK_MAIL_FROM: 'a@b.cz' });
  pravda('víc novinek, než se vejde: e-mail odejde jeden',
    stav.poslano.length === 1, `odesláno ${stav.poslano.length}; ` + v.vystup.slice(-200));
  pravda('a jako odeslané se zapíše jen to, co v něm stálo (ne celý zbytek)',
    (stav.zapsano[0] && (stav.zapsano[0].p_klice || []).length) === sklad.MAX_V_MAILU,
    `zapsáno ${(stav.zapsano[0] && stav.zapsano[0].p_klice || []).length}, `
    + `má být ${sklad.MAX_V_MAILU} (novinek bylo ${sklad.MAX_V_MAILU + 3})`);
  const telo = (stav.poslano[0] || {}).text || '';
  pravda(`a vypíše právě ${sklad.MAX_V_MAILU} odkazů`,
    (telo.match(/parcelaka\.cz\/pozemek-/g) || []).length === sklad.MAX_V_MAILU,
    `odkazů ${(telo.match(/parcelaka\.cz\/pozemek-/g) || []).length}`);
  pravda('a řekne, kolik jich zbývá (číslo si nepočítám po svém — jen musí být)',
    /a dalších (\d+)\./.test(telo) && parseInt(RegExp.$1, 10) >= 1,
    telo.slice(-400));

  /* d) NASUCHO: tytéž podmínky, ale bez --opravdu — a nic neodejde. */
  stav.poslano = []; stav.zapsano = [];
  v = await spust([], { RESEND_API_KEY: 'k', PK_MAIL_FROM: 'a@b.cz' });
  pravda('bez přepínače --opravdu neodejde nic', stav.poslano.length === 0, `odesláno ${stav.poslano.length}`);
  pravda('a nic se nezapíše jako odeslané', stav.zapsano.length === 0, `zapsáno ${stav.zapsano.length}`);
  pravda('ale vypíše se, co by odešlo', /→ nekdo@example\.com/.test(v.vystup), v.vystup.slice(-300));

  /* e) BEZ KLÍČE POŠTY: ani s --opravdu se neposílá. */
  stav.poslano = [];
  v = await spust(['--opravdu'], { RESEND_API_KEY: '', PK_MAIL_FROM: 'a@b.cz' });
  pravda('bez klíče poštovní služby neodejde nic ani s --opravdu',
    stav.poslano.length === 0 && /NASUCHO/.test(v.vystup), v.vystup.slice(-200));

  /* f) ODHLÁŠENÝ ČLOVĚK se v seznamu neobjeví — to řeší SQL; tady se
        kontroluje, že rozesílač prázdný seznam přijme a nic nevymyslí. */
  hledani = []; stav.poslano = [];
  v = await spust(['--opravdu'], { RESEND_API_KEY: 'k', PK_MAIL_FROM: 'a@b.cz' });
  pravda('prázdný seznam znamená žádný e-mail',
    stav.poslano.length === 0 && v.kod === 0 && /Není komu psát/.test(v.vystup), v.vystup.slice(-200));
} finally {
  server.close();
}

console.log('\nRozesílač upozornění e-mailem');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log(`::error::Rozesílač: ${chyb} kontrol neprošlo.`); process.exit(1); }
