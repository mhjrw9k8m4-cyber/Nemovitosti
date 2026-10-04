/* Test: odhlášení z e-mailů a přepínač posílání u hlídání.
   ------------------------------------------------------------------
   Spuštění: node scripts/test-odhlaseni.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   Odhlašovací odkaz v e-mailu je ta část, která MUSÍ fungovat napoprvé
   a bez přihlášení. Kdo ho klikne a nic se nestane, neklikne podruhé —
   označí poštu jako spam, a to poškodí doručování všem ostatním.

   Kontroluje se i to, co se nemá stát: že se web o e-mailech vůbec
   nezmíní, dokud rozesílač neběží. Přepínač „Posílat e-mailem" se smí
   vykreslit jen při window.PK_MAIL_ZAPNUTO === true (js/config.js).
   Slíbit poštu, která nepřijde, je horší než ji neslibovat.

   MĚŘÍ SE VYKRESLENÁ STRÁNKA, ne zdroj: text hlásí stránka sama po
   odpovědi serveru, takže zdrojová kontrola by o výsledku neřekla nic. */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nOdhlášení z e-mailů');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Odhlášení: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  /* js/config.js míří na ostrou Supabase — podstrčí se falešná, tak jako
     v ostatních zkouškách v prohlížeči. Zároveň se tím řídí vlajka
     PK_MAIL_ZAPNUTO: podstrčený config je jediné místo, kde ta hodnota
     vzniká, takže se nemusí nic přepisovat za běhu.
     Že je ve SKUTEČNÉM js/config.js false, drží scripts/test-rozesilac.mjs
     — tady by se to měřit nedalo, protože se ten soubor nahrazuje. */
  async function kontext(mailZapnuto, token) {
    const ctx = await prohlizec.newContext();
    await ctx.route('**/js/config.js*', (r) => r.fulfill({
      status: 200, contentType: 'text/javascript',
      body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';`
        + `window.PK_MAIL_ZAPNUTO=${mailZapnuto ? 'true' : 'false'};`,
    }));
    if (token) {
      await ctx.addInitScript(([u, t]) => {
        localStorage.setItem('pk_auth', JSON.stringify({ access_token: t,
          refresh_token: t.replace('tok-', 'ref-'), user: { id: u, email: 'majitel@test.cz' } }));
      }, ['11111111-1111-4111-8111-111111111111', token]);
    }
    return ctx;
  }

  const ctx = await kontext(false, null);

  /* Kolik požadavků na odhlášení odešlo. Bez téhle evidence by se
     „stránka nic neposlala" dalo tvrdit jen podle textu na obrazovce. */
  let odeslano = [];
  await ctx.route('**/rest/v1/rpc/unsubscribe_mail', async (route) => {
    odeslano.push(JSON.parse(route.request().postData() || '{}'));
    await route.fallback();
  });

  async function otevri(dotaz) {
    odeslano = [];
    const p = await ctx.newPage();
    await p.goto(BASE + '/odhlasit-maily.html' + dotaz, { waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => {
      const el = document.getElementById('om-stav');
      return el && !/^Odhlašuji/.test(el.textContent.trim());
    }, { timeout: 8000 }).catch(() => {});
    const stav = await p.$eval('#om-stav', (el) => ({ text: el.textContent.trim(), trida: el.className }));
    return { p, stav };
  }

  /* 1) Odkaz bez tokenu. Nic se neodesílá a stránka to řekne. */
  {
    const { p, stav } = await otevri('');
    pravda('bez tokenu se nic neodesílá', odeslano.length === 0, `odesláno ${odeslano.length}`);
    pravda('a stránka netvrdí, že je hotovo',
      !/Hotovo/i.test(stav.text) && /chybí/i.test(stav.text), stav.text);
    pravda('a je to označené jako chyba', /om-chyba/.test(stav.trida), stav.trida);
    await p.close();
  }

  /* 2) Platný token: odhlásí a potvrdí. */
  {
    const { p, stav } = await otevri('?t=TOKEN-OK');
    pravda('s platným tokenem se odhlášení odešle', odeslano.length === 1, `odesláno ${odeslano.length}`);
    pravda('a odešle se právě ten token z odkazu',
      odeslano[0] && odeslano[0].p_token === 'TOKEN-OK', JSON.stringify(odeslano[0] || {}));
    pravda('a stránka potvrdí, že pošta už chodit nebude',
      /Hotovo/i.test(stav.text) && /posílat nebudeme/i.test(stav.text), stav.text);
    pravda('a je to označené jako hotové', /om-hotovo/.test(stav.trida), stav.trida);
    await p.close();
  }

  /* 3) Token, který nikam nepatří: neslíbí se nic, co se nestalo. */
  {
    const { p, stav } = await otevri('?t=NEPLATNY');
    pravda('neplatný token se pozná', /už neplatí/i.test(stav.text), stav.text);
    pravda('a nezamlčí se to za „Hotovo"', !/^Hotovo/i.test(stav.text), stav.text);
    await p.close();
  }

  /* 4) Chyba serveru: stránka NESMÍ tvrdit, že je odhlášeno. Tohle je
        ta nejtišší možná vada — člověk odejde s pocitem, že má pokoj,
        a pošta mu chodí dál. */
  {
    const { p, stav } = await otevri('?t=TOKEN-CHYBA');
    pravda('při chybě serveru se netvrdí, že je odhlášeno',
      !/Hotovo/i.test(stav.text) && !/už neplatí/i.test(stav.text), stav.text);
    pravda('a nabídne se druhá cesta (stránka Hlídání)', /Hlídání/.test(stav.text), stav.text);
    await p.close();
  }

  /* 5) Token se posílá jako hodnota, ne jako část adresy: v odkazu se
        může objevit cokoli a stránka to nesmí poskládat do cesty. */
  {
    const { p, stav } = await otevri('?t=' + encodeURIComponent('a/b?c=d&e'));
    pravda('token se zvláštními znaky se pošle celý a neporuší volání',
      odeslano.length === 1 && odeslano[0].p_token === 'a/b?c=d&e',
      JSON.stringify(odeslano[0] || {}));
    pravda('a odpověď se zpracuje jako neplatný token', /už neplatí/i.test(stav.text), stav.text);
    await p.close();
  }

  /* 6) WEB O E-MAILECH MLČÍ, dokud rozesílač neběží. */
  async function hlidaniSPrihlasenim(zapnuto) {
    const c = await kontext(zapnuto, 'tok-majitel');
    const p = await c.newPage();
    await p.goto(BASE + '/hlidani.html', { waitUntil: 'domcontentloaded' });
    await p.waitForSelector('.hl-item, .hl-empty, #hl-prihlaseni, .hl-card', { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(600);
    const pocet = await p.$$eval('[data-mail]', (e) => e.length);
    const polozek = await p.$$eval('.hl-item', (e) => e.length);
    return { p, pocet, polozek };
  }
  {
    const vyp = await hlidaniSPrihlasenim(false);
    pravda(`s vypnutým rozesíláním není přepínač nikde (${vyp.polozek} uložených hledání)`,
      vyp.pocet === 0, `přepínačů ${vyp.pocet}`);
    await vyp.p.close();

    const zap = await hlidaniSPrihlasenim(true);
    /* Bez téhle druhé poloviny by kontrola výš procházela i tehdy, kdyby
       se přepínač nevykreslil NIKDY — třeba kvůli chybě v šabloně. */
    pravda('se zapnutým rozesíláním přepínač u hledání je (jinak zkouška nic neměří)',
      zap.polozek > 0 && zap.pocet === zap.polozek,
      `hledání ${zap.polozek}, přepínačů ${zap.pocet}`);
    if (zap.pocet) {
      const popis = await zap.p.$eval('.hl-mail', (el) => el.textContent.trim());
      pravda('a je u něj napsané, co to udělá', /e-mailem/i.test(popis), popis);
      const pozn = await zap.p.$eval('.hl-mail-pozn', (el) => el.textContent.trim());
      pravda('a při vypnutém posílání se neslibuje pošta',
        /Bez zapnutí nic neposíláme/.test(pozn), pozn);
    }
    await zap.p.close();
  }

  /* 7) Kliknutí přepínač opravdu uloží — a vypnutí taky. */
  {
    const zap = await hlidaniSPrihlasenim(true);
    if (!zap.pocet) { pravda('je co přepnout', false, 'žádný přepínač na stránce'); }
    else {
      const volani = [];
      await zap.p.route('**/rest/v1/rpc/set_search_mail', async (route) => {
        volani.push(JSON.parse(route.request().postData() || '{}'));
        await route.fallback();
      });
      await zap.p.click('[data-mail]');
      await zap.p.waitForTimeout(900);
      pravda('zaškrtnutí se uloží do databáze',
        volani.length === 1 && volani[0].p_mailem === true, JSON.stringify(volani));
      const pozdeji = await zap.p.$eval('[data-mail]', (el) => el.checked);
      pravda('a po překreslení zůstane zaškrtnuté', pozdeji === true, 'zaškrtnutí se nevrátilo');
      await zap.p.click('[data-mail]');
      await zap.p.waitForTimeout(900);
      pravda('a vypnout se dá zpátky',
        volani.length === 2 && volani[1].p_mailem === false, JSON.stringify(volani));
    }
    await zap.p.close();
  }
} finally {
  await prohlizec.close();
}
hotovo();
