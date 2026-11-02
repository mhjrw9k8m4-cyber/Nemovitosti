/* ===================================================================
   TIP NA DOBROU KOUPI = TÁŽ KARTA JAKO VE VÝPISU

   Majitel 2. 11.: „tato část webu potřebuje vizuálně dodělat, aby
   vypadala jako zbytek webu, a víc to napojit na sebe jako na úvodní
   stránce, aby to bylo celistvé."

   Tipy měly vlastní stavbu i vlastní vzhled. Naměřeno na téže stránce
   (390 px, .opp-item proti .deal-card):
     · karta ve výpisu má stín --e1, tip NEMĚL ŽÁDNÝ;
     · nadpis 16/400 proti 20/600, cena 24/700 proti 16/700;
     · karta má náhled (mapový výřez), tip neměl nic.

   PROČ TO NECHYTIL test-deska: ten měří zaoblení, rám a stín obecně
   přes všechny desky a nulový stín toleruje (uvnitř desky je v
   pořádku). Rozdíl „táž role, jiný recept" z něj poznat nejde.
   Tohle je proto párová zkouška, jako test-hlidani-jako-hledani:
   bere DVA SKUTEČNÉ prvky na jedné stránce a ptá se, jestli jsou
   z téhož receptu.
   =================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { naSeznam } from './zkouska-pohled.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { pripravenoKdyz } from './zkouska-pripraveno.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Tip jako karta', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  pravda(popis, a === b, a === b ? '' : `čekáno ${b}, vyšlo ${a}`);
}
function hotovo(spadlo) {
  console.log('\nTip na dobrou koupi jako karta ve výpisu');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Tip jako karta: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await naSeznam(p);
  await p.waitForSelector('.opp-item', { timeout: 25000 });
  await pripravenoKdyz(p, () => document.querySelectorAll('.deal-card').length > 0, null, 15000);

  const m = await p.evaluate(() => {
    const karta = document.querySelector('.opp-item');
    const tip = document.querySelector('.deal-card');
    if (!karta || !tip) return { chybi: !karta ? 'opp-item' : 'deal-card' };
    /* OTISK PLOCHY. Měří se VYKRESLENÁ hodnota, ne zápis ve stylopisu:
       dvě různá pravidla můžou vyjít stejně a stejné pravidlo se dá
       přebít. Jen to, co vidí oko, je tu rozhodující. */
    const plocha = (el) => {
      const c = getComputedStyle(el);
      return { tvar: c.borderRadius, ram: c.borderTopWidth + ' ' + c.borderTopStyle + ' ' + c.borderTopColor,
        pozadi: c.backgroundColor, stin: c.boxShadow, odsazeni: c.padding, prechod: c.transition };
    };
    const pismo = (kor, sel) => {
      const e = kor.querySelector(sel);
      if (!e) return null;
      const c = getComputedStyle(e);
      return c.fontSize + '/' + c.fontWeight + ' ' + c.fontFamily.split(',')[0] + ' ' + c.color;
    };
    const CASTI = ['.opp-media', '.opp-body', '.opp-nadpis', '.opp-druh',
      '.opp-meta', '.opp-place', '.opp-cenarad', '.opp-price'];
    const nahled = tip.querySelector('.opp-media');
    return {
      plochaKarty: plocha(karta), plochaTipu: plocha(tip),
      chybiCasti: CASTI.filter((s) => !tip.querySelector(s)),
      druhKarty: pismo(karta, '.opp-druh'), druhTipu: pismo(tip, '.opp-druh'),
      cenaKarty: pismo(karta, '.opp-price'), cenaTipu: pismo(tip, '.opp-price'),
      mistoKarty: pismo(karta, '.opp-place'), mistoTipu: pismo(tip, '.opp-place'),
      vyskaNahledu: nahled ? Math.round(nahled.getBoundingClientRect().height) : 0,
      odznaku: tip.querySelectorAll('.opp-badge').length,
      verdikt: (tip.querySelector('.deal-verdikt') || {}).textContent || '',
      preteka: Math.max(0, Math.round(document.documentElement.scrollWidth - innerWidth)),
    };
  });

  pravda('na stránce je karta ve výpisu i tip (jinak se nic neporovnává)',
    !m.chybi, m.chybi ? `nenalezeno: .${m.chybi}` : '');
  if (!m.chybi) {
    je('tip má TUTÉŽ plochu jako karta ve výpisu (tvar, rám, stín, odsazení)',
      m.plochaTipu, m.plochaKarty);
    /* Že se to neporovnává s prázdnem: deska MUSÍ mít stín, jinak by
       shoda „obojí nic" prošla a přitom by byla vadou — právě tu měl
       tip předtím. */
    pravda('a ten stín není žádný (jinak by shoda nic neznamenala)',
      m.plochaKarty.stin && m.plochaKarty.stin !== 'none', m.plochaKarty.stin);

    je('tip je složený z TÝCHŽ součástek jako karta', m.chybiCasti, []);
    je('a druh pozemku má stejné písmo', m.druhTipu, m.druhKarty);
    je('a cena taky', m.cenaTipu, m.cenaKarty);
    je('a jméno obce taky', m.mistoTipu, m.mistoKarty);

    /* Náhled je to, podle čeho se karta pozná na první pohled. Tip ho
       neměl vůbec, takže vedle výpisu vypadal jako cizí prvek. */
    pravda('tip má náhled, a ten se opravdu vykreslil',
      m.vyskaNahledu >= 100, `výška náhledu ${m.vyskaNahledu} px`);
    /* Odznak druhu přidává mapThumb() sám. Když jsem ho připsal ještě
       jednou, byl na kartě dvakrát a nikdo si toho nevšiml. */
    je('a odznak druhu právě jeden', m.odznaku, 1);

    /* To jediné, co má tip navíc — a musí říct, s čím se srovnávalo.
       Percentil se počítá nejdřív v okrese, a když tam není dost
       nabídek, v kraji; bez té věty vypadá „levnější než 98 %" jako
       srovnání v okrese vždycky. */
    pravda('tip říká, proč je to tip', /levnější než \d+/.test(m.verdikt), `stojí tam „${m.verdikt}"`);
    pravda('a s čím se to srovnávalo', /okres|kraj/i.test(m.verdikt), m.verdikt);

    je('a nic na stránce nepřetéká do stran', m.preteka, 0);
  }

  pravda('a za celou dobu nespadlo v konzoli nic',
    chybyKonzole.length === 0, chybyKonzole.join('\n      '));
  await prohlizec.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
hotovo();
