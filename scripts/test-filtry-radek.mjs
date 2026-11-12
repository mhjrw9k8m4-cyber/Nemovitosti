/* Zkouška: najde člověk filtry, a kolika klepnutími?
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-filtry-radek.mjs
 * Volá ji .github/workflows/testy.yml (krok „Filtry jsou vidět bez
 * klepnutí a žádná skupina se neroluje").
 *
 * PROČ TO VZNIKLO (a co nahradilo). Do 10. 11. byly VŠECHNY filtry za
 * jedním otvíračem „Druh, cena, výměra a další" a na telefonu se ještě
 * celý blok schovával, dokud se neklepne do pole hledání. Naměřeno
 * v prohlížeči:
 *   · na 1440 px měl otevřený panel 1 408×520 px, ale 1 133 px obsahu
 *     — 613 px se v něm muselo odrolovat a skupina „Cena a výměra"
 *     začínala 79 px POD jeho spodní hranou, takže se po otevření
 *     neukázala vůbec,
 *   · na 320, 390 i 768 px měly všechny ovladače filtrů NULOVOU
 *     velikost, dokud se neklepne do hledání; po rozbalení měl panel
 *     1 524 px a cena v něm byla 766 px od začátku.
 * Předchůdcem téhle zkoušky byl test-filtry-telefon.mjs, který hlídal
 * tlačítko „Filtry" — tedy obcházku té vady. Tlačítko i rozbalování
 * jsou pryč a tahle zkouška hlídá SILNĚJŠÍ smlouvu: filtry jsou vidět
 * bez jediného klepnutí a ke každé skupině vede jedno klepnutí.
 *
 * CO SE HLÍDÁ, a každá věc je jiná třída vady:
 *  1. ŘÁDEK JE VIDĚT BEZ KLEPNUTÍ — pět otvíračů, každý s chytací
 *     plochou 44 px a s přístupným jménem.
 *  2. LIŠTA NENAROSTLA. Řádek si bere výšku nad výpisem, takže má mez
 *     podle šířky. Na 390 px se otvírače s dlouhým popiskem zalomily
 *     do čtyř řádků a lišta měla 448 px z 844 — půl obrazovky.
 *  3. KE SKUPINĚ VEDE JEDNO KLEPNUTÍ a v jejím panelu se NEROLUJE.
 *     Tohle je to, co předtím neplatilo: panel se otevřel a hledaná
 *     skupina byla pod jeho hranou.
 *  4. PANEL SE VEJDE DO OKNA (jinak by se rolovalo místo v panelu
 *     stránkou a otvírač by zmizel).
 *  5. OTEVŘENÝ JE JEDEN. Pět absolutně umístěných panelů přes sebe
 *     by znamenalo, že nepoznáte, který ovladač ke které skupině je.
 *  6. POČET U OTVÍRAČE POČÍTÁ SVOU SKUPINU. js/main.js páruje skupiny
 *     se jmény omezení z omezeni() — překlep ve jméně by tiše ukazoval
 *     nulu, takže se to měří: zapne se volba a ptáme se, u kterého
 *     otvírače se číslo objevilo.
 *  7. ZAVÍRÁNÍ: Escape a klepnutí vedle.
 *
 * ČTE: index.html přes server zkoušek (scripts/falesna-supabase-chat.mjs).
 * NEPÍŠE NIC.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Řádek filtrů', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* MEZNÍ VÝŠKY LIŠTY. Naměřeno 10. 11. po přestavbě: 320 → 396 px,
   390 → 344, 768 → 292, 1280 → 176. Mez je nad tím s rezervou na jiné
   písmo v CI, ale POD hodnotou, která by znamenala řádek navíc
   (zalomení přidá 52 px). */
const STROP_LISTY = { 320: 430, 390: 380, 768: 330, 1280: 220 };
/* Kolik otvíračů má být vidět. Pět: druh nabídky, typ nemovitosti,
   druh pozemku, cena a výměra, další filtry. „Typ nemovitosti" se umí
   schovat, když je v datech jediná kategorie — proto mez, ne rovnost. */
const NEJMIN_OTVIRACU = 4;

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

for (const [jmeno, w] of [['telefon 320', 320], ['telefon 390', 390], ['tablet 768', 768], ['stolní 1280', 1280]]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: w, height: 844 }, isMobile: w < 700, hasTouch: w < 700 });
  await ctx.route('**/*', (r) => {
    const h = new URL(r.request().url()).hostname;
    return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.locator('.opp-item').first().waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
  await p.waitForTimeout(400);

  /* 1 + 2: co je vidět, aniž se na cokoli klepne */
  const pred = await p.evaluate(() => {
    /* SKUPINA, KTERÁ NEMÁ CO NABÍDNOUT, SE SCHOVÁ — A HLÍDAČ JI NESMÍ
       MĚŘIT. Stylopis má pravidlo `.mf:has(> .mf-panel > [hidden]:only-child)
       {display:none}`: kdyby data přinesla jedinou kategorii nebo jediný
       druh pozemku, otvírač té skupiny zmizí, protože vybírat není
       z čeho. V DOM ale zůstane, takže by ho kontroly níž našly jako
       ovladač 0×0 bez jména, klepnutí by minulo a CI by zčervenalo
       kvůli chování, které je SPRÁVNÉ. Měří se proto jen to, co se
       opravdu kreslí; že skupin zbylo dost, hlídá mez o kus níž. */
    const otv = [...document.querySelectorAll('details.mf')]
      .filter((d) => d.getClientRects().length)
      .map((d) => {
      const s = d.querySelector('summary');
      const r = s.getBoundingClientRect();
      return { id: d.id, w: Math.round(r.width), h: Math.round(r.height),
        otevreny: d.open,
        /* Jméno je to, co je VIDĚT: skrytá podoba popisku se do
           přístupného jména nepočítá, protože `display:none` prvek
           ze stromu vyhodí. */
        jmeno: [...s.querySelectorAll('.mf-jm, .mf-jm-k')]
          .filter((x) => x.getClientRects().length)
          .map((x) => x.textContent.trim()).join(' ') };
    });
    const lista = document.querySelector('.map-controls-panel').getBoundingClientRect();
    return { otv, lista: Math.round(lista.height) };
  });

  pravda(`${jmeno}: je co měřit — řádek filtrů je ve stránce`,
    pred.otv.length >= NEJMIN_OTVIRACU, `otvíračů ${pred.otv.length}`);
  if (pred.otv.length < NEJMIN_OTVIRACU) { await ctx.close(); continue; }

  const male = pred.otv.filter((o) => o.h < 44 || o.w < 44);
  pravda(`${jmeno}: každý otvírač je vidět a má plochu pro prst (${pred.otv.length})`,
    male.length === 0, male.map((o) => `${o.id} ${o.w}×${o.h}`).join(', '));
  const bezJmena = pred.otv.filter((o) => !o.jmeno);
  pravda(`${jmeno}: a každý má přístupné jméno`, bezJmena.length === 0,
    bezJmena.map((o) => o.id).join(', '));
  pravda(`${jmeno}: po načtení není otevřený žádný panel`,
    pred.otv.every((o) => !o.otevreny), pred.otv.filter((o) => o.otevreny).map((o) => o.id).join(', '));
  pravda(`${jmeno}: lišta nad výpisem nenarostla (${pred.lista} px)`,
    pred.lista <= STROP_LISTY[w],
    `${pred.lista} px proti meznímu ${STROP_LISTY[w]} px — o 52 px výš je řádek otvíračů navíc`);

  /* 3 + 4 + 5: jedno klepnutí na skupinu, žádné rolování v panelu */
  for (const o of pred.otv) {
    const z = await p.evaluate((id) => {
      const d = document.getElementById(id);
      d.querySelector('summary').click();
      const pn = d.querySelector('.mf-panel');
      const r = pn.getBoundingClientRect();
      const otevrenych = [...document.querySelectorAll('details.mf')].filter((x) => x.open).length;
      /* Políčka ve skupině, která mají nenulovou velikost — panel,
         který se otevře prázdný, je horší než žádný. */
      const poli = [...pn.querySelectorAll('.mc-field, .mcv-btn, .filter-chip, input, select')]
        .filter((e) => e.getBoundingClientRect().height > 2).length;
      /* MÍSTO POD PŘILEPENOU LIŠTOU SE NEPOČÍTÁ JAKO ROLOVÁNÍ.
         Dokud je skupina otevřená, lišta s počtem a s tlačítkem
         „Zobrazit N" se přilepí ke spodní hraně obrazovky (jinak by na
         ní panel ležel — viz css/styles.css, pravidlo
         `.map-controls-panel:has(details.mf[open]) .mcf-akce`), a panel
         má dole o tolik víc místa, aby se každý ovladač dal nad ni
         odrolovat. To místo je prázdné a vyhrazené, ne skrytý obsah:
         kdyby se počítalo, hlásil by hlídač rolování i u skupin, kde
         se vejde všechno (naměřeno 11. 11.: po přidání rezervy vyšlo
         u mf-typ na 390 px 160 px „rolování" při prázdném panelu).
         Odečítá se rozdíl proti základnímu odsazení, které má panel
         nahoře — tedy právě ta rezerva. */
      const st = getComputedStyle(pn);
      const rezerva = Math.max(0, parseFloat(st.paddingBottom) - parseFloat(st.paddingTop));
      return { rolovat: Math.max(0, Math.round(pn.scrollHeight - pn.clientHeight - rezerva)),
        obsah: Math.max(1, Math.round(pn.scrollHeight - rezerva)),
        rezerva: Math.round(rezerva), poli, otevrenych,
        vyska: Math.round(r.height), dole: Math.round(r.bottom), okno: innerHeight };
    }, o.id);
    pravda(`${jmeno}: ${o.id} se otevře na jedno klepnutí a nese ovladače (${z.poli})`,
      z.poli >= 1, JSON.stringify(z));
    /* KOLIK SE V PANELU SMÍ ROLOVAT — a všechna čísla jsou naměřená.
       Od 390 px výš NIC: panel skupiny se vejde celý, a to je ta
       vlastnost, kvůli které přestavba vznikla.
       Na 320×844 se to nedá splnit a je to aritmetika, ne nedbalost:
       lišta má 396 px, takže panelu zbývá 442 px, zatímco devět
       dlaždic kategorií (nebo druhů pozemku) má 445 px obsahu. Panel
       se tedy omezí na 44 vh (371 px) — jinak by přetekl okno
       a rolovalo by se stránkou, čímž by zmizel i otvírač — a uvnitř
       se odroluje 74 px, tedy 17 % obsahu.
       „Další filtry" je zbytková skupina se DVĚMA podskupinami
       (co uvádí inzerát, příležitosti), takže se v ní roluje i na
       širších telefonech: naměřeno 170 px na 320, 57 px na 390
       a 10 px na 768. Od 1041 px, kde panel smí mít 60 vh, nic.
       Je to vědomý ústupek právě u té jedné skupiny, která je
       schválně „co se nikam nevešlo"; pojmenované skupiny se do
       okna vejdou celé.
       Pro srovnání, odkud se jde: do 10. 11. se v JEDINÉM panelu se
       všemi filtry muselo odrolovat 613 px a hledaná skupina začínala
       79 px pod jeho spodní hranou, tedy se po otevření neukázala
       vůbec. Mez je mez, ne otisk: pár pixelů na jiném písmu v CI
       zkoušku neshodí, další skupina v panelu ano. */
    /* MEZ JE PODÍL OBSAHU, NE POČET PIXELŮ — a je to oprava z 12. 11.
       Do té doby tu stála pevná čísla (320: 90 px u pojmenovaných
       skupin, 190 u „Dalších filtrů"; 390–1040: 1 a 70). Zestárla
       s obsahem hned, jak do dat přibyla jedna kategorie: „Farmy"
       s jedinou nabídkou. Skupina „Typ nemovitosti" tím narostla
       z osmi dlaždic na devět a na 320 px vyšla na 122 px rolování
       proti meze 90 — hlídač spadl, aniž by se na webu cokoli
       pokazilo. Sesterská skupina „Druh pozemku" s TOUTÉŽ mřížkou
       přitom vyšla na 74 px, tedy přesně na číslo zapsané 11. 11.,
       takže to nebyla změna rozvržení.
       Vlastnost, na kterou se tu dohlíží, je „panel skupiny je skoro
       celý vidět". Ta se měří podílem, ne pixely: pixely porostou
       s každou další kategorií, podíl ne.
       Naměřeno 12. 11. (podíl obsahu, který se musí odrolovat):
         320×844   druh 0 · typ 24,8 % · pozemek 16,7 % · cena 0
                   · další filtry 31,5 %
         390×844   vše 0 kromě dalších filtrů 13,4 %
         768×1024  vše 0
         1280×900  vše 0
       Meze jsou nad tím s rezervou na jiné písmo v CI. Že se na
       320 px u dlaždicových skupin roluje vůbec, je aritmetika
       popsaná výš (lišta 396 px, panelu zbývá 442); kdyby obsah
       přerostl i tuhle mez, je to signál dát dlaždice na nejužším
       telefonu do dvou sloupců, ne mez znovu povolit. */
    const uzke = w <= 320;
    const podil = o.id === 'ms-filters' ? (uzke ? 0.38 : (w <= 1040 ? 0.18 : 0)) : (uzke ? 0.30 : 0);
    const mez = Math.max(1, Math.round(z.obsah * podil));
    pravda(`${jmeno}: ${o.id} — v panelu se neroluje`, z.rolovat <= mez,
      `uvnitř by se muselo odrolovat ${z.rolovat} px z obsahu ${z.obsah} px `
      + `(${Math.round((z.rolovat / z.obsah) * 1000) / 10} %), mez ${Math.round(podil * 100)} % = ${mez} px`);
    pravda(`${jmeno}: ${o.id} — panel se vejde do okna`, z.dole <= z.okno + 1,
      `dolní hrana na ${z.dole} px, okno ${z.okno} px`);
    pravda(`${jmeno}: ${o.id} — otevřený je právě jeden panel`, z.otevrenych === 1,
      `otevřených ${z.otevrenych}`);
  }

  /* 6: počet u otvírače počítá svou skupinu */
  await p.evaluate(() => { document.querySelectorAll('details.mf').forEach((d) => { d.open = false; }); });
  const skupiny = [
    ['mf-druh', () => { document.querySelector('#map-filters .filter-chip[data-type="drazba"]').click(); }],
    ['mf-cena', () => { const i = document.getElementById('map-cena');
      i.value = '1500000'; i.dispatchEvent(new Event('input', { bubbles: true }));
      i.dispatchEvent(new Event('change', { bubbles: true })); }],
    ['ms-filters', () => { document.getElementById('map-zlevnene').click(); }],
  ];
  for (const [id, zapni] of skupiny) {
    const z = await p.evaluate(async (par) => {
      document.querySelectorAll('details.mf').forEach((d) => { d.open = true; });
      // eslint-disable-next-line no-eval
      (new Function('return ' + par.kod))()();
      await new Promise((r) => setTimeout(r, 450));
      const stav = {};
      document.querySelectorAll('details.mf').forEach((d) => {
        const n = d.querySelector('.mf-n');
        stav[d.id] = n && !n.hidden ? (n.textContent || '').trim() : '';
      });
      const celek = document.getElementById('msf-badge');
      return { stav, celek: celek && !celek.hidden ? (celek.textContent || '').trim() : '' };
    }, { kod: zapni.toString() });
    pravda(`${jmeno}: zapnutá volba se ukáže jako počet u ${id}`, !!z.stav[id],
      `počty u otvíračů: ${JSON.stringify(z.stav)}`);
    const jinde = Object.keys(z.stav).filter((k) => k !== id && z.stav[k]);
    pravda(`${jmeno}: a u ostatních skupin ne (${jinde.length})`, jinde.length === 0,
      `svítí i u: ${jinde.join(', ')}`);
    pravda(`${jmeno}: celkový odznak u akcí to počítá taky`, !!z.celek,
      `celkový odznak: „${z.celek}"`);
    // vrátit do výchozího stavu pro další skupinu
    await p.evaluate(() => { const b = document.getElementById('mcf-zrusit'); if (b) b.click(); });
    await p.waitForTimeout(350);
  }

  /* 7: zavírání */
  const zavreni = await p.evaluate(async () => {
    const d = document.getElementById('mf-cena');
    d.querySelector('summary').click();
    d.querySelector('summary').focus();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    const poEscapu = d.open;
    d.querySelector('summary').click();
    await new Promise((r) => setTimeout(r, 60));
    const otevreno = d.open;
    document.querySelector('.opp-item, .map-side').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((r) => setTimeout(r, 120));
    return { poEscapu, otevreno, poKlepnutiVedle: d.open };
  });
  pravda(`${jmeno}: Escape panel zavře`, zavreni.poEscapu === false, JSON.stringify(zavreni));
  pravda(`${jmeno}: klepnutí vedle panel zavře`,
    zavreni.otevreno === true && zavreni.poKlepnutiVedle === false, JSON.stringify(zavreni));

  await ctx.close();
}

/* ----------------------------------------------------------------------
   LIŠTA AKCÍ MÁ NA TELEFONU TŘI STAVY
   ----------------------------------------------------------------------
   ROZHODNUTÍ Z 12. 11., ne mez na čísla. Majitel poslal snímek ovládání
   nad výpisem se slovy, že „se to bohužel nedá pozerat". Nejhlasitější
   prvek v něm byla plná zelená plocha „Zobrazit 3 993 nemovitostí" přes
   celou šířku — a ta opakuje TÝŽ POČET, jaký o dva řádky níž nese
   hlavička výpisu, přičemž filtry se použijí hned, jak se naklikají.
   Lišta proto na telefonu v klidu není. Vrací se jen tam, kde nese
   informaci, která jinde vidět není:
     klid bez filtru  → lišta skrytá;
     otevřený panel   → lišta i „Zobrazit N" (potvrzení volby);
     zapnutý filtr    → lišta a „Zrušit filtry", ale „Zobrazit N" ne.
   Na monitoru lišta zůstává vždy: stojí v mřížce vedle filtrů, ne jako
   vlastní řádek nad výpisem.
   Naměřeno na 390 px: první nabídka začínala na 636 px, po rolovacím
   řádku filtrů na 584 a po skrytí lišty na 511. Se zapnutým filtrem
   měla lišta 141 px, bez „Zobrazit N" 87.
   Kontrola je sama sobě důkazem živosti: kdyby pravidlo přestalo
   platit, lišta by byla vidět i v klidu a první kontrola spadne. */
{
  for (const [sirka, telefon] of [[390, true], [1280, false]]) {
    const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
      viewport: { width: sirka, height: 844 }, isMobile: telefon, hasTouch: telefon, locale: 'cs-CZ' });
    await ctx.route('**/*', (r) => {
      const h = new URL(r.request().url()).hostname;
      return (h === '127.0.0.1' || h === 'localhost') ? r.continue() : r.abort();
    });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/index.html`, { waitUntil: 'load' }).catch(() => {});
    await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
      null, { timeout: 60000 }).catch(() => {});
    const v = await p.evaluate(async () => {
      const spi = (ms) => new Promise((r) => setTimeout(r, ms));
      const vys = (id) => { const e = document.getElementById(id);
        return e ? Math.round(e.getBoundingClientRect().height) : -1; };
      const out = { klid: vys('mcf-akce'), klidHotovo: vys('mcf-hotovo') };
      document.querySelector('#mf-druh summary').click(); await spi(300);
      out.panel = vys('mcf-akce'); out.panelHotovo = vys('mcf-hotovo');
      document.querySelector('#map-filters .filter-chip[data-type="drazba"]').click(); await spi(400);
      document.querySelector('#mf-druh summary').click(); await spi(350);
      out.filtr = vys('mcf-akce'); out.filtrHotovo = vys('mcf-hotovo');
      out.filtrZrusit = vys('mcf-zrusit');
      return out;
    });
    const jm = telefon ? `telefon ${sirka}` : `stolní ${sirka}`;
    if (telefon) {
      pravda(`${jm}: lišta akcí v klidu není`, v.klid <= 2, JSON.stringify(v));
      pravda(`${jm}: s otevřeným panelem je i s „Zobrazit N"`,
        v.panel > 40 && v.panelHotovo > 40, JSON.stringify(v));
      pravda(`${jm}: se zapnutým filtrem zbyde „Zrušit filtry" bez „Zobrazit N"`,
        v.filtr > 40 && v.filtrZrusit > 40 && v.filtrHotovo <= 2, JSON.stringify(v));
    } else {
      pravda(`${jm}: lišta akcí je vidět ve všech třech stavech`,
        v.klid > 40 && v.panel > 40 && v.filtr > 40, JSON.stringify(v));
      pravda(`${jm}: a „Zobrazit N" v ní zůstává taky`,
        v.klidHotovo > 40 && v.panelHotovo > 40 && v.filtrHotovo > 40, JSON.stringify(v));
    }
    await ctx.close();
  }
}

await prohlizec.close();
console.log('\nŘádek filtrů je vidět bez klepnutí a žádná skupina se neroluje');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Řádek filtrů: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
