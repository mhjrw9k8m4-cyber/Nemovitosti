/* Test: když server neodpoví, profil NESMÍ tvrdit, že inzeráty nemáte.
   ==================================================================
   Spuštění: node scripts/test-profil-vypadek.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   NALEZENO. muj-inzerat.html si inzeráty vyžádá a při neúspěchu to
   dvakrát zopakuje. Když ani potřetí nic nepřijde, dosadil do dlaždic
   nuly („0 inzerátů, 0 zhlédnutí") a ukázal prázdný stav „Zatím tu
   žádný inzerát nemáte". V kódu u toho stálo, že nový účet stejně nic
   nemá a pomlčka by působila rozbitě.

   Jenže tahle větev nastane i tomu, kdo inzeráty MÁ — vypadne síť,
   server odpoví 500, vyprší session. Takovému člověku web oznámil, že
   o svůj inzerát přišel. To není kosmetika: je to nepravdivé tvrzení
   o cizím majetku, a u placeného zvýraznění důvod k panice.

   Měří se proto obojí a na stejné stránce:
     A) server odpovídá → prázdný účet se pozná jako prázdný
        („Zatím tu žádný inzerát nemáte", dlaždice 0);
     B) server na my_listings neodpovídá → věta o nenačtení,
        tlačítko „Zkusit znovu", a NIKDE na stránce nesmí stát,
        že žádný inzerát nemáte.

   Bez větve A by test prošel i tehdy, kdyby se prázdný stav ztratil
   úplně a profil hlásil poruchu pořád.
   ================================================================== */
import { chromium } from 'playwright-core';
import { UID_MAJITEL } from './falesna-supabase-chat.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});

/** Otevře profil přihlášeného majitele; `rozbij` shodí jen my_listings. */
async function profil(rozbij) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(([u]) => {
    const t = 'tok-' + u;
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: t, refresh_token: t.replace('tok-', 'ref-'),
      user: { id: u, email: u + '@test.cz' },
    }));
  }, [UID_MAJITEL]);
  let pokusu = 0;
  if (rozbij) {
    await page.route('**/rest/v1/rpc/my_listings*', (r) => { pokusu++; r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"nic"}' }); });
  } else {
    await page.route('**/rest/v1/rpc/my_listings*', (r) => { pokusu++; r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }); });
  }
  await page.goto(`${BASE}/muj-inzerat.html`, { waitUntil: 'load' });
  /* Tři pokusy s odstupem 600 a 1 200 ms — ať je po nich. */
  await page.waitForTimeout(4500);
  const v = await page.evaluate(() => {
    const vidno = (id) => {
      const e = document.getElementById(id);
      if (!e) return false;
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0;
    };
    const txt = (id) => { const e = document.getElementById(id); return e ? (e.textContent || '').trim() : null; };
    return {
      prazdny: vidno('mi-empty'), chyba: vidno('mi-chyba'), nacitam: vidno('mi-status'),
      znovu: vidno('mi-znovu'),
      pocet: txt('pf-count'), zhlednuti: txt('pf-views'),
      vetaOPrazdnu: /Zatím tu žádný inzerát nemáte/.test(document.body.innerText),
      panel: vidno('mi-panel'),
    };
  });
  v.pokusu = pokusu;
  await ctx.close();
  return v;
}

/* ---- A) server odpovídá: prázdný účet je prázdný ---------------- */
const a = await profil(false);
pravda('přihlášený člověk vidí profil (jinak se měří odhlášená stránka)', a.panel, 'panel profilu není vidět');
pravda(`server se na inzeráty dotázal (${a.pokusu}×)`, a.pokusu >= 1, 'žádný dotaz — test měří prázdno');
pravda('prázdný účet: „Zatím tu žádný inzerát nemáte"', a.prazdny && a.vetaOPrazdnu,
  `prázdný stav vidět ${a.prazdny}, věta ${a.vetaOPrazdnu}`);
pravda('a hlášení o poruše se neukazuje', !a.chyba, 'ukazuje se „nepovedlo načíst" i když server odpověděl');
pravda(`a dlaždice říkají 0 (${a.pocet} / ${a.zhlednuti})`, a.pocet === '0' && a.zhlednuti === '0',
  `počet „${a.pocet}", zhlédnutí „${a.zhlednuti}"`);

/* ---- B) server mlčí: nesmí tvrdit, že nic nemáte ---------------- */
const b = await profil(true);
pravda(`výpadek: zkusilo se to víc než jednou (${b.pokusu}×)`, b.pokusu >= 3,
  `jen ${b.pokusu} pokusy — opakování se ztratilo`);
pravda('výpadek: ukáže se „Inzeráty se teď nepovedlo načíst"', b.chyba, 'hlášení o poruše není vidět');
pravda('a je u něj tlačítko „Zkusit znovu"', b.znovu, 'není kudy to zopakovat');
pravda('a NIKDE nestojí, že žádný inzerát nemáte', !b.vetaOPrazdnu && !b.prazdny,
  'web po výpadku tvrdí, že inzerát neexistuje — tak se ztrácí důvěra i inzerát');
pravda(`a dlaždice nelžou nulou (${b.pocet} / ${b.zhlednuti})`,
  b.pocet !== '0' && b.zhlednuti !== '0',
  `počet „${b.pocet}", zhlédnutí „${b.zhlednuti}" — nula je tvrzení, ne neznalost`);
pravda('nezůstane viset „Načítám…"', !b.nacitam, 'stránka se zasekla na načítání');

await browser.close();
console.log('\nProfil při výpadku serveru');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Profil při výpadku: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
