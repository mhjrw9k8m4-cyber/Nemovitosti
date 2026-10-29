// Test: „Můj profil" vypadá jako zbytek webu.
//
// Spuštění: node scripts/test-profil-vzhled.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ TAHLE ZKOUŠKA VZNIKLA. Majitel 29. 10.: „Můj profil potřebujeme
// předělat na víc profesionální a aby seděl ke zbytku webu; musí to být
// útulné a člověk tam musí být jak doma." Naměřeno tehdy na 390×844:
//   · čárkovaný rám byl na celém webu jen tady (dvakrát),
//   · adresa účtu se lámala uprostřed slova („…seznam.c / z"),
//   · pět dlaždic ukazovalo pět nul v 28px značkové zeleni, takže to
//     nejhlasitější na stránce bylo pět čísel, která neříkají nic,
//   · verzálkové popisky dlaždic se lámaly na dva řádky,
//   · „Přidat pozemek" stálo na jedné obrazovce dvakrát jako dvě
//     stejně vypadající zelená tlačítka.
//
// Hlídá se to, co se dá změřit, a tak, aby to nešlo obejít vzhledem:
// barvy se čtou VYPOČTENÉ z prohlížeče, ne z pravidel ve stylopisu.
//
// POZNÁMKA K PŘIHLÁŠENÍ: karta profilu existuje jen přihlášenému, proto
// se účet podstrčí do úložiště prohlížeče a config.js se přesměruje na
// falešný server. Počet uložených pozemků se bere z prohlížeče (ne ze
// serveru), takže jedna dlaždice má jisté NENULOVÉ číslo — bez něj by
// zkouška neuměla rozlišit „zeleň se nepoužívá" od „zeleň se používá
// správně".
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Vzhled profilu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ČÁRKOVANÝ RÁM SE TU NEHLÍDÁ — A STOJÍ ZA TO ŘÍCT PROČ.
   Při psaní téhle zkoušky jsem tvrdil, že je na webu jediný (tady)
   a chtěl ho vymýtit. Zkouška sama to vyvrátila: `dashed` je ve
   stylopisu pětkrát a všude znamená „sem něco přijde, zatím nic
   není" — výzva k poznámce, plocha pro přetažení fotek, proužek bez
   uloženého místa a druhý prázdný stav webu. Je to zavedená řeč
   tohohle webu. Nález byl můj špatně napsaný grep, ne vada webu,
   a tahle poznámka tu zůstává, aby ho někdo nenašel znovu. */

const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}));
/* DVĚ NAČTENÍ, PROTOŽE PRAVIDLO MÁ DVĚ STRANY. „Nula nekřičí zeleně"
   se nedá změřit na stránce, kde žádná nula není — a „číslo něco
   znamená, proto je zelené" zase ne tam, kde jsou samé nuly. Počet
   uložených pozemků je jediné číslo, které si stránka bere z prohlížeče
   (ne ze serveru), takže se dá nastavit přesně: jednou tři, podruhé
   nula. Tatáž dlaždice tedy jednou musí být zelená a podruhé ne. */
async function otevri(ulozenych) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, locale: 'cs-CZ', reducedMotion: 'reduce',
    isMobile: true, hasTouch: true });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';window.PK_MAIL_ZAPNUTO=false;` }));
  await ctx.addInitScript((n) => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok', refresh_token: 'ref',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'nejakadelsiadresa@seznam.cz' } }));
    const klice = [];
    for (let i = 0; i < n; i++) klice.push('o' + i + '||o' + i + '|48.' + i + '|16.' + i);
    localStorage.setItem('pk_fav_v1', JSON.stringify(klice));
  }, ulozenych);
  /* VEN SE NEVOLÁ. Bez tohohle řádku se stránka pokusí spojit s ostrou
     Supabase, v sandboxu to selže — a `keepAlive()` po neúspěchu zahodí
     session, takže se zkouška kouká na ODHLÁŠENÝ profil s prázdnou
     adresou. Naměřeno: #pf-mail mělo textContent "" a výšku 0 px. */
  await ctx.route('**/*', (r) => (new URL(r.request().url()).hostname === '127.0.0.1'
    ? r.continue() : r.abort()));
  const p = await ctx.newPage();
  await p.goto(BASE + '/muj-inzerat.html', { waitUntil: 'load' });
  await p.waitForSelector('.pf-card', { timeout: 25000 }).catch(() => null);
  await p.waitForTimeout(2000);
  const v = await p.evaluate(() => {
  const zelen = getComputedStyle(document.documentElement).getPropertyValue('--znacka-svetla').trim();
  const prevod = (c) => { const d = document.createElement('i'); d.style.color = c;
    document.body.appendChild(d); const x = getComputedStyle(d).color; d.remove(); return x; };
  const zelenRGB = prevod(zelen);
  const dlazdice = [...document.querySelectorAll('.pf-stat')].map((e) => {
    const b = e.querySelector('b'), s = e.querySelector('span');
    const sr = s.getBoundingClientRect();
    const radku = Math.round(sr.height / parseFloat(getComputedStyle(s).lineHeight));
    return { popisek: s.textContent.trim(), hodnota: b.textContent.trim(),
      ink: getComputedStyle(b).color, radku: radku };
  });
  /* KOLIK ŘÁDKŮ ZABRALA ADRESA. Počítat výšku děleno line-height
     je svůdné a nefunguje: line-height se tu dědí a prohlížeč na něj
     umí vrátit „normal", což parseFloat nepřečte. Měří se proto
     rozdíl proti textu, u kterého je jistě jeden řádek — vyrobí se
     vedle, se stejným stylem, s jediným znakem. */
  const mail = document.getElementById('pf-mail');
  const vzor = mail.cloneNode(false);
  vzor.textContent = 'x';
  mail.parentNode.appendChild(vzor);
  const jedenRadek = vzor.getBoundingClientRect().height;
  vzor.remove();
  const mailRadku = jedenRadek > 0
    ? Math.round(mail.getBoundingClientRect().height / jedenRadek) : -1;
  const mailCely = (mail.getAttribute('title') || '') === mail.textContent.trim();
  /* Viditelná zelená tlačítka, která vedou na „přidat pozemek".
     Skrytá se nepočítají — prázdné stavy se překrývají podle toho,
     co server odpoví, a hidden prvek nikomu nepřekáží. */
  const pridat = [...document.querySelectorAll('#obsah a.btn-primary, #obsah button.btn-primary')]
    .filter((e) => e.getBoundingClientRect().height > 8)
    .filter((e) => /přidat pozemek/i.test(e.textContent || ''));
  return { zelenRGB, dlazdice, mailRadku, mailCely, pridat: pridat.map((e) => e.textContent.replace(/\s+/g, ' ').trim()) };
});
  await ctx.close();
  return v;
}

const v = await otevri(3);
const prazdny = await otevri(0);
await prohlizec.close();

pravda(`dlaždic je pět (${v.dlazdice.length})`, v.dlazdice.length === 5,
  JSON.stringify(v.dlazdice.map((d) => d.popisek)));
const naDvaRadky = v.dlazdice.filter((d) => d.radku > 1);
pravda('a popisek žádné z nich se neláme na dva řádky',
  naDvaRadky.length === 0, JSON.stringify(naDvaRadky));
/* JEDEN ŘÁDEK, A PŘESTO CELÁ. E-mail je jedno dlouhé slovo, takže
   každé zalomení padne doprostřed („…seznam.c / z"). Delší adresa se
   proto ořezává třemi tečkami — a pak musí být celá aspoň v `title`,
   jinak by se člověk ke své vlastní adrese nedostal. Zkouška schválně
   používá adresu, která se na 390px displeji nevejde. */
pravda('adresa účtu se neláme — drží jeden řádek',
  v.mailRadku === 1, `řádků: ${v.mailRadku}`);
pravda('a celá zůstává v title, i když je oříznutá', v.mailCely === true,
  'title neodpovídá vypsané adrese');

const nenulove = v.dlazdice.filter((d) => /[1-9]/.test(d.hodnota));
const prazdne = v.dlazdice.filter((d) => !/[1-9]/.test(d.hodnota));
pravda(`se třemi uloženými je aspoň jedna dlaždice nenulová (${nenulove.length})`,
  nenulove.length >= 1, JSON.stringify(v.dlazdice));
pravda('a číslo, které něco znamená, je ve značkové zeleni',
  nenulove.every((d) => d.ink === v.zelenRGB),
  JSON.stringify(nenulove) + ' | zeleň ' + v.zelenRGB);
pravda(`pomlčka (ještě nevím) zeleně nekřičí (${prazdne.length} dlaždic)`,
  prazdne.every((d) => d.ink !== v.zelenRGB), JSON.stringify(prazdne));

/* A TEĎ TÁŽ DLAŽDICE S NULOU. Hledá se podle popisku, ne podle pořadí:
   kdyby se dlaždice přeházely, zkouška by jinak tiše měřila jinou. */
const ulozeneTri = v.dlazdice.find((d) => /uložen/i.test(d.popisek));
const ulozeneNula = prazdny.dlazdice.find((d) => /uložen/i.test(d.popisek));
pravda('dlaždice „Uložené" se se třemi pozemky ukáže jako 3',
  !!ulozeneTri && ulozeneTri.hodnota === '3', JSON.stringify(ulozeneTri));
pravda('a bez uložených jako 0', !!ulozeneNula && ulozeneNula.hodnota === '0',
  JSON.stringify(ulozeneNula));
pravda('ta nula už zelená NENÍ — jinak by pět nul bylo to nejhlasitější na stránce',
  !!ulozeneNula && ulozeneNula.ink !== prazdny.zelenRGB,
  JSON.stringify(ulozeneNula) + ' | zeleň ' + prazdny.zelenRGB);

pravda(`„Přidat pozemek" je na stránce jednou (${v.pridat.length})`,
  v.pridat.length === 1, JSON.stringify(v.pridat));

console.log('\nVzhled profilu: sedí „Můj profil" ke zbytku webu?');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Vzhled profilu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
