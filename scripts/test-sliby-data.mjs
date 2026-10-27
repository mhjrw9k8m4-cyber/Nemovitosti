// Test: co web slibuje o DATECH, to taky dělá.
//
// Spuštění: node scripts/test-sliby-data.mjs   (nepotřebuje prohlížeč)
//
// Sourozenec scripts/test-sliby.mjs hlídá sliby, které jsou vidět na
// vykreslené stránce, a potřebuje k tomu prohlížeč. Tenhle hlídá sliby
// o nakládání s daty, a ty se dají ověřit ze zdroje — proto zvlášť.
//
// V zásadách soukromí stálo „Účet a uložené pozemky běží zatím jen ve vašem
// prohlížeči (localStorage). Nic se neodesílá na server." Byla to pravda —
// a zestárla: web mezitím dostal účty, hlídání, inzeráty i zprávy, takže
// js/auth.js volá auth/v1/signup a v databázi je devět tabulek.
// Vedle toho stálo „Žádné reklamní ani sledovací skripty třetích stran",
// zatímco 2 006 stránek načítalo značku analytiky.
//
// Takovou nepravdu nepozná žádný z ostatních testů: kontrast, odstíny ani
// rozvržení se neptají, jestli text mluví pravdu. A u slibu o cizích
// osobních údajích je to ta nejdražší chyba, jakou web může mít — dražší
// než kterákoli vada vzhledu.
//
// Pravidlo je proto obrácené než obvykle: NEHLÍDÁ SE KÓD, HLÍDÁ SE TEXT.
// Ke každému absolutnímu slibu patří skutečnost, kterou jde změřit.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pricinaChyb } from './chyby-hlaska.mjs';

const req = createRequire(import.meta.url);

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const main = readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8');

// --- Text zásad soukromí vytáhnout z INFO.soukromi -------------------
const odkud = main.indexOf('soukromi: {');
const pokud = main.indexOf('podminky: {', odkud);
/* KOMENTÁŘE PRYČ. U každé opravené věty stojí v kódu vysvětlivka, která
   cituje, co tam bylo dřív — a tenhle test by ji našel jako živý text
   a hlásil nepravdu, která už tam není. Přesně to se při psaní stalo. */
const text = (odkud >= 0 && pokud > odkud ? main.slice(odkud, pokud) : '')
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/^\s*\/\/[^\n]*$/gm, ' ');
pravda('zásady soukromí se v js/main.js našly', text.length > 400,
  `nalezeno ${text.length} znaků — změnil se název bloku INFO.soukromi?`);

// --- Skutečnost 1: posílá web něco na server? ------------------------
const jsSoubory = readdirSync(path.join(KOREN, 'js')).filter((f) => f.endsWith('.js'));
const vsechenJs = jsSoubory.map((f) => readFileSync(path.join(KOREN, 'js', f), 'utf8')).join('\n');
const volaUcty = /auth\/v1\/(signup|token|user|recover)/.test(vsechenJs);
const volaData = /rest\/v1\//.test(vsechenJs);
pravda('web opravdu volá server (jinak tenhle test nic nehlídá)',
  volaUcty && volaData,
  `účty ${volaUcty}, data ${volaData} — pokud web server opustil, patří sem jiný slib`);

// Absolutní popření odesílání nesmí stát v textu, když se odesílá.
const popiraOdesilani = /[Nn]ic se neodesílá na server/.test(text);
pravda('text netvrdí „nic se neodesílá na server", když web volá účty',
  !(popiraOdesilani && volaUcty),
  'v zásadách stojí, že se nic neodesílá, ale js volá auth/v1 — jedno z toho je nepravda');

// A naopak: když se odesílá, text to musí říct.
pravda('text přiznává, že s účtem jdou data na server',
  !volaUcty || /na server/.test(text.replace(/[Nn]ic se neodesílá na server/g, '')),
  'web má účty, ale zásady o odesílání na server mlčí');

// --- Skutečnost 2: načítá web cizí nebo měřicí značku? ---------------
const htmlSoubory = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const MERICI = /(_vercel\/insights|google-analytics|googletagmanager|plausible|matomo|hotjar|clarity\.ms|segment\.com)/;
const sMerenim = htmlSoubory.filter((f) =>
  MERICI.test(readFileSync(path.join(KOREN, f), 'utf8')));
const tvrdiBezSkriptu = /[Žž]ádné[^<]{0,40}(sledovací|měřicí|analytické)[^<]{0,20}skripty/.test(text);
pravda('text netvrdí „žádné sledovací skripty", když je stránky načítají',
  !(tvrdiBezSkriptu && sMerenim.length > 0),
  `měřicí značku nese ${sMerenim.length} stránek (např. ${sMerenim.slice(0, 2).join(', ')}), `
  + 'a zásady přitom tvrdí, že žádné takové skripty nejsou');

// --- Skutečnost 3: co zůstává v prohlížeči, to ať text jmenuje -------
const klice = [...vsechenJs.matchAll(/'(pk_[a-z0-9_]+)'/g)].map((m) => m[1]);
pravda('web si v prohlížeči opravdu něco ukládá (jinak nemá co slibovat)',
  new Set(klice).size >= 5, `nalezeno klíčů: ${new Set(klice).size}`);
pravda('text zmiňuje, že část věcí zůstává jen v prohlížeči',
  /localStorage|ve vašem prohlížeči/.test(text),
  'zásady o místním úložišti mlčí, přestože web používá ' + new Set(klice).size + ' klíčů');

// --- Skutečnost 4: slib o GDPR a kontaktu ----------------------------
pravda('text říká, jak uplatnit práva podle GDPR',
  /GDPR/.test(text) && /(výmaz|opravu|přístup)/.test(text),
  'v zásadách chybí poučení o právech');

/* ---- KDE LEŽÍ ULOŽENÉ POZEMKY A POZNÁMKY --------------------------

   Tenhle test hlídal zásady soukromí JEN v js/main.js (okno s textem),
   a právě na tom se to 23. 10. ukázalo: okno bylo poctivě přepsané
   („Bez přihlášení… / S účtem…"), kdežto čtyři další místa mluvila
   o světě před účty.

     * ochrana-udaju.html — celý PRÁVNÍ dokument: v seznamu údajů
       uložené pozemky ani poznámky vůbec nebyly a v oddílu o úložišti
       stálo, že „zůstávají u vás v zařízení a neodesílají se nám";
     * moje-data.html — „Nic z toho se nikam neodesílá";
     * porovnani.html — „Uložené pozemky leží jen v tomhle prohlížeči…
       a nikam se neodesílají";
     * index.html, otázka o registraci (dvakrát: viditelný text
       i strukturovaná data pro vyhledávač) — „Nic se neodesílá na
       server";
     * js/ulozene.js — popis poznámek na stránce „Moje data":
       „Nikam se neodesílají."

   Poznámky i uložené pozemky přitom u přihlášeného člověka leží na
   serveru (supabase/poznamky.sql, supabase/ulozene-na-uctu.sql).
   Pravidlo je proto: KDE SE O NICH ŘÍKÁ, ŽE NIKAM NEJDOU, TAM MUSÍ BÝT
   ŘEČENO, ŽE TO PLATÍ BEZ ÚČTU. Text, který to nerozlišuje, je v právním
   dokumentu nepravda — a nepravda v něm je dražší než kterákoli vada
   vzhledu. */
{
  const JEN_TADY = /neodesíl|neposíl|nejde na server|nejdou na server|zůstáv\w*[\s ]+(?:jen[\s ]+)?(?:u[\s ]+vás|ve[\s ]+vašem|jen[\s ]+tady|jen[\s ]+v)|leží[\s ]+jen/i;
  /* ROZLIŠENÍ, ne jen slovo „přihlášení". Sabotáž to ukázala na otázce
     o registraci: „Žádná registrace ani přihlášení — …" to slovo nese,
     a přitom nic nerozlišuje. Platí jen věta, která říká, KDY to platí. */
  const ROZLISENI = /bez[\s\u00a0]přihlášení|bez[\s\u00a0]účtu|s[\s\u00a0]účtem|když[\s\u00a0]se[\s\u00a0]přihlásíte|když[\s\u00a0]účet[\s\u00a0]máte|po[\s\u00a0]přihlášení|nepřihlášen|účet[\s\u00a0]máte|máte[\s\u00a0]účet/i;
  const VEC = /ulož|uložen|poznám/i;
  /* Věta = úsek mezi tečkami — ale MĚŘÍ SE DVOJICE PO SOBĚ JDOUCÍCH VĚT.
     Jedna věta nestačí a doložila to sabotáž: „Co jste si k pozemkům
     napsali. Nikam se neodesílají." i „…uložené oblíbené pozemky…
     Tyto informace zůstávají u vás v zařízení a neodesílají se nám."
     mají věc v jedné větě a slib ve druhé, takže kontrola nad jednou
     větou obě ty nepravdy přehlédla — vrátil jsem je do souboru a nic
     se neozvalo. */
  function dvojice(t) {
    const v = t.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/);
    const out = [];
    /* OKNO AŽ TŘÍ VĚT. Dvě nestačily: v otázce o registraci stojí věc
       v první větě („pozemek se uloží přímo ve vašem prohlížeči"),
       mezivěta o historii uprostřed a slib ve třetí („Nic se neodesílá
       na server"). Vrátil jsem starou odpověď a kontrola mlčela. */
    for (let i = 0; i < v.length; i++) {
      for (let d = 1; d <= 3 && i + d <= v.length; d++) out.push(v.slice(i, i + d).join(' '));
    }
    return out;
  }
  const nalezy = [];
  /* a) ruční stránky. Vygenerované (pozemek-, okres-, kraj-) se berou
     taky: kdyby se nepravda dostala do předlohy, je na nich 2 200×. */
  for (const f of htmlSoubory) {
    const text = readFileSync(path.join(KOREN, f), 'utf8')
      .replace(/<script[\s\S]*?<\/script>/g, ' ')   // JSON-LD se měří zvlášť
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ');
    for (const v of dvojice(text)) {
      if (VEC.test(v) && JEN_TADY.test(v) && !ROZLISENI.test(v)) nalezy.push(`${f}: „${v.trim().slice(0, 120)}"`);
    }
  }
  /* b) strukturovaná data pro vyhledávač — do nich se Google podívá
     dřív než člověk na stránku, takže nepravda v nich platí stejně. */
  for (const f of htmlSoubory) {
    const zdroj = readFileSync(path.join(KOREN, f), 'utf8');
    for (const m of zdroj.matchAll(/"(?:text|description)":"((?:[^"\\]|\\.)*)"/g)) {
      const t = m[1].replace(/\\"/g, '"');
      for (const v of dvojice(t)) {
        if (VEC.test(v) && JEN_TADY.test(v) && !ROZLISENI.test(v)) nalezy.push(`${f} (data pro vyhledávač): „${v.trim().slice(0, 120)}"`);
      }
    }
  }
  /* c) texty ve skriptech. SKENOVAT VŠECHNY ŘETĚZCE V KÓDU NEJDE —
     zkusil jsem to a kontrola ohlásila jako nepravdu kus kódu
     z js/pozemek.js: mezi dvěma nesouvisejícími uvozovkami leží
     všechno, co je mezi nimi, včetně dalších řetězců. Měří se proto
     jen POLE S TEXTEM PRO ČLOVĚKA (popis, nazev, sub, veta), tedy to,
     co se opravdu vypisuje na stránku. Okno se zásadami v js/main.js
     má vlastní kontroly výš. */
  for (const f of jsSoubory) {
    const kodJs = readFileSync(path.join(KOREN, 'js', f), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
    for (const m of kodJs.matchAll(/(?:popis|nazev|sub|veta)\s*:\s*'((?:[^'\\]|\\.)*)'/g)) {
      const t = m[1].replace(/\\'/g, "'");
      for (const v of dvojice(t)) {
        if (VEC.test(v) && JEN_TADY.test(v) && !ROZLISENI.test(v)) nalezy.push(`js/${f}: „${v.trim().slice(0, 120)}"`);
      }
    }
  }
  pravda('nikde se netvrdí, že uložené pozemky a poznámky nikam nejdou, bez „bez přihlášení"',
    nalezy.length === 0, nalezy.slice(0, 6).join('\n      '));

  /* A pozitivně: právní dokument to musí říct. Chybějící věta není
     vidět — proto se hlídá, že tam je. */
  const zasady = readFileSync(path.join(KOREN, 'ochrana-udaju.html'), 'utf8');
  pravda('zásady soukromí jmenují uložené pozemky a poznámky na účtu',
    /Uložené pozemky a[\s ]poznámky/i.test(zasady)
    && /k[\s ]vašemu účtu/i.test(zasady),
    'v seznamu údajů o nich není ani slovo, a přitom leží na serveru');

  /* ---- A CO ODHLÁŠENÍ MAŽE, TO MUSÍ BÝT TOTÉŽ, CO JE OZNAČENÉ -----
     Dva seznamy téhož: příznak `zUctu` v js/ulozene.js (stránka „Moje
     data") a klíče, které maže uklidMistniKopie() v js/auth.js. Kdyby
     se rozešly, přibude třetí taková mezipaměť a odhlášení ji nechá
     ležet — tedy přesně ta vada, kterou tohle opravovalo. */
  const ulozeneJs = readFileSync(path.join(KOREN, 'js', 'ulozene.js'), 'utf8');
  const oznacene = [...ulozeneJs.matchAll(/\{\s*klic:\s*'([a-z0-9_]+)'[^}]*zUctu:\s*true/g)].map((m) => m[1]).sort();
  const authJs = readFileSync(path.join(KOREN, 'js', 'auth.js'), 'utf8');
  const telo = (/function uklidMistniKopie\(\)[\s\S]*?\n  \}/.exec(authJs) || [''])[0];
  const maze = [...new Set([...telo.matchAll(/'(pk_[a-z0-9_]+)'/g)].map((m) => m[1]))].sort();
  /* A jejich POPIS na stránce „Moje data" to musí říct. Heuristika nad
     větami to sama nepozná: v popisu poznámek se slovo „poznámka"
     nevyskytuje („Co jste si k pozemkům napsali. Nikam se
     neodesílají."), takže by taková nepravda prošla — ověřeno sabotáží,
     než tahle kontrola vznikla. */
  const bezRozliseni = [];
  for (const m of ulozeneJs.matchAll(/\{\s*klic:\s*'([a-z0-9_]+)'[^}]*zUctu:\s*true[^}]*\}/g)) {
    const popis = (/popis:\s*'((?:[^'\\]|\\.)*)'/.exec(m[0]) || ['', ''])[1];
    if (/neodesíl|neposíl/i.test(popis) && !ROZLISENI.test(popis)) bezRozliseni.push(m[1] + ': ' + popis.slice(0, 80));
    else if (!ROZLISENI.test(popis) && /jen tady|jen v tomhle|jen ve vašem/i.test(popis)) bezRozliseni.push(m[1] + ': ' + popis.slice(0, 80));
  }
  pravda('popis každé takové mezipaměti na „Mých datech" rozlišuje účet',
    bezRozliseni.length === 0, bezRozliseni.join('\n      '));

  pravda(`označených mezipamětí z účtu je víc než nula (${oznacene.length})`, oznacene.length >= 2,
    'v js/ulozene.js nemá příznak zUctu nic — pak tahle kontrola nic neváží');
  pravda('odhlášení maže právě ty mezipaměti, které jsou označené jako „i na účtu"',
    oznacene.join(',') === maze.join(','),
    `označené: ${oznacene.join(', ') || '(nic)'}\n      maže: ${maze.join(', ') || '(nic)'}`);
}

/* ---- POČTY NABÍDEK NA RŮZNÝCH STRÁNKÁCH SI NESMÍ ODPOROVAT ----

   Takhle to prasklo: stránka s daty psala „na stránkách najdete 1 939
   pozemků", kdežto stránka s cenami ve stejnou chvíli „1 940 nabídek na
   trhu pořád je". Jednička rozdílu vypadá jako chyba v počítání a
   podrývá všechna ostatní čísla na webu, i ta správná.

   Obě přitom platily, jen počítaly jiné množiny: 1 939 je dnešní soubor
   po odstranění duplicit, 1 940 je ARCHIV — množina, kterou web sleduje
   v čase a která zavírá zmizelé nabídky až dalším během.

   Hlídá se proto obojí: (1) že číslo na stránce s daty opravdu je ten
   soubor po odstranění duplicit, (2) že větě o archivu zůstalo slovo
   „sledovaných", které z rozporu dělá informaci, a (3) že archiv se od
   dnešního souboru nerozešel o víc než o pár nabídek — větší rozdíl už
   není vlastnost, ale vada. */
{
  const data = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  const H = req(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const C = req(path.join(KOREN, 'js', 'cisteni.js'));
  const K = req(path.join(KOREN, 'js', 'klic.js')).PKKlic;
  const bezDup = H.bezDuplicit(C.pozemky((data.opportunities || []).slice()));
  const cis = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '[\\s\u00a0]');

  const dataHtml = readFileSync(path.join(KOREN, 'data.html'), 'utf8');
  pravda(`stránka s daty uvádí počet po odstranění duplicit (${bezDup.length})`,
    new RegExp('najdete[\\s\u00a0]*<b>' + cis(bezDup.length) + '\\s*</b>').test(dataHtml),
    'na stránce stojí: ' + ((/najdete <b>[^<]*<\/b>/.exec(dataHtml) || ['(nic)'])[0]));

  const cenyHtml = readFileSync(path.join(KOREN, 'cena-pozemku.html'), 'utf8');
  if (/na trhu pořád je/.test(cenyHtml)) {
    pravda('věta o cenzurování říká, že jde o SLEDOVANÉ nabídky',
      /<b>sledovaných<\/b>[\s\u00a0]*nabídek[\s\u00a0]*na trhu pořád je/.test(cenyHtml),
      'bez toho slova si ten počet odporuje s počtem na stránce s daty');
  }

  let zive = 0;
  try {
    const stav = JSON.parse(readFileSync(path.join(KOREN, 'data', 'archiv', 'stav.json'), 'utf8'));
    /* Klíč se jmenuje `nabidky` — `zive` jsem si vymyslel a kontrola
       pak tiše neměřila nic (0 živých = podmínka se přeskočila).
       Našlo se to až tím, že kontrola nic nevypsala. */
    zive = Object.keys(stav.nabidky || {}).length;
  } catch (e) { /* archiv ještě není */ }
  if (zive) {
    const kliceDnes = new Set(bezDup.map((o) => K.klicArchivu(o)));
    const stav = JSON.parse(readFileSync(path.join(KOREN, 'data', 'archiv', 'stav.json'), 'utf8'));
    const navic = Object.keys(stav.nabidky || {}).filter((k) => !kliceDnes.has(k)).length;
    /* Jeden běh robota (6 hodin) přinese i odebere řádově desítky
       nabídek; víc než 5 % rozdílu znamená, že se archiv rozešel. */
    const strop = Math.max(50, Math.round(bezDup.length * 0.05));
    pravda(`archiv se od dnešního souboru nerozešel (živých ${zive}, dnes ${bezDup.length}, navíc ${navic})`,
      navic <= strop, `nabídek, které archiv vede jako živé a v datech nejsou: ${navic} (strop ${strop})`);
  }
}

console.log('\nSliby o datech — co web tvrdí, to taky dělá');
console.log(zpravy.join('\n'));
console.log(`\nzměřeno: ${jsSoubory.length} skriptů, ${htmlSoubory.length} ručních stránek, `
  + `měřicí značka na ${sMerenim.length} z nich`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Sliby o datech: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
