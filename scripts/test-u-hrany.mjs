/* Test: buď u kraje, nebo s okrajem — nic mezi tím.
 * ====================================================================
 * Spuštění: node scripts/test-u-hrany.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta)
 *
 * PROČ. Majitel poslal 27. 10. fotky z iPhonu, na kterých ovládání nad
 * výpisem drhlo o hranu obrazovky — stálo 8 px od kraje, kdežto zbytek
 * stránky dýchá 20 px (--okraj-stranky). Při hledání dalších takových
 * míst se našlo druhé: hlavní snímek na stránce pozemku MÁ být od kraje
 * ke kraji (tak to má Rightmove i Zillow) a dělá se to záporným okrajem
 * `margin:0 -16px`. Jenže odsazení obalu se 26. 10. přepnulo na token
 * (20 px) a záporný okraj zůstal šestnáctkový — snímek proto stál
 * 4 px od hrany: ani u kraje, ani s okrajem.
 *
 * Obě vady jsou TÁŽ vada. Na telefonu jsou jen dvě správné polohy:
 *
 *   · 0 px  — blok jde schválně od kraje ke kraji (fotka, mapa, pás),
 *   · ≥16px — blok respektuje okraj stránky.
 *
 * Cokoli mezi tím vypadá jako chyba sazby, protože to tak je: vzniká
 * to rozdílem dvou čísel, která se měla rovnat.
 *
 * MĚŘÍ SE V PROHLÍŽEČI, na telefonní šířce, na jedenácti typech
 * stránek — a jen u bloků, které mají vlastní plochu nebo rámeček
 * (u průhledného obalu není hrana vidět, takže tam není co řešit).
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const STRANKY = ['index.html', 'pozemky-okres-benesov.html', 'pozemky-jihocesky-kraj.html',
  'pozemky-lesni.html', 'data.html', 'porovnani.html', 'cena-pozemku.html', 'hlidani.html',
  'kontakt.html', 'kolik-stoji-koupe-pozemku.html', 'nove-pozemky.html'];
const MEZ = 16;        // pod tímhle odsazením už blok drhne o hranu
const CELA = 0.5;      // a tohle je ještě „od kraje ke kraji"

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('U hrany obrazovky', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(e) {
  if (e) zpravy.push('  ✕ zkouška spadla: ' + e.message);
  console.log('\nU hrany obrazovky — buď u kraje, nebo s okrajem');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb + (e ? 1 : 0)} chyb\n`);
  if (chyb || e) { console.log('::error::U hrany obrazovky: ' + (chyb + (e ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Stránka pozemku se vykresluje z JS, takže si zaslouží vlastní čekání
   — proto je v seznamu zvlášť, s jiným selektorem na dokreslení. */
const POZEMEK = 'pozemek-benesov-benesov-1sjtz7b.html';

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
try {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  let zmerenoCelkem = 0;
  for (const s of [...STRANKY, POZEMEK]) {
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${s}`, { waitUntil: 'load', timeout: 30000 });
    if (s === POZEMEK) await p.waitForSelector('.pz-media', { timeout: 25000 }).catch(() => {});
    await p.waitForTimeout(2200);
    const v = await p.evaluate(({ MEZ, CELA }) => {
      const W = document.documentElement.clientWidth;
      const jm = (e) => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
        (typeof e.className === 'string' && e.className.trim()
          ? '.' + e.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      const nalezy = []; let zmereno = 0;
      document.querySelectorAll('body *').forEach((e) => {
        const cs = getComputedStyle(e);
        /* Pevné prvky (plovoucí tlačítko, lišta) mají svoje pravidlo
           a měří je test-nastroje-v-dosahu. */
        if (cs.display === 'none' || cs.position === 'fixed' || !e.getClientRects().length) return;
        /* PRUH, KTERÝ SE POSOUVÁ DO STRANY, SE NEMĚŘÍ. Nářadí nad
           výpisem (.mc-akce) je schválně jeden řádek, který při třech
           nástrojích přeteče a posouvá se prstem — poslední tlačítko
           pak z kraje kouká a je to ZNAK, ne vada: pruh k tomu má
           i prolínačku (.mc-akce.je-dal). Hlídá ho
           scripts/test-nastroje-v-dosahu.mjs („drží jeden řádek i při
           třech nástrojích, jen se posune do strany").
           Našlo se to 30. 10., když v datech přibyly prošlé dražby a
           s nimi třetí nástroj: tlačítko skončilo 12 px od kraje
           a tahle zkouška ho právem hlásila — jen to nebyla vada.
           Výjimka platí JEN pro přímé dítě pruhu. Nejdřív jsem ji
           napsal na celý rod nad prvkem (kterýkoli předek je posuvný)
           a sabotáž ukázala, proč to nejde: karta zatlačená na 8 px
           od kraje se skryla taky, protože posuvný předek se nad ní
           najde skoro vždycky. Takhle padne dál. */
        const rodic = e.parentElement;
        if (rodic && rodic !== document.body) {
          const cr = getComputedStyle(rodic);
          if (/auto|scroll/.test(cr.overflowX) && rodic.scrollWidth > rodic.clientWidth + 1) return;
        }
        const r = e.getBoundingClientRect();
        if (r.width < 120 || r.height < 24) return;
        const maPlochu = cs.backgroundColor !== 'rgba(0, 0, 0, 0)' || cs.backgroundImage !== 'none'
          || parseFloat(cs.borderTopWidth) > 0 || parseFloat(cs.borderLeftWidth) > 0;
        if (!maPlochu) return;
        zmereno++;
        const l = r.left, pr = W - r.right;
        const drhne = (x) => x > CELA && x < MEZ;
        if (drhne(l) || drhne(pr)) nalezy.push(jm(e) + ' ' + l.toFixed(1) + '/' + pr.toFixed(1) + ' px');
      });
      return { nalezy: [...new Set(nalezy)], zmereno };
    }, { MEZ, CELA });
    zmerenoCelkem += v.zmereno;
    pravda(`${s}: žádný blok nedrhne o hranu (0 px, nebo aspoň ${MEZ})`, v.nalezy.length === 0,
      v.nalezy.slice(0, 6).join(' | '));
    await p.close();
  }
  // PŘEDPOKLAD: bez změřených bloků by všechny kontroly prošly naprázdno
  pravda(`změřilo se, co měřit mělo (${zmerenoCelkem} bloků s vlastní plochou)`,
    zmerenoCelkem > 200, 'bloků: ' + zmerenoCelkem);
  await ctx.close();
  await prohlizec.close();
  hotovo();
} catch (e) {
  await prohlizec.close().catch(() => {});
  hotovo(e);
}
