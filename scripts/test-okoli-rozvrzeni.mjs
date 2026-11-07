/* Zkouška: okno „Vyberte své okolí" se na telefonu nerozjede.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-okoli-rozvrzeni.mjs
 * Volá ji .github/workflows/testy.yml (krok „Okolí — rozvržení").
 *
 * PROČ VZNIKLA. Majitel 7. 11. poslal snímek toho okna se slovy, že
 * potřebuje výrazně vylepšit. Na snímku jsou vidět čtyři věci a všechny
 * čtyři se daly změřit (telefon 390 px, u obce Vendolí, okruh 50 km):
 *
 *   1. ČÍSLO NEPATŘILO K PILULCE. Počet nabídek stál VEDLE nápisu,
 *      ne pod ním: střed čísla o 27 až 38 px vpravo od středu své
 *      pilulky, takže „200" viselo mezi „50 km" a krajem dráhy.
 *      Vinu nesl předpis pro chytací plochy: `.vm-km{display:inline-flex}`
 *      z labelu udělal ŘÁDEK a dítě psané jako blok pod nápisem se
 *      přestěhovalo vedle něj.
 *   2. DRÁHA SE NA 320 px ZALOMILA do dvou řádků (94 px místo 50)
 *      a „50 km" skočilo pod ostatní — totéž příčina.
 *   3. ŠTÍTEK S OKRUHEM BYL MIMO MAPU. Visí na kraji kruhu, a když je
 *      kruh širší než okno, kraj je venku: naměřeno x = 710 až 764 při
 *      mapě široké 390. Zrovna tehdy je přitom číslo nejpotřebnější.
 *   4. CELÉ OKNO BYLO POSUNUTÉ. Na 320 px měl řádek s hledáním 354 px
 *      v panelu širokém 320; stisk „Moje poloha" panel o těch 34 px
 *      posunul do strany i s křížkem.
 *
 * CO SE MĚŘÍ. Všechny čtyři, na 390 i 320 px, na skutečném okně se
 * skutečnými čísly. Měří se GEOMETRIE, ne jména tříd: kdyby se to
 * rozvržení jednou postavilo jinak, zkouška musí dál říkat totéž.
 *
 * ČTE: index.html přes server zkoušek. NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { BASE } from './falesna-supabase-chat.mjs';
import { naPohled } from './zkouska-pohled.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
hlasPad('Okolí — rozvržení', zpravy, () => chyb);

await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });

/* Vendolí na Svitavsku: v okruhu 2 km je jedna nabídka a v 50 km dvě
   stovky, takže je na čem měřit i nejkratší i nejdelší okruh. */
const MISTO = { latitude: 49.7556, longitude: 16.4192 };

for (const sirka of [390, 320]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,
    viewport: { width: sirka, height: 844 }, isMobile: true, hasTouch: true,
    locale: 'cs-CZ', serviceWorkers: 'block',
    permissions: ['geolocation'], geolocation: MISTO });
  await ctx.route('**/*', (r) => {
    const h = new URL(r.request().url()).hostname;
    return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2500);
  await naPohled(p, 'mapa');
  await p.waitForTimeout(1200);
  await p.click('#map-near');
  await p.waitForTimeout(500);

  /* 4) PANEL SE NESMÍ DÁT POSUNOUT DO STRANY. Měří se před i po stisku
     „Moje poloha": sám přesah stačí, aby prohlížeč panel posunul ve
     chvíli, kdy se zaměření přesune na tlačítko u pravého kraje. */
  const presah = await p.evaluate(() => {
    const pan = document.querySelector('.vm-panel');
    return { client: pan.clientWidth, scroll: pan.scrollWidth, posun: pan.scrollLeft };
  });
  pravda(`${sirka} px: panel není širší než okno (${presah.scroll} ≤ ${presah.client})`,
    presah.scroll <= presah.client + 1, JSON.stringify(presah));

  await p.click('#vm-gps').catch(() => {});
  await p.waitForTimeout(2500);
  const poGps = await p.evaluate(() => document.querySelector('.vm-panel').scrollLeft);
  pravda(`${sirka} px: a „Moje poloha" s ním neposune (posun ${poGps} px)`, poGps === 0,
    'panel je odsunutý o ' + poGps + ' px, i s křížkem u pravého kraje');

  await p.locator('.vm-km input[value="50"]').click({ force: true });
  await p.waitForTimeout(1800);

  const m = await p.evaluate(() => {
    const R = (e) => { const b = e.getBoundingClientRect();
      return { l: b.left, r: b.right, t: b.top, b: b.bottom, w: b.width, h: b.height }; };
    const dl = [].slice.call(document.querySelectorAll('.vm-km')).map((el) => {
      const sp = R(el.querySelector('span')), nb = R(el.querySelector('b'));
      return { km: (el.querySelector('span').textContent || '').trim(),
        cislo: (el.querySelector('b').textContent || '').trim(),
        odchylka: Math.abs((nb.l + nb.r) / 2 - (sp.l + sp.r) / 2),
        podNapisem: nb.t >= sp.b - 2, radek: Math.round(sp.t) };
    });
    const st = document.querySelector('.vm-meritko span');
    return { mapa: R(document.querySelector('.vm-mapa')),
      draha: R(document.querySelector('.vm-okruh')),
      pata: R(document.querySelector('.vm-pata')),
      stitek: st ? R(st) : null, stitekText: st ? st.textContent.trim() : '',
      stitekVidet: st ? getComputedStyle(st.parentElement).visibility !== 'hidden' : false,
      dl };
  });

  /* 1) ČÍSLO PATŘÍ POD SVOU PILULKU. Dvě tvrzení, obě nutná: musí být
     POD (ne vedle) a musí být VYSTŘEDĚNÉ na ni (jinak by prošlo i číslo
     schované pod sousedkou). Mez 2 px je zaokrouhlení, ne tolerance. */
  const vedle = m.dl.filter((d) => !d.podNapisem);
  pravda(`${sirka} px: počet stojí POD svou pilulkou u všech pěti okruhů`,
    vedle.length === 0, vedle.map((d) => d.km + ' → ' + d.cislo).join(', '));
  const mimo = m.dl.filter((d) => d.odchylka > 2);
  pravda(`${sirka} px: a je na ni vystředěný (největší odchylka ${
    Math.max(0, ...m.dl.map((d) => Math.round(d.odchylka)))} px)`,
    mimo.length === 0,
    mimo.map((d) => d.km + ': o ' + Math.round(d.odchylka) + ' px vedle').join(', '));

  /* 2) JEDNA ŘÁDKA. Zalomená dráha není segmentovaný ovladač. */
  const radky = new Set(m.dl.map((d) => d.radek));
  pravda(`${sirka} px: všech pět okruhů je na jedné řádce`, radky.size === 1,
    'řádků: ' + radky.size + ' (' + [...radky].join(', ') + ')');

  /* 2b) A DRÁHA ZABÍRÁ CELOU ŠÍŘKU PATIČKY. Smrsklá na šířku svých
     pilulek sedí nalevo s dírou vedle sebe a nevypadá jako ovladač,
     kterým se dá táhnout. Mez je šířka patičky bez jejích okrajů
     (16 px z každé strany) s rezervou dvou pixelů na zaokrouhlení. */
  const siroka = m.draha.w >= m.pata.w - 32 - 2;
  pravda(`${sirka} px: dráha okruhu zabírá celou šířku patičky (${
    Math.round(m.draha.w)} z ${Math.round(m.pata.w - 32)})`,
    siroka, `dráha ${Math.round(m.draha.w)} px, patička ${Math.round(m.pata.w)} px`);

  /* 3) ŠTÍTEK S OKRUHEM ZŮSTANE V MAPĚ. */
  pravda(`${sirka} px: štítek s okruhem je vidět a nese číslo („${m.stitekText}")`,
    m.stitekVidet && /\d/.test(m.stitekText), 'štítek: ' + JSON.stringify(m.stitek));
  const uvnitr = m.stitek && m.stitek.l >= m.mapa.l - 1 && m.stitek.r <= m.mapa.r + 1;
  pravda(`${sirka} px: a celý leží uvnitř mapy`, !!uvnitr,
    m.stitek ? `štítek ${Math.round(m.stitek.l)}–${Math.round(m.stitek.r)}, `
      + `mapa ${Math.round(m.mapa.l)}–${Math.round(m.mapa.r)}` : 'štítek v DOMu není');

  await ctx.close();
}

await prohlizec.close();
console.log('\nOkolí — rozvržení');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Okolí — rozvržení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
