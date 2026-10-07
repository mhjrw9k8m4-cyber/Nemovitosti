// Test: patička drží tvar — na počítači i na telefonu.
//
// Spuštění: node scripts/test-paticka.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PATIČKA JE DNES JEDEN ŘÁDEK. Byly v ní čtyři sloupce odkazů (Produkt,
// Informace, Rádce, Právní) — rozcestník přes celou obrazovku pod každou
// stránkou, kterým nikdo neprochází; všechno, co v něm stálo, vede i
// z menu v hlavičce. Majitel webu ho opakovaně odmítl, tak je pryč.
//
// Zůstaly PRÁVNÍ ODKAZY, a to schválně: web zakládá účty, posílá e-maily
// a zpracovává osobní údaje, takže na zásady soukromí, podmínky a kontakt
// musí jít dosáhnout z každé stránky. Právě to se tu měří — spolu s tím,
// co už jednou bylo rozbité:
//   • odkazy se musí dát trefit prstem (44 px, ne 21),
//   • tlačítko „Nahoru" nesmí ležet na copyrightu (to je nalezená vada,
//     naměřeno 66×19 px překryvu, viz scripts/test-nahoru.mjs),
//   • a řádek se nesmí rozsypat do slitého odstavce na úzkém telefonu.
import { chromium } from 'playwright-core';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Úvod má patičku s mapou nad sebou, textová stránka bez ní — obě ji sdílejí.
const STRANKY = ['index.html', 'cena-pozemku.html'];
// Odkazy, které v patičce musí zůstat, ať se nestane, že je někdo „uklidí" taky.
const POVINNE = [['ochrana-udaju.html', 'zásady soukromí'], ['podminky.html', 'podmínky'],
  ['kontakt.html', 'kontakt']];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/** Změří patičku na jedné stránce v jedné šířce. */
async function zmer(stranka, sirka) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: 900 },
    isMobile: sirka < 700, hasTouch: sirka < 700, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);
  /* POČKAT, AŽ SE STRÁNKA ZASTAVÍ. Posouvá se plynule, takže měřit
     stránku, která se ještě hýbe, znamená měřit něco, co nikdo neuvidí. */
  await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await p.evaluate(async () => {
    let minuly = -1, stejne = 0;
    for (let i = 0; i < 60 && stejne < 3; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const y = Math.round(window.scrollY);
      stejne = (y === minuly) ? stejne + 1 : 0;
      minuly = y;
    }
  });
  const v = await p.evaluate(() => {
    const f = document.querySelector('footer');
    const fb = document.querySelector('.foot-bottom');
    if (!f || !fb) return { chybi: true, paticka: !!f, radek: !!fb };
    const odkazy = [...fb.querySelectorAll('a')].map((a) => {
      const r = a.getBoundingClientRect();
      return { text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') || '',
        top: Math.round(r.top), vyska: Math.round(r.height), sirka: Math.round(r.width) };
    });
    const t = document.getElementById('to-top');
    const copy = fb.querySelector('.mono');
    const rc = copy ? copy.getBoundingClientRect() : null;
    const tr = (t && t.classList.contains('show')) ? t.getBoundingClientRect() : null;
    const prekryv = (a, b) => (a && b)
      ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left))
        * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))
      : 0;
    /* Rozcestník ze čtyř sloupců se sem vrátit nesmí: byl to přesně ten
       blok, co měl zmizet. */
    return { chybi: false, odkazy,
      sloupcu: document.querySelectorAll('footer .foot-col').length,
      vyskaPaticky: Math.round(f.getBoundingClientRect().height),
      radkuOdkazu: new Set(odkazy.map((a) => a.top)).size,
      nahoruNaCopyrightu: Math.round(prekryv(rc, tr)),
    };
  });
  await ctx.close();
  return v;
}

for (const s of STRANKY) {
  for (const sirka of [1280, 390]) {
    const v = await zmer(s, sirka);
    const kde2 = `${s} @ ${sirka}`;
    pravda(`${kde2} — patička i její řádek jsou na stránce`, v.chybi === false, JSON.stringify(v));
    if (v.chybi) continue;
    pravda(`${kde2} — a není z ní zase rozcestník se sloupci`, v.sloupcu === 0,
      `sloupců ${v.sloupcu} — čtyřsloupcový rozcestník se vrátil`);
    for (const [href, jmeno] of POVINNE) {
      pravda(`${kde2} — vede z ní odkaz na ${jmeno}`,
        v.odkazy.some((a) => a.href === href),
        `odkazy: ${v.odkazy.map((a) => a.href).join(', ') || '(žádné)'}`);
    }
    /* „Žádný odkaz" by prošel .every() stejně dobře jako „všechny dost
       vysoké" — proto se nejdřív ptáme, jestli tam nějaké jsou. */
    if (sirka < 700) {
      pravda(`${kde2} — odkazy se dají trefit prstem (44 px)`,
        v.odkazy.length > 0 && v.odkazy.every((a) => a.vyska >= 44),
        v.odkazy.length === 0 ? 'v patičce není ani jeden odkaz'
          : 'nejnižší ' + Math.min(...v.odkazy.map((a) => a.vyska)) + ' px');
      pravda(`${kde2} — patička zůstala řádkem, ne odstavcem`, v.radkuOdkazu <= 2,
        `odkazy jsou v ${v.radkuOdkazu} řádcích`);
    }
    pravda(`${kde2} — tlačítko „Nahoru" neleží na copyrightu`, v.nahoruNaCopyrightu === 0,
      `překryv ${v.nahoruNaCopyrightu} px²`);
  }
}

await prohlizec.close();
console.log('\nPatička — jeden řádek, a ten musí držet');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Patička: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
