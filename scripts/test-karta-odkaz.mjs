/* Zkouška: dostane se kupující z karty na pozemek — i ten, kdo nevidí?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-karta-odkaz.mjs
 * Volá ji .github/workflows/testy.yml ve směně zkoušek v prohlížeči
 * (krok „Karta ve výpisu: skutečný odkaz a cena v jeho jméně").
 *
 * CO SE TU HLÍDÁ A PROČ TO VZNIKLO. Karta ve výpisu byla do 6. 11. 2026
 * `<li role="button" tabindex="0" aria-label="Dražba · Hradec Králové ·
 * 2 481 m²">` a neměla uvnitř jediný `<a href>`. Změřeno v prohlížeči
 * přes strom přístupnosti (CDP Accessibility.getPartialAXTree):
 *
 *  · PŘÍSTUPNÉ JMÉNO KARTY NEOBSAHOVALO CENU. U role="button" je jméno
 *    jediné, co odečítač o ovladači řekne — „59 000 Kč" a „24 Kč/m²"
 *    uvnitř karty tedy nevidomý nedostal vůbec. Cena je přitom to,
 *    podle čeho se na výpisu nabídek rozhoduje.
 *  · UVNITŘ BYLA DVĚ SKUTEČNÁ TLAČÍTKA („Uložit", „Skrýt"). ARIA říká,
 *    že potomci role="button" jsou ozdobní, takže se k nim odečítač
 *    nemá jak dostat. (Chromium je ve svém stromu ukazuje — proto se
 *    na to nepřišlo dřív; NVDA ani VoiceOver se tím neřídí. Tahle
 *    zkouška proto neměří, co Chromium NAKRESLÍ, ale že tlačítka
 *    NEJSOU potomky žádného role="button".)
 *  · POZEMEK NEŠEL OTEVŘÍT NA NOVÉ KARTĚ. Bez <a href> neudělá Ctrl
 *    s klepnutím nic. Na výpisu, kde si lidé otvírají pět nabídek
 *    do pěti karet, je to drahé.
 *
 * ZKOUŠÍ SE CHOVÁNÍ, NE ZNĚNÍ ATRIBUTU. Cena se čte ze STROMU
 * PŘÍSTUPNOSTI (co opravdu dostane odečítač) a porovnává se s cenou
 * VYKRESLENOU na kartě. Kdyby se četl `aria-label` a srovnával
 * s týmž výrazem, který ho vyrobil, prošla by zkouška i tehdy, kdyby
 * se do jména psala cena cizí nabídky.
 *
 * ČTE: index.html s daty z falešné databáze (scripts/falesna-supabase-chat.mjs),
 * tedy data/opportunities.json přes běžný server zkoušek. NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Karta ve výpisu: odkaz', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
/* Ven se nechodí: dlaždice map ani písma nejsou k ničemu a čekání na ně
   by zkoušku prodloužilo o vteřiny na každé stránce. */
await ctx.route('**/*', (r) => {
  const h = new URL(r.request().url()).hostname;
  return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
});

async function vypis() {
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  /* Čeká se na KARTU, ne na pevný čas: výpis se skládá až po stažení
     dat a pevné čekání je přesně to, co v CI náhodně padá (docs §319). */
  await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 20000 });
  await p.waitForTimeout(400);
  return p;
}

/* ---- 1. KARTA UŽ NENÍ PLOCHÝ OVLADAČ ---------------------------------- */
{
  const p = await vypis();
  const pocet = await p.locator('.opp-item').count();
  /* Pojistka proti tiché nule: kdyby se výpis nevykreslil, prošlo by
     všechno níž na prázdnu. */
  pravda(`výpis vykreslil karty (${pocet})`, pocet >= 5, `karet: ${pocet}`);

  const stav = await p.evaluate(() => {
    const karty = [...document.querySelectorAll('.opp-item')];
    return {
      sRoli: karty.filter((li) => li.getAttribute('role')).length,
      sTabindexem: karty.filter((li) => li.hasAttribute('tabindex')).length,
      bezOdkazu: karty.filter((li) => !li.querySelector('a.opp-odkaz')).length,
      viceOdkazu: karty.filter((li) => li.querySelectorAll('a.opp-odkaz').length > 1).length,
      /* Tlačítka uvnitř karty nesmí ležet v ŽÁDNÉM role=button —
         ani v samotném <button>, ani v prvku s tou rolí. */
      tlacitkaVTlacitku: karty.reduce((n, li) => n + [...li.querySelectorAll('button')]
        .filter((b) => b.parentElement && b.parentElement.closest('button, [role="button"]')).length, 0),
      spatnyCil: karty.filter((li) => {
        const a = li.querySelector('a.opp-odkaz');
        return !a || !/(^|\/)pozemek\.html\?p=/.test(a.getAttribute('href') || '');
      }).length,
    };
  });
  pravda('žádná karta se nevydává za tlačítko (role)', stav.sRoli === 0, `s rolí: ${stav.sRoli} z ${pocet}`);
  pravda('žádná karta si nebere tabulátor sama na sebe', stav.sTabindexem === 0, `s tabindexem: ${stav.sTabindexem} z ${pocet}`);
  pravda('každá karta má právě jeden odkaz na pozemek', stav.bezOdkazu === 0 && stav.viceOdkazu === 0,
    `bez odkazu: ${stav.bezOdkazu}, s více než jedním: ${stav.viceOdkazu}`);
  pravda('odkaz míří na obecnou stránku pozemku (ne na vygenerovaný soubor)', stav.spatnyCil === 0,
    `jinam míří: ${stav.spatnyCil} z ${pocet}`);
  pravda('uvnitř karty není tlačítko vnořené v jiném tlačítku', stav.tlacitkaVTlacitku === 0,
    `vnořených: ${stav.tlacitkaVTlacitku}`);

  /* ---- 2. CENA VE JMÉNĚ ODKAZU, ČTENÁ ZE STROMU PŘÍSTUPNOSTI -------- */
  const cdp = await ctx.newCDPSession(p);
  await cdp.send('DOM.enable');
  await cdp.send('Accessibility.enable');
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });

  let bezCeny = 0, bezMista = 0, zmerenych = 0, prvniJmeno = '';
  for (let i = 1; i <= 5; i++) {
    const sel = `#opp-list .opp-item:nth-of-type(${i})`;
    const vykreslene = await p.evaluate((s) => {
      const li = document.querySelector(s);
      if (!li) return null;
      const cena = li.querySelector('.opp-price');
      const misto = li.querySelector('.opp-place');
      return {
        cena: cena ? cena.textContent.replace(/\s+/g, ' ').trim() : '',
        misto: misto ? misto.textContent.replace(/\s+/g, ' ').trim() : '',
      };
    }, sel);
    if (!vykreslene || !vykreslene.cena) continue;
    const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: sel + ' a.opp-odkaz' });
    if (!nodeId) continue;
    const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
    const uzel = nodes.find((n) => n.role && n.role.value === 'link') || nodes[0];
    const jmeno = ((uzel && uzel.name && uzel.name.value) || '').replace(/\s+/g, ' ').trim();
    if (!prvniJmeno) prvniJmeno = jmeno;
    zmerenych++;
    /* Mezery se srovnávají: na kartě stojí nezlomitelná, ve jméně
       může být obyčejná — a tahle zkouška neměří sazbu. */
    const srovnej = (s) => s.replace(/[\s  ]/g, '');
    if (!srovnej(jmeno).includes(srovnej(vykreslene.cena))) bezCeny++;
    if (vykreslene.misto && !srovnej(jmeno).includes(srovnej(vykreslene.misto.replace(/už otevřeno$/, '')))) bezMista++;
  }
  pravda(`jména odkazů se dala přečíst ze stromu přístupnosti (${zmerenych})`, zmerenych >= 3, `změřeno: ${zmerenych}`);
  pravda(`cena z karty je ve jméně odkazu (např. „${prvniJmeno}")`, bezCeny === 0,
    `bez ceny ve jméně: ${bezCeny} z ${zmerenych} — odečítač by u nabídky neřekl, kolik stojí`);
  pravda('místo z karty je ve jméně odkazu', bezMista === 0, `bez místa: ${bezMista} z ${zmerenych}`);

  /* ---- 3. JEDNA ADRESA PRO ODKAZ I PRO KLEPNUTÍ --------------------- */
  const vOdkazu = await p.locator('#opp-list .opp-item').first().locator('a.opp-odkaz').getAttribute('href');
  const box = await p.locator('#opp-list .opp-item').first().boundingBox();
  /* Klepe se na SPODNÍ okraj karty, tedy mimo nadpis: musí fungovat
     celá plocha, ne jen text odkazu. */
  await p.mouse.click(box.x + box.width / 2, box.y + box.height - 10);
  await p.waitForTimeout(1200);
  const kam = p.url();
  pravda('klepnutí mimo nadpis otevře stránku pozemku', /pozemek\.html\?p=/.test(kam), kam);
  pravda('klepnutí jde na TOTÉŽ, co nese odkaz (jedna adresa, dvě cesty)',
    kam.endsWith(vOdkazu || '\u0000'), `odkaz: ${vOdkazu}\n      klepnutí: ${kam}`);
  /* Předávka je to, co dělá stránku okamžitou. Bez ní by odkaz
     fungoval, ale člověk by čekal na stažení celých dat. */
  const predavka = await p.evaluate(() => {
    try { return { open: !!sessionStorage.getItem('pk_open'), navrat: !!sessionStorage.getItem('pk_map_return') }; }
    catch (e) { return { open: 'výjimka', navrat: 'výjimka' }; }
  });
  pravda('předávka pozemku přes sessionStorage zůstala', predavka.open === true, 'pk_open=' + predavka.open);
  pravda('pohled mapy pro „zpět" se uložil', predavka.navrat === true, 'pk_map_return=' + predavka.navrat);
  await p.close();
}

/* POROVNÁVÁ SE STRÁNKA, NE CELÁ ADRESA.
   „Zůstat, kde byl" znamená, že prohlížeč je pořád na index.html. Za
   mřížkou si ale web vede vlastní účetnictví: filtry odjakživa a od
   10. 11. i výřez mapy, který se dopíše pár set milisekund po startu
   (js/main.js, map.on('moveend zoomend', zapisAdresu)). Celá adresa se
   tedy mezi dvěma čteními změní, aniž by se kamkoli odešlo — a zkouška
   to hlásila jako odchod: „z …/index.html na
   …/index.html#m=49.82911,15.50688,7" (CI, běh 1121). Doma to prošlo,
   protože se výřez stihl zapsat ještě před prvním čtením; na pomalejším
   běžci až mezi nimi. Porovnává se proto cesta a dotaz, mřížka ne. */
const bezMrizky = (u) => String(u).split('#')[0];

/* ---- 4. CTRL+KLEPNUTÍ OTEVŘE NOVOU KARTU ------------------------------ */
{
  const p = await vypis();
  const predtim = bezMrizky(p.url());
  const [nova] = await Promise.all([
    ctx.waitForEvent('page', { timeout: 8000 }).catch(() => null),
    p.locator('#opp-list .opp-item').first().locator('a.opp-odkaz').click({ modifiers: ['Control'] }),
  ]);
  await p.waitForTimeout(600);
  pravda('Ctrl+klepnutí otevře pozemek na nové kartě', !!nova, 'žádná nová stránka se neotevřela');
  pravda('a původní výpis zůstane, kde byl', bezMrizky(p.url()) === predtim, p.url());
  if (nova) {
    await nova.waitForTimeout(400);
    pravda('nová karta míří na stránku pozemku', /pozemek\.html\?p=/.test(nova.url()), nova.url());
    await nova.close();
  }
  await p.close();
}

/* ---- 5. TLAČÍTKA UVNITŘ KARTY DÁL FUNGUJÍ ----------------------------- */
{
  const p = await vypis();
  const predtim = bezMrizky(p.url());
  await p.locator('#opp-list .opp-item').first().locator('.opp-fav').focus();
  await p.keyboard.press('Enter');
  await p.waitForTimeout(500);
  pravda('Enter na „Uložit" neodejde z výpisu', bezMrizky(p.url()) === predtim, p.url());
  const popisek = await p.locator('#opp-list .opp-item').first().locator('.opp-fav').getAttribute('aria-label');
  /* Hledá se „Uloženo" na začátku popisku, ne samotné „Odebrat":
     od 11. 11. zní jméno „Uloženo — odebrat z uložených", aby začínalo
     tím, co je na tlačítku vidět (WCAG 2.5.3, Label in Name). */
  pravda('Enter na „Uložit" pozemek opravdu uloží',
    /^Uloženo —/.test(popisek || ''), 'popisek tlačítka: ' + popisek);
  /* A MYŠÍ TAKY — MĚŘENO, NE KLEPNUTO. Plocha odkazu jde přes celou
     kartu, takže kdyby ležela NAD tlačítky, prst by místo uložení
     odešel na pozemek. Napoprvé tu stálo prosté `.click()`: sabotáž
     (z-index 9 místo 1) ho nechala třicet vteřin čekat a zkouška pak
     PADLA výjimkou místo toho, aby vadu pojmenovala — přesně to, co
     scripts/zkouska-pad.mjs vytýká. Teď se místo klepání zeptá
     prohlížeče, KDO na tom bodě doopravdy leží. */
  const kdoLezi = await p.evaluate(() => {
    const vys = [];
    for (const t of ['.opp-fav', '.opp-skryt']) {
      const b = document.querySelector('#opp-list .opp-item ' + t);
      if (!b) { vys.push(t + ': není'); continue; }
      const r = b.getBoundingClientRect();
      const na = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const trefa = !!(na && (na === b || b.contains(na)));
      vys.push(t + ': ' + (trefa ? 'volné' : 'překryto prvkem '
        + (na ? na.tagName.toLowerCase() + '.' + (String(na.className).split(/\s+/)[0] || '—') : 'nic')));
    }
    return vys;
  });
  pravda('plocha odkazu nepřekryla tlačítka nad snímkem',
    kdoLezi.every((v) => v.endsWith('volné')), kdoLezi.join(', '));
  await p.close();
}

await prohlizec.close();
console.log('\nKarta ve výpisu: skutečný odkaz a cena v jeho jméně');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Karta ve výpisu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
