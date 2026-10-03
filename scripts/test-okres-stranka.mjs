// Test: čísla na stránce okresu musí být pravda.
//
// Spuštění: node scripts/test-okres-stranka.mjs   (nepotřebuje prohlížeč)
//
// Stránka okresu je nejčastější vstup z vyhledávače a tvrdí čtyři věci
// s čísly: kolik je nabídek, od kolika do kolika korun, kolik z nich jsou
// spoluvlastnické podíly a kde v okrese je nabídek nejvíc. Každé z těch
// čísel se dá splést tiše — a čtvrté je navíc SLIB: u odkazu „Bystřice 5"
// se čeká, že mapa po klepnutí ukáže pět nabídek. Mapa přitom hledá po
// začátcích slov, takže „Bystřice Benešov" najde i obec, která tím slovem
// začíná. Číslo se proto ověřuje tímtéž modulem, jakým filtruje mapa.
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const HL = req(path.join(ROOT, 'js', 'hledani.js'));
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const vse = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const all = PKH.bezDuplicit(vse);
/* Po termínu se nepočítá ani na stránce, ani v mapě. */
const DNES = new Date(); DNES.setHours(0, 0, 0, 0);
function proslyTermin(o) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec(o && o.extra || '');
  if (!m) return false;
  const t = new Date(+m[1], +m[2] - 1, +m[3]);
  return !isNaN(t) && t < DNES;
}
const aktualni = all.filter((o) => !proslyTermin(o));
const byOkres = {};
for (const o of aktualni) if (o.okres) (byOkres[o.okres] = byOkres[o.okres] || []).push(o);

const stranky = readdirSync(ROOT).filter((f) => /^pozemky-okres-[a-z0-9-]+\.html$/.test(f));
pravda('stránky okresů se našly', stranky.length > 50, `${stranky.length} stránek`);

/* STRÁNKA JE VYSÁZENÁ, tedy s nezlomitelnými mezerami: v „Pozemky
   v okrese Benešov" je za tím „v" mezera U+00A0, ne obyčejná (dělá to
   scripts/sazba.mjs, aby předložka nezůstala na konci řádku). Kdo tu
   čte vzorkem s obyčejnou mezerou, nenajde nic — a zkouška pak mlčí,
   přesně jak mlčela při prvním spuštění téhle. */
function cistyText(html) { return html.replace(/\u00a0/g, ' '); }
function okresZeStranky(html) {
  const m = /<h1>Pozemky v okrese ([^<.]+)\.<\/h1>/.exec(cistyText(html));
  return m ? m[1] : null;
}

/* --- 1) Spoluvlastnické podíly -------------------------------------- */
{
  let kontrolovano = 0;
  const spatne = [];
  for (const f of stranky) {
    const html = cistyText(readFileSync(path.join(ROOT, f), 'utf8'));
    const okres = okresZeStranky(html);
    if (!okres || !byOkres[okres]) continue;
    const ceka = byOkres[okres].filter((o) => o.podil).length;
    const m = /Z toho (?:je|jsou) <b>(\d+)<\/b> spoluvlastnick/.exec(html);
    const psano = m ? Number(m[1]) : 0;
    if (ceka) kontrolovano++;
    if (psano !== ceka) spatne.push(`${f}: psáno ${m ? m[1] : 'nic'}, v datech ${ceka}`);
  }
  pravda('okresy s podíly vůbec existují (jinak se nic nekontroluje)',
    kontrolovano > 20, `${kontrolovano} stránek s podíly`);
  pravda('počet spoluvlastnických podílů na stránce sedí s daty',
    spatne.length === 0, spatne.slice(0, 4).join('; '));
}

/* --- 2) „Kde je nabídek nejvíc" je slib, ne ozdoba ------------------- */
{
  let odkazu = 0, strankSBlokem = 0;
  const spatne = [], okresJakoObec = [], spatnyOkres = [];
  for (const f of stranky) {
    const html = cistyText(readFileSync(path.join(ROOT, f), 'utf8'));
    const okres = okresZeStranky(html);
    if (!okres || !byOkres[okres]) continue;
    const blok = /<h2>Kde je v okrese [^<]*<\/h2>([\s\S]*?)<\/div>/.exec(html);
    if (!blok) continue;
    strankSBlokem++;
    const re = /<a href="index\.html\?obec=([^&"]+)&amp;okres=([^"#]+)#mapa">([^<]*)<span>(\d+)<\/span><\/a>/g;
    let m;
    while ((m = re.exec(blok[1]))) {
      odkazu++;
      const obecQ = decodeURIComponent(m[1]);
      const okresQ = decodeURIComponent(m[2]);
      const jmeno = m[3].trim();
      const psano = Number(m[4]);
      if (jmeno === okres) okresJakoObec.push(`${f}: ${jmeno}`);
      if (okresQ !== okres) spatnyOkres.push(`${f}: v odkazu ${okresQ}`);
      /* Mapa z takového odkazu srovnává CELÝ název obce i okresu
         (mistoFiltr), takže počet musí sedět s přesnou shodou v datech. */
      const vDatech = aktualni.filter((o) => o.place === obecQ && o.okres === okresQ).length;
      if (psano !== vDatech) spatne.push(`${f} ${jmeno}: psáno ${psano}, v datech ${vDatech}`);
    }
  }
  pravda('blok „kde je nabídek nejvíc" je na většině okresů',
    strankSBlokem > 30, `${strankSBlokem} stránek`);
  pravda('a odkazů je dost, aby to něco znamenalo', odkazu > 80, `${odkazu} odkazů`);
  pravda('u každého odkazu sedí počet s přesnou shodou v datech',
    spatne.length === 0, spatne.slice(0, 4).join('; '));
  pravda('okres sám sebe jako obec nenabízí',
    okresJakoObec.length === 0, okresJakoObec.slice(0, 3).join('; '));
  pravda('a v odkazu je okres té stránky (jinak by mapa ukázala jinou obec)',
    spatnyOkres.length === 0, spatnyOkres.slice(0, 3).join('; '));
}

/* --- 3) Je ten odkaz vůbec zapojený? -------------------------------
   Adresa může být správná a mapa o ní nemusí vědět — tak vznikla celá
   tahle třída chyb. Čte se proto i to, co o ?obec= stojí v js/main.js. */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  pravda('mapa čte z adresy ?obec=', /\[\?&\]obec=/.test(main));
  pravda('a nastaví podle něj PŘESNÉ místo, ne hledání textu',
    /mistoFiltr = \{ typ: 'obec', place: obec/.test(main));
  pravda('přesné místo srovnává celý název obce i okresu',
    /HL\.norm\(d\.place\) === HL\.norm\(mistoFiltr\.place\)/.test(main));
}

console.log('\nČísla na stránce okresu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Stránka okresu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
