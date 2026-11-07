/* Zkouška: co hlídání SLIBUJE, musí odpovídat tomu, co je zapnuté.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-slib-hlidani.mjs
 * Volá ji .github/workflows/testy.yml (krok „Slib hlídání").
 *
 * PROČ TO VZNIKLO. Na hlidani.html se každému návštěvníkovi vykreslí
 * karta, která tu službu prodává. Do 7. 11. v ní stálo „Co vám hlídání
 * POŠLE", „upozornění CHODÍ" a „takhle často by se OZVALA tahle tři
 * hlídání" — tři věty o tom, že se web ozve sám. Obě cesty ven jsou
 * přitom vypnuté: `PK_MAIL_ZAPNUTO` je false a veřejný klíč VAPID je
 * prázdný, takže se u uloženého hledání nevykreslí ani jeden z těch
 * dvou přepínačů. Naměřeno nasucho z Actions 7. 11.: „Není komu psát:
 * žádné hledání se zapnutým posíláním." Nula odběratelů, nula pošty —
 * a web o ní mluvil v budoucím čase jako o hotové věci.
 *
 * HLÍDÁNÍ SAMO FUNGUJE a text to teď říká správně: nové pozemky se
 * vypíšou přímo v kartě uloženého hledání a jejich počet ukazuje
 * i úvodní stránka. Jen se nikam neposílají.
 *
 * CO SE MĚŘÍ. Trojí, a prostřední dvě jsou ta podstatná:
 *   1. jak je to v repozitáři TEĎ — text karty sedí s js/config.js,
 *   2. s VYPNUTÝMI cestami ven text neslibuje odeslání,
 *   3. se ZAPNUTOU poštou ho slibuje.
 * Body 2 a 3 se měří na podstrčeném js/min/config.js, takže zkouška
 * nezávisí na tom, co v repozitáři zrovna je — a nezestárne ve chvíli,
 * kdy se pošta zapne.
 *
 * ČTE: hlidani.html přes server zkoušek. NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Slib hlídání', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Slova, kterými web tvrdí „ozveme se ti sami". Hledají se bez ohledu
   na velikost písmen a bez diakritiky se neobejdou — jsou to konkrétní
   české tvary z té karty. */
const SLIBUJE = /(pošle|chodí|ozvala|přijd)/i;

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/* Otevře hlidani.html a vrátí text té karty. `zmena` smí přepsat
   obsah js/min/config.js — tím se dá změřit OBOJE chování, aniž by se
   do repozitáře sahalo. */
async function karta(zmena) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 } });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return r.abort();
    if (!zmena || !/\/min\/config\.js/.test(u.pathname)) return r.continue();
    const odp = await r.fetch();
    return r.fulfill({ response: odp, body: zmena(await odp.text()),
      headers: { ...odp.headers(), 'content-type': 'text/javascript' } });
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/hlidani.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.hl-ukazka', { timeout: 20000 }).catch(() => {});
  const ven = await p.evaluate(() => {
    const e = document.querySelector('.hl-ukazka');
    return {
      text: e ? (e.textContent || '').replace(/\s+/g, ' ').trim() : '',
      nadpis: e && e.querySelector('h2') ? e.querySelector('h2').textContent.trim() : '',
      mail: !!window.PK_MAIL_ZAPNUTO,
      push: !!window.PK_PUSH_VEREJNY_KLIC,
    };
  });
  await ctx.close();
  return ven;
}

/* ---- 1. JAK TO JE TEĎ ---------------------------------------------- */
const ted = await karta(null);
pravda('karta „co hlídání umí" se návštěvníkovi vykreslí', !!ted.text, 'karta v DOM není');
const posilaTed = ted.mail || ted.push;
pravda(`a její text sedí s js/config.js (pošta ${ted.mail ? 'zapnutá' : 'vypnutá'}, `
  + `telefon ${ted.push ? 'zapnutý' : 'vypnutý'})`,
  SLIBUJE.test(ted.text) === posilaTed,
  `nadpis „${ted.nadpis}"\n      text: ${ted.text.slice(0, 160)}`);

/* ---- 2. VYPNUTÉ CESTY VEN ------------------------------------------ */
const vyp = await karta((t) => t
  .replace(/PK_MAIL_ZAPNUTO\s*=\s*[^;]+/, 'PK_MAIL_ZAPNUTO = false')
  .replace(/PK_PUSH_VEREJNY_KLIC\s*=\s*[^;]+/, "PK_PUSH_VEREJNY_KLIC = ''"));
pravda('s vypnutou poštou i telefonem se nastavení opravdu podstrčilo',
  vyp.mail === false && vyp.push === false, JSON.stringify({ mail: vyp.mail, push: vyp.push }));
pravda('a karta pak NESLIBUJE, že se web ozve sám',
  !!vyp.text && !SLIBUJE.test(vyp.text),
  `nadpis „${vyp.nadpis}"\n      text: ${vyp.text.slice(0, 200)}`);
pravda('místo toho řekne, kde nové pozemky uvidí',
  /vypíšou|uvidíte/i.test(vyp.text), vyp.text.slice(0, 200));

/* ---- 3. ZAPNUTÁ POŠTA ---------------------------------------------- */
const zap = await karta((t) => t.replace(/PK_MAIL_ZAPNUTO\s*=\s*[^;]+/, 'PK_MAIL_ZAPNUTO = true'));
pravda('se zapnutou poštou se nastavení opravdu podstrčilo', zap.mail === true,
  JSON.stringify({ mail: zap.mail }));
pravda('a karta pak odeslání slíbí (jinak by si služby nikdo nevšiml)',
  !!zap.text && SLIBUJE.test(zap.text),
  `nadpis „${zap.nadpis}"\n      text: ${zap.text.slice(0, 200)}`);

await prohlizec.close();
console.log('\nSlib hlídání');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Slib hlídání: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
