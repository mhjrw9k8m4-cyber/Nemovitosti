/* Test: vyhledávač cen říká totéž, co stránka okresu.
   ==================================================================
   Spuštění: node scripts/test-ceny-hledani.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   CO TO NAHRADILO. Stránka „Kolik stojí pozemek?" ukazovala ceny po
   okresech třikrát: seznam 14 krajů, barevná mapa okresů a seznam
   36 okresů — padesát řádků, ze kterých každého zajímá jeden. Místo
   nich je vyhledávač: napíšu obec a dostanu číslo. Zkouška, která
   hlídala shodu mapy a seznamu, šla s nimi.

   ZŮSTALO TO PODSTATNÉ, CO HLÍDALA: tentýž údaj na dvou místech webu
   se dřív nebo později rozejde. Dřív to byla mapa proti seznamu, teď
   je to vyhledávač proti stránce okresu — a na tomhle webu se to už
   jednou stalo (viz js/ceny.js), kdy 310 stránek tvrdilo o ceně něco
   jiného než mapa. Porovnává se proto cena, kterou vypíše vyhledávač,
   s cenou na vlastní stránce toho okresu. Čte se to z vykreslených
   stránek, ne z generátoru: měří se, co uvidí člověk.

   A DRUHÁ VĚC, SPECIFICKÁ PRO VYHLEDÁVÁNÍ: v nabídce je kolem tisícovky
   obcí ze šesti a půl tisíce, takže „tohle neznáme" je nejčastější
   odpověď. Když se na ni neukáže nic, člověk neví, jestli špatně píše,
   nebo jestli je web rozbitý.
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nVyhledávač cen podle lokality');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Vyhledávač cen: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}
/* Čísla na webu mají nezlomitelnou mezeru po tisících. */
const cislo = (s) => parseInt(String(s).replace(/[^\d]/g, ''), 10);

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const chybyKonzole = [];
  p.on('pageerror', (e) => chybyKonzole.push(String(e)));
  await p.goto(`${BASE}/cena-pozemku.html`, { waitUntil: 'load' });
  await p.waitForSelector('#cenh-vstup', { timeout: 15000 });
  await p.waitForTimeout(800);

  /* --- 1) dlouhé seznamy a mapa jsou pryč ------------------------- */
  const zbytky = await p.evaluate(() => ({
    polozek: document.querySelectorAll('.okr-list .okr-item').length,
    mapa: !!document.getElementById('cen-mapa'),
    lupa: !!document.querySelector('.cenh-lupa'),
    vyska: Math.round(document.body.scrollHeight),
  }));
  pravda('seznamy krajů a okresů na stránce nejsou', zbytky.polozek === 0,
    `zbylo ${zbytky.polozek} řádků`);
  pravda('a cenová mapa taky ne', !zbytky.mapa, 'na stránce je pořád #cen-mapa');
  pravda('zato je tam lupa', zbytky.lupa, 'ikona lupy chybí');

  /* --- 2) rejstřík se stáhne až při psaní ------------------------- */
  /* 41 kB obcí nemá nést ten, kdo si stránku jen proletí. */
  const stazeno = [];
  p.on('request', (r) => { if (/ceny-mist\.json/.test(r.url())) stazeno.push(r.url()); });
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1800);
  pravda('rejstřík obcí se při pouhém otevření stránky nestahuje', stazeno.length === 0,
    `stáhlo se ${stazeno.length}×`);
  await p.click('#cenh-vstup');
  await p.waitForTimeout(1200);
  pravda('a stáhne se, až když se do pole klepne', stazeno.length > 0,
    'po zaměření pole se rejstřík nestáhl');

  /* --- 3) OKRES: číslo musí sedět s jeho vlastní stránkou --------- */
  const rejstrik = JSON.parse(readFileSync(new URL('../data/ceny-mist.json', import.meta.url), 'utf8'));
  const sCenou = rejstrik.ok.filter((o) => o.p['Zemědělská půda']);
  pravda('je co porovnávat — okresy s cenou zemědělské půdy', sCenou.length >= 10,
    `okresů s cenou: ${sCenou.length}`);

  let porovnano = 0;
  const rozdily = [];
  for (const okres of sCenou.slice(0, 5)) {
    await p.fill('#cenh-vstup', '');
    await p.fill('#cenh-vstup', okres.n);
    await p.waitForTimeout(700);
    /* Vybrat se musí OKRES, ne stejnojmenná obec. */
    const vybral = await p.evaluate(() => {
      const li = [...document.querySelectorAll('.cenh-navrh')]
        .find((e) => (e.querySelector('.cenh-n-kde') || {}).textContent === 'okres');
      if (!li) return false;
      li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      return true;
    });
    if (!vybral) { rozdily.push(`${okres.n}: v návrzích není jako okres`); continue; }
    await p.waitForTimeout(400);
    const zHledani = await p.evaluate(() => {
      const r = [...document.querySelectorAll('.cenh-radek')]
        .find((e) => /Zemědělská/.test((e.querySelector('.cenh-druh') || {}).textContent || ''));
      return r ? (r.querySelector('.cenh-cena') || {}).textContent : null;
    });
    /* A totéž z vlastní stránky okresu — druhý zdroj, který se s tím
       prvním nesmí rozejít. */
    const html = readFileSync(new URL('../' + okres.h, import.meta.url), 'utf8');
    const m = /Medián ceny \(zemědělská půda\): <b>([^<]*)<\/b>/.exec(html);
    porovnano++;
    if (!m) { rozdily.push(`${okres.n}: na vlastní stránce medián není`); continue; }
    if (cislo(zHledani) !== cislo(m[1])) {
      rozdily.push(`${okres.n}: vyhledávač ${zHledani}, stránka okresu ${m[1]}`);
    }
  }
  pravda(`porovnalo se dost okresů (${porovnano})`, porovnano >= 5, `porovnáno ${porovnano}`);
  pravda('vyhledávač hlásí tutéž cenu jako vlastní stránka okresu',
    rozdily.length === 0, rozdily.join('; '));

  /* --- 4) OBEC: číslo je okresní a je to napsané ------------------ */
  const obec = rejstrik.ob.find(([, okr]) => sCenou.some((o) => o.n === okr));
  pravda('je na čem zkoušet obec', !!obec, 'žádná obec v okrese s cenou');
  if (obec) {
    await p.fill('#cenh-vstup', '');
    await p.fill('#cenh-vstup', obec[0]);
    await p.waitForTimeout(700);
    await p.evaluate(() => {
      const li = document.querySelector('.cenh-navrh');
      if (li) li.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });
    await p.waitForTimeout(400);
    const text = await p.evaluate(() => (document.getElementById('cenh-vysledek') || {}).innerText || '');
    /* TOHLE JE TA NEJDŮLEŽITĚJŠÍ VĚTA NA CELÉ STRÁNCE. Bez ní člověk
       čte medián okresu jako cenu ve své vesnici — a podle toho se
       rozhoduje o statisících. Změřeno: z 1 046 obcí v nabídce by na
       vlastní medián jednoho druhu mělo dost dat devět. */
    pravda('u obce je napsané, že ceny jsou za celý okres',
      /za celý okres/i.test(text), text.replace(/\s+/g, ' ').slice(0, 140));
    pravda('a je u ní vidět, kolik nabídek má ta obec sama',
      /v nabídce/i.test(text), text.replace(/\s+/g, ' ').slice(0, 140));
  }

  /* --- 5) neznámá lokalita nesmí mlčet --------------------------- */
  await p.fill('#cenh-vstup', '');
  await p.fill('#cenh-vstup', 'Nesmyslno');
  await p.waitForTimeout(900);
  const prazdno = await p.evaluate(() => ({
    navrhu: document.querySelectorAll('.cenh-navrh').length,
    text: (document.getElementById('cenh-vysledek') || {}).innerText || '',
  }));
  pravda('neznámá obec nevrátí ticho, ale větu',
    prazdno.navrhu === 0 && /nemáme v nabídce/i.test(prazdno.text),
    `návrhů ${prazdno.navrhu}, text „${prazdno.text.replace(/\s+/g, ' ').slice(0, 120)}"`);

  /* --- 6) píše se bez háčků -------------------------------------- */
  await p.fill('#cenh-vstup', '');
  await p.fill('#cenh-vstup', 'benes');
  await p.waitForTimeout(900);
  const bezHacku = await p.evaluate(() => [...document.querySelectorAll('.cenh-navrh')]
    .map((e) => (e.querySelector('.cenh-n-nazev') || {}).textContent));
  pravda('„benes" najde Benešov (háčky na telefonu nikdo nepíše)',
    bezHacku.some((x) => /Benešov/.test(x)), bezHacku.join(', ') || '(nic)');

  /* --- 7) klávesnice --------------------------------------------- */
  await p.fill('#cenh-vstup', '');
  await p.fill('#cenh-vstup', 'kolin');
  await p.waitForTimeout(900);
  await p.press('#cenh-vstup', 'ArrowDown');
  await p.press('#cenh-vstup', 'Enter');
  await p.waitForTimeout(500);
  pravda('vybrat se dá i klávesnicí, nejen myší',
    await p.evaluate(() => !!document.querySelector('.cenh-karta')),
    'po šipce a Enteru se nic nevypsalo');

  pravda('a za celou dobu nespadlo v konzoli nic', chybyKonzole.length === 0,
    chybyKonzole.join('\n      '));

  /* --- 8) klávesnice a překlep ------------------------------------
   *
   * Dvě vady, které nahlásil člověk z iPhonu u hledání na mapě — a tenhle
   * vyhledávač měl obojí stejně:
   *
   *   a) Seznam návrhů se schoval pod klávesnici. V CSS měl pevných 320 px
   *      a to o vyjeté klávesnici neví. U CEN JE TO HORŠÍ NEŽ NA MAPĚ: pole
   *      leží v polovině stránky, takže po vyjetí klávesnice pod ním místo
   *      není žádné — naměřeno: pole končilo na y 497, vidět bylo po y 463.
   *      Správná odpověď tedy není seznam uříznout, ale otevřít ho NAHORU.
   *   b) Jedno písmeno vedle a vyhledávání zmlčklo: návrhy se zavřely a
   *      zůstala jen věta „nemáme v nabídce". Teď se zkusí oprava a
   *      vypíšou se rovnou názvy k ní.
   *
   * BEZHLAVÝ PROHLÍŽEČ ŽÁDNOU KLÁVESNICI NEVYSUNE, takže visualViewport se
   * podstrčí: falešný objekt se stejným rozhraním, jehož výšku řídí
   * zkouška. Doplňuje se i to, co prohlížeč dělá sám: odroluje stránku,
   * aby zaostřené pole zůstalo vidět. Co se tím NEDOKAZUJE: že prohlížeč na
   * telefonu visualViewport opravdu zmenší (vlastnost platformy). Co se
   * dokazuje: že se web podle naměřené volné výšky zařídí.
   */
  const k = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  await k.addInitScript(() => {
    const et = new EventTarget();
    const vv = {
      get width() { return 390; },
      get height() { return window.__vvH === undefined ? window.innerHeight : window.__vvH; },
      get offsetTop() { return window.__vvT || 0; },
      get offsetLeft() { return 0; },
      get pageTop() { return 0; }, get pageLeft() { return 0; }, get scale() { return 1; },
      addEventListener: et.addEventListener.bind(et),
      removeEventListener: et.removeEventListener.bind(et),
      dispatchEvent: et.dispatchEvent.bind(et),
    };
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.__klavesnice = (h, t) => {
      window.__vvH = h; window.__vvT = t || 0;
      vv.dispatchEvent(new Event('resize'));
    };
  });
  const q = await k.newPage();
  await q.goto(`${BASE}/cena-pozemku.html`, { waitUntil: 'load' });
  await q.waitForSelector('#cenh-vstup', { timeout: 15000 });
  await q.waitForTimeout(900);
  pravda('falešný visualViewport se do stránky dostal',
    await q.evaluate(() => typeof window.__klavesnice === 'function'),
    'bez něj by celá sekce neměřila nic');

  const napis = async (text, volno) => {
    await q.click('#cenh-vstup');
    await q.fill('#cenh-vstup', '');
    await q.evaluate((h) => window.__klavesnice(h, 0), volno);
    /* Co dělá skutečný prohlížeč: odroluje stránku tak, aby zaostřené
       pole zůstalo vidět. Bez toho by pole zůstalo pod klávesnicí a
       měřil by se stav, který na telefonu nenastane. */
    await q.evaluate(() => {
      const r = document.getElementById('cenh-vstup').getBoundingClientRect();
      const dno = window.visualViewport.offsetTop + window.visualViewport.height;
      if (r.bottom > dno - 8) window.scrollBy(0, Math.ceil(r.bottom - dno + 8));
      window.visualViewport.dispatchEvent(new Event('resize'));
    });
    await q.fill('#cenh-vstup', text);
    await q.waitForTimeout(700);
    return q.evaluate(() => {
      const n = document.getElementById('cenh-navrhy');
      const h = document.querySelector('.cenh-hlaska');
      const vst = document.getElementById('cenh-vstup').getBoundingClientRect();
      const nb = n.getBoundingClientRect();
      const dno = window.visualViewport.offsetTop + window.visualViewport.height;
      const li = [...n.querySelectorAll('.cenh-navrh')];
      return { skryty: n.hidden, polozek: li.length, maxh: n.style.maxHeight,
        top: Math.round(nb.top), bottom: Math.round(nb.bottom), dno: Math.round(dno),
        poleDno: Math.round(vst.bottom), poleTop: Math.round(vst.top),
        presah: Math.round(Math.max(0, nb.bottom - dno)),
        nadHlavou: Math.round(Math.max(0, window.visualViewport.offsetTop - nb.top)),
        hlaska: h && !h.hidden ? h.textContent.trim() : null,
        hlaskaY: h && !h.hidden
          ? [Math.round(h.getBoundingClientRect().top), Math.round(h.getBoundingClientRect().bottom)] : null,
        jmena: li.map((x) => (x.querySelector('.cenh-n-nazev') || {}).textContent) };
    });
  };

  const siroko = await napis('bene', 844);
  pravda(`našeptávač nabízí dost řádků, aby bylo na čem měřit (${siroko.polozek})`,
    siroko.polozek >= 2, 'při jednom řádku by kontroly níž procházely naprázdno');
  pravda('bez klávesnice se seznam otevírá pod polem, jako dřív',
    siroko.top >= siroko.poleDno,
    `seznam začíná na y ${siroko.top}, pole končí na y ${siroko.poleDno}`);

  for (const volno of [463, 420, 380]) {
    const r = await napis('bene', volno);
    pravda(`při volné výšce ${volno} px je celý seznam vidět`,
      r.presah === 0 && r.nadHlavou === 0,
      `seznam y ${r.top}–${r.bottom}, vidět je po ${r.dno}`);
    /* PŘEKLOPENÍ NAHORU. Pod polem už místo není — kdyby se seznam nechal
       dole, musel by se uříznout na dva řádky, nebo přelézt. */
    pravda(`a otevřel se nahoru, ne pod pole (${volno} px)`, r.bottom <= r.poleTop,
      `seznam končí na y ${r.bottom}, pole začíná na y ${r.poleTop}`);
  }

  /* Překlep: návrhy zůstanou a je vidět, že se hledalo něco jiného. */
  const op = await napis('Benesou', 463);
  pravda('překlep „Benesou" vyhledávání nezavře',
    !op.skryty && op.polozek > 0,
    `skrytý: ${op.skryty}, položek: ${op.polozek}`);
  pravda('a nad polem stojí „Mysleli jste…"',
    !!op.hlaska && /Mysleli jste/i.test(op.hlaska || ''), String(op.hlaska));
  pravda('oprava jmenuje Benešov', !!op.hlaska && /Benešov/.test(op.hlaska || ''),
    String(op.hlaska));
  pravda('a v hlášce stojí to, co člověk napsal (ne počítačová podoba)',
    !!op.hlaska && op.hlaska.indexOf('Benesou') >= 0, String(op.hlaska));
  pravda('nabídnuté názvy už patří k opravenému slovu',
    op.jmena.some((j) => /Benešov/.test(j || '')), op.jmena.join(' | '));
  pravda('hláška seznam nepřekrývá ani ho neodstrkává pod klávesnici',
    op.hlaskaY !== null && op.hlaskaY[0] >= op.bottom && op.presah === 0 && op.nadHlavou === 0,
    `seznam y ${op.top}–${op.bottom}, hláška y ${op.hlaskaY && op.hlaskaY.join('–')}, vidět po ${op.dno}`);
  pravda('v seznamu nejsou jiné prvky než nabízené položky — šipky by jely na posunuté indexy',
    await q.evaluate(() => {
      const n = document.getElementById('cenh-navrhy');
      return n.children.length === n.querySelectorAll('.cenh-navrh').length;
    }), 'v <ul> přibyl prvek, který není nabídkou');
  await q.keyboard.press('ArrowDown');
  await q.keyboard.press('Enter');
  await q.waitForTimeout(500);
  pravda('šipka a Enter vybere první z opravených návrhů',
    (await q.inputValue('#cenh-vstup')) === op.jmena[0],
    `první návrh „${op.jmena[0]}", v poli „${await q.inputValue('#cenh-vstup')}"`);
  await k.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
