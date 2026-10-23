/* Hlavička CSP do každé stránky — s hashi vložených skriptů.
   ==================================================================
   Spuštění: node scripts/csp.mjs            (součást oprav.mjs)
             node scripts/csp.mjs --vypis    (jen vypíše, nezapisuje)

   PROČ. Změřeno 23. 10.: ani jedna z 2 357 stránek nenesla
   Content-Security-Policy. Web je statický na GitHub Pages, takže
   hlavičku v HTTP odpovědi nastavit nejde — jediná cesta je
   <meta http-equiv>. Co meta opravdu umí a co ne, je napsané níž.

   Bez CSP stačí k podstrčení cizího skriptu jedno místo, kde se do
   stránky dostane neescapovaný text. Takové místo se tu zatím nenašlo
   (zprávy mezi lidmi i inzeráty jdou přes escape), ale escape je
   napsaný v jedenácti kopiích a nic nehlídá, že dvanáctá nezapomene.
   CSP je druhá pojistka: i kdyby se text do HTML dostal, prohlížeč ho
   nespustí.

   JAK SE POLITIKA ZMĚŘILA, NE UHÁDLA. Sedm typů stránek se otevřelo
   v Chromiu a zapsalo se, kam skutečně sahají (druh zdroje → host):
     script      vlastní server (96 požadavků)
     image       server.arcgisonline.com (29), {a,b,c}.tile.openstreetmap.org (27)
     font        vlastní server (14)
     stylesheet  vlastní server (8)
     fetch       vlastní server (3), tcinuzftgmkvjjgvadky.supabase.co (2)
   K tomu z kódu to, co odhlášený návštěvník nevyvolá (poučení z
   oddílu 108 — kdo měří jen odhlášený stav, nemá naměřenou stránku):
     · fotky inzerátů ze Supabase Storage (js/pridat.js, /storage/v1/…)
     · geokodér nominatim.openstreetmap.org (js/pridat.js, při psaní adresy)
   Adresa Supabase se tady NEOPISUJE — čte se z js/config.js, aby se
   politika nemohla rozejít s tím, kam aplikace opravdu mluví.

   CO META NEUMÍ. Direktivy frame-ancestors, report-uri a sandbox
   prohlížeč v <meta> ignoruje. Tedy: klikjacking tahle cesta
   neuzavře (na to je potřeba hlavička z serveru) a porušení se nikam
   nehlásí. Je to zapsané i v docs/pred-vydanim.md, aby se na to při
   přechodu na vlastní hosting nezapomnělo.

   PROČ 'unsafe-inline' U STYLŮ. Vložené atributy style= na stránkách
   jsou (naměřeno) 33 na okresní stránce a 15 na úvodní — geometrie
   grafů a pruhů, která se počítá z dat. Hashovat je nejde: CSP hashuje
   obsah <style>, nikoli atribut. Zbývalo by 'unsafe-hashes' s hashem
   každé jednotlivé hodnoty, což u počítané geometrie znamená nový hash
   při každém běhu robota. Riziko je malé (styl neumí spustit kód),
   zisk z hashování nulový — proto 'unsafe-inline' jen u stylů, a u
   skriptů nikdy.

   JEDNA VÝJIMKA: 'unsafe-eval' NA STRÁNCE S KONTROLOU FOTEK. Změřeno
   v prohlížeči pod touhle politikou: kontrola fotek AI modelem
   (vendor/tfjs + vendor/nsfwjs) se bez eval nerozjede vůbec —
   `tf.ready is not a function` a čtyři porušení (dvě „eval", dvě
   „wasm-eval"). Vyzkoušené varianty:

     'wasm-unsafe-eval'              nestačí (zbydou dvě porušení „eval")
     'unsafe-eval'                   projde, model klasifikuje
     'unsafe-eval' 'wasm-unsafe-eval' projde taky (wasm navíc netřeba)

   Povolit eval celému webu by znamenalo vzdát se většiny toho, k čemu
   CSP je. Výjimku proto dostane jen stránka, která si model opravdu
   může načíst, a POZNÁ SE PRAVIDLEM, ne ručním seznamem: bere
   js/pridat.js nebo js/fototema.js (jediná dvě místa, odkud se tfjs
   stahuje) A má ve zdroji <input type="file">. Dnes to dělá jedna
   stránka z 2 357 — pridat.html. Čtrnáct stránek ten skript bere, ale
   třináct z nich formulář s fotkou nemá; změřeno v prohlížeči, že na
   nich po doběhnutí JS žádné input[type=file] nevznikne a PKKontrola
   se ani nezaloží, takže tfjs se tam nemá jak spustit.

   Aby ta výjimka nešla zneužít vlastním kódem, hlídá zkouška, že
   v js/ ani scripts/ není eval ani new Function — tedy že si žádný
   náš skript nespouští text jako kód. Přísnější cesta (model
   v rámu s vlastní politikou) je zapsaná v docs/optimalizace.md,
   oddíl 112; dnes by znamenala přepsat kontrolu fotek na posílání
   zpráv mezi rámy, což je víc rizika než zisku.

   SKRIPTY SE HASHUJÍ VŠECHNY. Vložených spustitelných skriptů je
   13 916 v 8 460 různých podobách (3,8 MB), protože každá stránka
   pozemku si nese svá data. Na stránku to dělá 1–7 hashů, tedy
   54–378 B navíc v HTML. JSON-LD (2 351 bloků) se nehashuje: prohlížeč
   ho nespouští a script-src se na něj nevztahuje.
   ================================================================== */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Adresa Supabase ze zdroje aplikace, ne z paměti. */
export function supabaseHost() {
  const s = readFileSync(path.join(KOREN, 'js', 'config.js'), 'utf8');
  const m = s.match(/PK_SUPABASE_URL\s*=\s*['"]https:\/\/([^'"/]+)/);
  if (!m) throw new Error('v js/config.js není PK_SUPABASE_URL — politika by vznikla naslepo');
  return m[1];
}

/* Dlaždice mapy. V kódu stojí jako https://{s}.tile.openstreetmap.org,
   {s} prohlížeč rozepíše na a, b, c — v politice musí být všechny tři
   (hvězdička v hostiteli by pustila i cizí poddomény). */
const DLAZDICE = ['a', 'b', 'c'].map((s) => `https://${s}.tile.openstreetmap.org`);
const SATELIT = 'https://server.arcgisonline.com';
const GEOKODER = 'https://nominatim.openstreetmap.org';

/* Stránka, která si může načíst model na kontrolu fotek. Viz hlavička
   oddílu o výjimce: pravidlo, ne seznam. */
export function potrebujeEval(html) {
  const moduly = /src="js\/(min\/)?(pridat|fototema)\.js/.test(html);
  const fotka = /<input[^>]*type="file"/.test(html);
  return moduly && fotka;
}

export function politika(hashe, eval_) {
  const sb = 'https://' + supabaseHost();
  const d = [
    ['default-src', ["'self'"]],
    /* Hashe, ne 'unsafe-inline': podstrčený <script> se nespustí. */
    ['script-src', ["'self'", ...(eval_ ? ["'unsafe-eval'"] : []), ...hashe.map((h) => `'${h}'`)]],
    ['style-src', ["'self'", "'unsafe-inline'"]],
    ['img-src', ["'self'", 'data:', 'blob:', SATELIT, ...DLAZDICE, sb]],
    ['font-src', ["'self'"]],
    ['connect-src', ["'self'", sb, GEOKODER]],
    ['worker-src', ["'self'"]],
    ['manifest-src', ["'self'"]],
    ['media-src', ["'self'"]],
    /* Nic z toho web nepoužívá, a co se nepoužívá, má být zakázané. */
    ['object-src', ["'none'"]],
    ['frame-src', ["'none'"]],
    ['base-uri', ["'none'"]],
    ['form-action', ["'self'"]],
  ];
  return d.map(([k, v]) => k + ' ' + v.join(' ')).join('; ');
}

/* Vložené SPUSTITELNÉ skripty. Bez src (ty se řeší 'self') a bez
   datových bloků (JSON-LD, application/json, šablony) — prohlížeč je
   nespouští, takže hash nepotřebují a jen by nadouval hlavičku. */
const SKRIPT = /<script([^>]*)>([\s\S]*?)<\/script>/g;
const SPUSTITELNY = /^(?:$|text\/javascript$|application\/javascript$|module$)/;

export function hashe(html) {
  const out = [];
  let m;
  SKRIPT.lastIndex = 0;
  while ((m = SKRIPT.exec(html))) {
    const atributy = m[1] || '';
    if (/\ssrc\s*=/.test(atributy)) continue;
    const typ = (atributy.match(/\stype\s*=\s*["']?([^"'\s>]*)/) || [, ''])[1].trim().toLowerCase();
    if (!SPUSTITELNY.test(typ)) continue;
    const h = 'sha256-' + createHash('sha256').update(m[2], 'utf8').digest('base64');
    if (out.indexOf(h) < 0) out.push(h);
  }
  return out;
}

const META = /[ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n?/;
const KOTVA = /(<meta charset="[^"]*">\n)/i;

export function osaz(html) {
  const tag = `  <meta http-equiv="Content-Security-Policy" content="${politika(hashe(html), potrebujeEval(html))}">\n`;
  if (META.test(html)) return html.replace(META, tag);
  if (!KOTVA.test(html)) return null;        /* stránka bez charsetu: ať se to pozná */
  return html.replace(KOTVA, '$1' + tag);
}

export function stranky() {
  return readdirSync(KOREN).filter((f) => f.endsWith('.html')).sort();
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const jenVypis = process.argv.includes('--vypis');
  let zmeneno = 0, bezKotvy = [], hashuCelkem = 0;
  const sEvalem = [];
  for (const f of stranky()) {
    const p = path.join(KOREN, f);
    const puvodni = readFileSync(p, 'utf8');
    const novy = osaz(puvodni);
    if (novy === null) { bezKotvy.push(f); continue; }
    if (potrebujeEval(puvodni)) sEvalem.push(f);
    hashuCelkem += hashe(puvodni).length;
    if (novy !== puvodni) { zmeneno++; if (!jenVypis) writeFileSync(p, novy); }
  }
  if (bezKotvy.length) {
    console.error('::error::Stránka bez <meta charset>, CSP se nemá kam vložit: ' + bezKotvy.slice(0, 3).join(', '));
    process.exit(1);
  }
  console.log(`CSP: ${stranky().length} stránek, ${hashuCelkem} hashů vložených skriptů, ${jenVypis ? 'ke změně' : 'změněno'} ${zmeneno}.`);
  console.log(`    s 'unsafe-eval' (kontrola fotek): ${sEvalem.length} — ${sEvalem.join(', ') || 'žádná'}`);
}
