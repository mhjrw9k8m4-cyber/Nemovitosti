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

/* --- 4) CENA ZA METR MUSÍ BÝT TÁŽ JAKO V MAPĚ -----------------------
   U spoluvlastnického podílu je v inzerátu výměra CELÉ parcely a cena jen
   za ten zlomek. Mapa i stránka pozemku to přepočítávají (js/ceny.js),
   stránky okresů dělily cenou lomeno celou výměrou — a web o téže
   nabídce tvrdil dvě různá čísla (Benešov, podíl 1/6: 6 proti 33 Kč/m²).
   Tohle je pojistka proti tomu, aby se ta dvě místa znovu rozešla:
   u KAŽDÉHO řádku na všech stránkách okresů se číslo porovná s tím, co
   dá společný modul. */
{
  const fsx = await import('node:fs');
  new Function(fsx.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
  const CENY = globalThis.PK_CENY;
  /* Soubor → nabídka se musí složit TOU SAMOU funkcí, jakou skládá
     odkazy generátor (mapaSouboru). Dvě nabídky můžou mít stejný klíč
     a druhá dostane jiný soubor; se souborPro() samotným se pak
     porovnávala cena jedné nabídky proti řádku té druhé a vycházely
     rozdíly, které na stránce nejsou. */
  const { mapaSouboru } = await import('./generate-parcel-pages.mjs');
  const podleSouboru = new Map();
  for (const { d, soubor } of mapaSouboru(all).values()) podleSouboru.set(soubor, d);
  let radku = 0, podilu = 0;
  const spatne = [];
  for (const f of stranky) {
    const html = readFileSync(path.join(ROOT, f), 'utf8');
    const re = /<div class="okr-item">([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(html))) {
      const radek = m[1];
      const mh = /<a class="okr-place" href="(pozemek-[^"]+\.html)"/.exec(radek);
      const mz = /okr-zametr"[^>]*>([\d\s\u00a0]+)[\s\u00a0]*Kč\/m²/.exec(radek);
      if (!mh) continue;
      const o = podleSouboru.get(mh[1]);
      if (!o) continue;
      radku++;
      if (o.podil) podilu++;
      const ceka = CENY.zaMetr(o);
      const psano = mz ? Number(mz[1].replace(/[\s\u00a0]/g, '')) : null;
      if (ceka == null) {
        if (psano != null) spatne.push(`${f} ${o.place}: podíl bez zlomku, a přesto ${psano} Kč/m²`);
      } else if (psano !== Math.round(ceka)) {
        spatne.push(`${f} ${o.place}: psáno ${psano}, modul dává ${Math.round(ceka)}`);
      }
    }
  }
  pravda('řádků s cenou za metr je dost na kontrolu', radku > 1000, `${radku} řádků`);
  pravda('a jsou mezi nimi spoluvlastnické podíly (jinak by to nic neměřilo)',
    podilu > 100, `${podilu} podílů`);
  pravda('cena za metr na stránce okresu je tatáž jako v mapě',
    spatne.length === 0, spatne.slice(0, 4).join('; '));
}

console.log('\nČísla na stránce okresu');
/* --- STRÁNKA OKRESU PROTI CENOVÉ MAPĚ -------------------------------
   Cenová mapa na cena-pozemku.html a stránka okresu jsou dvě místa, která
   o témž okresu tvrdí cenu. Přesně v téhle situaci si web začne
   odporovat — stalo se to mezi mapou a stránkou pozemku a dopadlo to na
   310 stránek. Porovnává se tedy číslo v ostrůvku mapy s číslem
   vysázeným na stránce okresu.

   POZOR NA RŮZNÉ VELIČINY: stránka okresu uvádí medián té kategorie,
   která v okrese PŘEVAŽUJE — v Praze-východ jsou to stavební pozemky
   (9 714 Kč/m²), kdežto mapa je celá o zemědělské půdě (160 Kč/m²).
   To není rozpor, obojí je označené. Srovnává se proto jen tam, kde
   stránka mluví taky o zemědělské půdě. */
{
  const cesta = path.join(ROOT, 'cena-pozemku.html');
  let mapa = null;
  try {
    const h = readFileSync(cesta, 'utf8');
    const m = /<script type="application\/json" id="cen-mapa-data">([\s\S]*?)<\/script>/.exec(h);
    mapa = m ? JSON.parse(m[1]) : null;
  } catch (e) { mapa = null; }
  pravda('cena-pozemku.html nese ostrůvek dat cenové mapy', !!mapa && Object.keys(mapa).length > 20,
    mapa ? `jen ${Object.keys(mapa).length} okresů` : 'ostrůvek se nenašel');

  if (mapa) {
    const slugOkres = (x) => x.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    let srovnano = 0;
    const rozpory = [], chybiStranka = [];
    for (const [okres, z] of Object.entries(mapa)) {
      const f = path.join(ROOT, `pozemky-okres-${slugOkres(okres)}.html`);
      let h = '';
      try { h = readFileSync(f, 'utf8'); } catch (e) { chybiStranka.push(okres); continue; }
      /* Mezera před „Kč" je PEVNÁ (&nbsp;). S literální mezerou ve vzoru
         se neshodne nic a kontrola projde naprázdno — narazil jsem na to
         při psaní cenové mapy dvakrát. */
      const m = /Medián ceny \(zemědělská půda\): <b>([0-9\u00a0 ]+)Kč\/m²/.exec(h);
      if (!m) continue;   // stránka mluví o jiné kategorii — viz komentář výš
      srovnano++;
      const c = Number(m[1].replace(/[\u00a0 ]/g, ''));
      if (c !== z.med) rozpory.push(`${okres}: mapa ${z.med}, stránka ${c}`);
      const n = /jen z ([0-9]+) nabídek/.exec(h);
      if (n && Number(n[1]) !== z.n) rozpory.push(`${okres}: počet nabídek mapa ${z.n}, stránka ${n[1]}`);
    }
    pravda('každý okres z mapy má svou stránku', chybiStranka.length === 0, chybiStranka.slice(0, 4).join(', '));
    /* Bez tohohle by kontrola pod tím prošla i tehdy, kdyby se vzor
       neshodl ani jednou. */
    pravda(`srovnalo se dost okresů (${srovnano})`, srovnano >= 20,
      `jen ${srovnano} — kontrola shody by nic neznamenala`);
    pravda('cenová mapa a stránka okresu tvrdí u zemědělské půdy TOTÉŽ',
      rozpory.length === 0, rozpory.slice(0, 5).join(' | '));
  }
}

console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Stránka okresu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
