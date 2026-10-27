/* Test: stránka vyřazené nabídky je taky stránka.
 * ====================================================================
 * Spuštění: node scripts/test-vyrazena-nabidka.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta)
 *
 * PROČ TAHLE ZKOUŠKA EXISTUJE. Když pozemek zmizí ze zdroje, generátor
 * stránku schválně NEPŘEGENERUJE — uložený odkaz si má udržet podobu
 * z doby, kdy nabídka platila — a jen jí nahoru dopíše pruh „Tato
 * nabídka už není aktuální". Vykreslený detail se pak nekoná, protože
 * data chybí, a na stránce zůstane STATICKÁ ZÁLOHA: ta, kterou
 * js/pozemek.js jinak celou přepíše a kterou tedy nikdy nikdo neviděl.
 * Naměřeno 27. 10.: týká se to 327 z 2 271 stránek pozemků (14,4 %)
 * a `article.pz-staticky` neměl ve stylopisu JEDINÉ pravidlo. Vypadalo
 * to jako holý dokument — nadpis, odstavec a osm dvojic <dt>/<dd> pod
 * sebou v jednom sloupci, bez karty, bez mřížky, bez odstupů.
 *
 * Nespadlo nic, nic nehlásilo chybu a žádná zkouška se na tyhle
 * stránky nedívala, protože všechny braly stránku pozemku jako něco,
 * co vykreslí skript. Proto tahle: dívá se na tu druhou polovinu.
 *
 * CO SE TVRDÍ. Ne „vypadá hezky" — to se změřit nedá. Měří se čtyři
 * věci, které z toho dokumentu dělají stránku:
 *   1. rozcestí (kam místo toho) je NAD záznamem, ne pod ním,
 *   2. odkazy v něm jsou plochy, na které se dá klepnout (≥44 px),
 *   3. popisek a hodnota v tabulce se nepřekrývají a vejdou se,
 *   4. záznam i tabulka stojí na vlastní ploše, ne na pozadí stránky.
 */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DOTYK = 44;   // nejmenší rozumná chytací plocha

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Vyřazená nabídka', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Vzorek se hledá v souborech, ne podle seznamu: které nabídky skončí,
   se mění každým během robota a natvrdo zapsaný název by zkoušku
   jednou rozbil bez jediné změny ve webu. */
const vsechny = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort();
const vyrazene = vsechny.filter((f) =>
  readFileSync(path.join(KOREN, f), 'utf8').includes('class="pz-konec'));
// PŘEDPOKLAD: bez vyřazené stránky by zkouška prošla naprázdno
pravda('v repozitáři je aspoň jedna vyřazená nabídka',
  vyrazene.length > 0, `nalezeno ${vyrazene.length} z ${vsechny.length}`);

const VZOREK = [vyrazene[0], vyrazene[Math.floor(vyrazene.length / 2)], vyrazene[vyrazene.length - 1]]
  .filter((v, i, p) => v && p.indexOf(v) === i);

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));

for (const [W, H] of [[390, 844], [1280, 900]]) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: W < 700, hasTouch: W < 700,
    locale: 'cs-CZ' });
  /* Ven se nechodí: stránka vyřazené nabídky mapu nekreslí a čekání na
     dlaždice by zkoušku jen zpomalilo. */
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });

  for (const s of VZOREK) {
    const p = await ctx.newPage();
    const nactena = await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' })
      .then((r) => r && r.ok()).catch(() => false);
    if (!nactena) { pravda(`${W}px ${s} se načetla`, false, 'stránka nedojela'); await p.close(); continue; }
    /* Skript stránky se o vyřazenou nabídku pokusí a vzdá to; čeká se,
       až to má za sebou, jinak by se měřil mezistav. */
    await p.waitForTimeout(1800);

    const v = await p.evaluate(() => {
      const det = document.getElementById('pz-detail');
      const konec = det && det.querySelector(':scope > .pz-konec');
      const zaznam = det && det.querySelector(':scope > .pz-staticky');
      if (!konec || !zaznam) return { chybi: true, konec: !!konec, zaznam: !!zaznam };
      const rk = konec.getBoundingClientRect(), rz = zaznam.getBoundingClientRect();
      const odkazy = [...konec.querySelectorAll('a')].map((a) => Math.round(a.getBoundingClientRect().height));
      /* Popisek a hodnota: na úzkém okně mají být pod sebou, na širokém
         vedle sebe — a nikdy jeden přes druhý. */
      const dvojice = [];
      const dts = [...zaznam.querySelectorAll('dt')];
      dts.forEach((dt) => {
        const dd = dt.nextElementSibling;
        if (!dd || dd.tagName !== 'DD') return;
        const a = dt.getBoundingClientRect(), b = dd.getBoundingClientRect();
        dvojice.push({ popisek: dt.textContent.trim().slice(0, 20),
          prekryv: (a.right > b.left + 0.5 && a.left < b.right - 0.5
                 && a.bottom > b.top + 0.5 && a.top < b.bottom - 0.5),
          vedleSebe: Math.abs(a.top - b.top) < 4,
          preteklo: Math.round(dd.scrollWidth - dd.clientWidth) > 1 });
      });
      const plocha = (e) => getComputedStyle(e).backgroundColor;
      const prusvitna = (c) => !c || c === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(c);
      return { poradi: Math.round(rk.top) < Math.round(rz.top),
        konecPlocha: plocha(konec), zaznamPlocha: plocha(zaznam),
        tabulkaPlocha: plocha(zaznam.querySelector('dl') || zaznam),
        prusvitny: [konec, zaznam, zaznam.querySelector('dl')].filter(Boolean)
          .filter((e) => prusvitna(plocha(e))).length,
        nejmensiOdkaz: odkazy.length ? Math.min(...odkazy) : null, odkazu: odkazy.length,
        dvojic: dvojice.length,
        prekryvy: dvojice.filter((d) => d.prekryv).map((d) => d.popisek),
        pretekly: dvojice.filter((d) => d.preteklo).map((d) => d.popisek),
        vedleSebe: dvojice.filter((d) => d.vedleSebe).length };
    });

    if (v.chybi) {
      pravda(`${W}px ${s}: má pruh i záznam`, false,
        `pruh ${v.konec}, záznam ${v.zaznam} — vybral se špatný vzorek?`);
      await p.close(); continue;
    }
    // PŘEDPOKLAD: bez dvojic v tabulce by kontroly níž prošly naprázdno
    pravda(`${W}px ${s}: záznam má tabulku údajů`, v.dvojic >= 4, `dvojic ${v.dvojic}`);
    pravda(`${W}px ${s}: rozcestí stojí nad záznamem`, v.poradi === true,
      'kdo sem přijde z uloženého odkazu, hledá, kam místo toho');
    pravda(`${W}px ${s}: na odkazy v rozcestí se dá klepnout`,
      v.nejmensiOdkaz !== null && v.nejmensiOdkaz >= DOTYK,
      `nejmenší ${v.nejmensiOdkaz} px z ${v.odkazu} odkazů, mez ${DOTYK}`);
    pravda(`${W}px ${s}: popisek a hodnota se nepřekrývají`, v.prekryvy.length === 0,
      'překrývá se: ' + v.prekryvy.join(', '));
    pravda(`${W}px ${s}: a žádná hodnota nepřetekla`, v.pretekly.length === 0,
      'přeteklo: ' + v.pretekly.join(', '));
    pravda(`${W}px ${s}: pruh, záznam i tabulka mají vlastní plochu`, v.prusvitny === 0,
      `průhledných ${v.prusvitny} ze tří (${v.konecPlocha} | ${v.zaznamPlocha} | ${v.tabulkaPlocha})`);
    /* Na telefonu pod sebou, na monitoru vedle sebe — to je celý rozdíl
       mezi tabulkou a sloupcem textu a je to jediné, co se o rozvržení
       dá tvrdit bez hádání o estetice. */
    if (W >= 640) {
      pravda(`${W}px ${s}: tabulka má dva sloupce`, v.vedleSebe === v.dvojic,
        `vedle sebe ${v.vedleSebe} z ${v.dvojic}`);
    } else {
      pravda(`${W}px ${s}: na telefonu je hodnota pod popiskem`, v.vedleSebe === 0,
        `vedle sebe ${v.vedleSebe} z ${v.dvojic}`);
    }
    await p.close();
  }
  await ctx.close();
}

await prohlizec.close();
console.log('\nStránka vyřazené nabídky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Vyřazená nabídka: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
