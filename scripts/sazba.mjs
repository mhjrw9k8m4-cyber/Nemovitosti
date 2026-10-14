/* Česká sazba: jednopísmenná předložka nesmí zůstat na konci řádku.
 *
 * „…najdete v" a podstatné jméno o řádek níž je chyba, kterou čtenář
 * nepojmenuje, ale vidí ji. Naměřeno před opravou: na telefonu (390 px)
 * končilo takhle 46 z 1 755 řádků, tedy 2,6 %; na rádcovských stránkách
 * skoro 6 % — zhruba každý osmnáctý řádek.
 *
 * Proč to dělá KROK SESTAVENÍ a ne ruka: pravidlo musí platit i pro
 * 1 995 generovaných stránek a pro text, který teprve někdo napíše.
 * Jedno místo, jedno pravidlo.
 *
 * Co se NESMÍ stát: zásah do značek, skriptů, stylů nebo do textu, kde
 * na mezeře záleží. Proto se sahá jen na text MEZI značkami a obsah
 * script/style/pre/code/textarea se přeskakuje celý.
 */

/* Jednopísmenná slova, která se v češtině nenechávají na konci řádku:
   předložky k s v z o u a spojky a i. Velká písmena na začátku věty
   taky — „V katastru…" se láme stejně ošklivě. */
const JEDNOPISMENNA = 'aiouvkszAIOUVKSZ';

/* Hranice vlevo: začátek úseku, mezera, otevírací závorka nebo uvozovka.
   Vpravo musí následovat mezera a po ní písmeno nebo číslice — jinak
   jde o něco jiného než předložku se slovem. */
const VZOR = new RegExp(
  '(^|[\\s(\\[„"\u2018\u2019\u201a\u201c\u2013\u2014>])([' + JEDNOPISMENNA + '])[ \\t]+(?=[0-9A-Za-zÁ-Žá-ž\u201e\u201a])',
  'g'
);

/* Číslo a jeho jednotka taky patří k sobě: „76 220" na konci řádku
   a „Kč" na dalším je ta nejviditelnější podoba téhle chyby, protože
   cena je to nejčtenější, co na webu je. */
const VZOR_JEDNOTKA = /(\d)[ \t]+(Kč|m²|ha|km|%|×)(?![\wÁ-Žá-ž])/g;

const PRESKOCIT = /^(script|style|pre|code|textarea)$/i;

/* ČESKÁ UVOZOVKA SE MUSÍ ZAVŘÍT ČESKY.
   Změřeno 14. 10. na 2 064 živých stránkách: text otevírá správně „
   (U+201E), ale ZAVÍRÁ ROVNOU " — 52 párů z 63, jen deset bylo
   správně. Vypadá to takhle: „Obvyklá" cena, „Cena do", „jak stojí
   a leží". Čtenář to nepojmenuje, ale vidí: levá uvozovka je dole
   a vpravo visí kolmá čárka jako na psacím stroji.
   Pravidlo je úzké schválně: rovná uvozovka se změní na “ (U+201C)
   JEN když je nějaká „ otevřená. Rovná uvozovka, před kterou nic
   otevřeno není, se nechá být — může to být palec, citace kódu nebo
   cokoli, o čem tahle sazba nic neví.
   Stav se drží přes značky, protože uvozovka běžně obklopuje odkaz
   nebo zvýraznění („Jak tahle čísla <b>počítáme</b>"), a zahazuje se
   na blokové značce: přes odstavec uvozovka nepokračuje a kdyby se
   někde zapomnělo zavřít, nesmí to otrávit celou stránku. */
const BLOKOVE = /^<\/?\s*(p|div|section|article|header|footer|main|nav|aside|ul|ol|li|dl|dt|dd|table|thead|tbody|tr|td|th|h[1-6]|blockquote|figure|figcaption|form|fieldset|label|details|summary|option)\b/i;

/* Rovná uvozovka napsaná jako entita. V data.html stálo
   „majitel&quot; — pro prohlížeč je to totéž co ", ale znakový průchod
   tam vidí šest nevinných znaků a uvozovku by nechal otevřenou. */
const ENTITA = /^&(?:quot|#34|#x22);/i;

function sazUvozovky(text, stav) {
  if (text.indexOf('\u201e') === -1 && text.indexOf('"') === -1 && text.indexOf('&') === -1) return text;
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const z = text[i];
    if (z === '\u201e') { stav.otevreno = true; out += z; continue; }
    if (z === '\u201c') { stav.otevreno = false; out += z; continue; }
    if (z === '"' && stav.otevreno) { stav.otevreno = false; out += '\u201c'; continue; }
    if (z === '&') {
      const m = ENTITA.exec(text.slice(i, i + 7));
      if (m) {
        if (stav.otevreno) { stav.otevreno = false; out += '\u201c'; }
        else out += m[0];
        i += m[0].length - 1;
        continue;
      }
    }
    out += z;
  }
  return out;
}

export function osaz(html) {
  let vysledek = '';
  let i = 0;
  let preskakuj = null;          // název značky, jejíž obsah se nesází
  const uvoz = { otevreno: false };
  while (i < html.length) {
    const zacatek = html.indexOf('<', i);
    if (zacatek === -1) {
      vysledek += preskakuj ? html.slice(i) : sazUvozovky(sazTextem(html.slice(i)), uvoz);
      break;
    }
    const text = html.slice(i, zacatek);
    if (preskakuj) {
      vysledek += text;
    } else {
      const konecDalsi = html.indexOf('>', zacatek);
      const dalsiZnacka = konecDalsi === -1 ? '' : html.slice(zacatek, konecDalsi + 1);
      vysledek += sazUvozovky(sazPredZnackou(sazTextem(text), dalsiZnacka), uvoz);
    }

    /* Komentář se přenáší beze změny — jsou v něm vysvětlivky, ne sazba. */
    if (html.startsWith('<!--', zacatek)) {
      const konec = html.indexOf('-->', zacatek);
      const kam = konec === -1 ? html.length : konec + 3;
      vysledek += html.slice(zacatek, kam);
      i = kam;
      continue;
    }
    const konecZnacky = html.indexOf('>', zacatek);
    if (konecZnacky === -1) { vysledek += html.slice(zacatek); break; }
    const znacka = html.slice(zacatek, konecZnacky + 1);
    vysledek += znacka;
    i = konecZnacky + 1;

    if (BLOKOVE.test(znacka)) uvoz.otevreno = false;
    const jmeno = (znacka.match(/^<\/?\s*([a-zA-Z0-9-]+)/) || [])[1] || '';
    if (preskakuj) {
      if (znacka.startsWith('</') && jmeno.toLowerCase() === preskakuj) preskakuj = null;
    } else if (!znacka.startsWith('</') && !znacka.endsWith('/>') && PRESKOCIT.test(jmeno)) {
      preskakuj = jmeno.toLowerCase();
    }
  }
  return vysledek;
}

function sazTextem(t) {
  if (!t || t.indexOf(' ') === -1) return t;
  /* Dvakrát za sebou: vzor spotřebuje znak vlevo, takže „a i v lese"
     by se jinak ošetřilo obden. */
  return t.replace(VZOR, '$1$2\u00a0').replace(VZOR, '$1$2\u00a0')
    .replace(VZOR_JEDNOTKA, '$1\u00a0$2');
}

/* Předložka těsně PŘED řádkovou značkou — „…bydlení v <a>katastru</a>".
   Text mezi značkami tu končí mezerou, takže vzor výš nemá za co chytit
   a předložka by na konci řádku zůstala. Naměřeno 176 takových míst.
   Jen řádkové značky: u blokové (odstavec, položka seznamu) se stejně
   láme jinde a nezlomitelná mezera by tam nic neřešila. */
const RADKOVE = /^<(a|b|i|em|strong|span|abbr|code|small|sub|sup)\b/i;
const VZOR_PRED_ZNACKOU = new RegExp(
  '(^|[\\s(\\[„"‘’‚“–—])([' + JEDNOPISMENNA + '])[ \\t]+$'
);
function sazPredZnackou(text, dalsiZnacka) {
  if (!RADKOVE.test(dalsiZnacka)) return text;
  return text.replace(VZOR_PRED_ZNACKOU, '$1$2\u00a0');
}

/* Kolik jednopísmenných předložek ještě drží obyčejnou mezeru — pro
   kontrolu i pro hlášení v sestavení. */
export function zbyva(html) {
  let n = 0;
  const jen = osaz(html);
  // porovnává se počet nezlomitelných mezer, ne text: kdyby se osaz()
  // rozbil a vracel vstup beze změny, vyjde rozdíl nula a to je chyba.
  const pred = (html.match(/\u00a0/g) || []).length;
  const po = (jen.match(/\u00a0/g) || []).length;
  n = po - pred;
  return n;
}

/* Spuštění jako krok sestavení: projde všechny stránky v kořeni.
   `node scripts/sazba.mjs --nasucho` jen spočítá, co by se změnilo. */
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const nasucho = process.argv.includes('--nasucho');
  const soubory = readdirSync(KOREN).filter((f) => f.endsWith('.html'));
  let zmeneno = 0, mezer = 0;
  for (const f of soubory) {
    const p = path.join(KOREN, f);
    const puvodni = readFileSync(p, 'utf8');
    const novy = osaz(puvodni);
    if (novy === puvodni) continue;
    zmeneno++;
    mezer += (novy.match(/ /g) || []).length - (puvodni.match(/ /g) || []).length;
    if (!nasucho) writeFileSync(p, novy);
  }
  console.log(`    ${nasucho ? 'ukázalo by se' : 'osazeno'} ${mezer} nezlomitelných mezer v ${zmeneno} z ${soubory.length} stránek`);
}
