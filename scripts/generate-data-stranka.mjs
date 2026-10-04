// Stránka s popisem dat (data.html).
//
// PROČ SE GENERUJE. Popis polí je v data/pole.json; kdyby se tatáž
// tabulka psala ještě ručně do HTML, rozešla by se s daty při prvním
// novém poli. Takhle je jedno místo a stránka z něj jen roste.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function spust() {
  const popis = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pole.json'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
  const nabidek = (data.opportunities || []).length;
  const velikost = fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size;

  const radek = (jmeno, d, vzdy) =>
    '<tr><td><code>' + esc(jmeno) + '</code></td><td>' + esc(d.typ) + '</td>'
    + '<td>' + (vzdy === undefined ? '—' : (d.vzdy ? 'vždy' : 'někdy')) + '</td>'
    + '<td>' + esc(d.popis)
    + (d.hodnoty ? ' <b>Hodnoty:</b> ' + d.hodnoty.map((h) => '<code>' + esc(h) + '</code>').join(', ') : '')
    + '</td></tr>';

  const hlava = Object.entries(popis.hlava).map(([k, v]) => radek(k, v)).join('\n');
  const pole = Object.entries(popis.pole).map(([k, v]) => radek(k, v, true)).join('\n');

  const sablona = fs.readFileSync(path.join(ROOT, 'moje-data.html'), 'utf8');
  const hlavicka = sablona.slice(0, sablona.indexOf('</header>') + '</header>'.length)
    .replace(/<title>[^<]*<\/title>/, '<title>Data Parcelky | Parcelka</title>')
    .replace(/(<meta name="description" content=")[^"]*(">)/,
      '$1Jak si vzít data Parcelky k sobě: jeden soubor, popsaná pole, čtyři obnovy denně.$2')
    .replace(/(<link rel="canonical" href=")[^"]*(">)/, '$1https://www.parcelaka.cz/data.html$2')
    .replace(/(<meta name="robots" content=")[^"]*(">)/, '$1index,follow$2')
    /* SDÍLECÍ ZNAČKY TAKY. Tady se přepisoval jen titulek, popis
       a canonical — a stránka tím vyjela se značkami pro sdílení
       z předlohy: kdo by odkaz na data.html poslal do chatu nebo na
       sociální síť, dostal by náhled „Moje data" s adresou
       moje-data.html. Nenápadná vada: ve prohlížeči se nepozná,
       protože je jen v hlavičce, a hlásí se až tím, co lidé vidí
       jinde než na webu. Předloha (moje-data.html) k tomu měla ještě
       twitter:title z porovnani.html, takže se chyba řetězila dál. */
    .replace(/(<meta property="og:title" content=")[^"]*(">)/, '$1Data Parcelky | Parcelka$2')
    .replace(/(<meta property="og:description" content=")[^"]*(">)/,
      '$1Všechny nabídky pozemků v jednom souboru — popsaná pole, bez klíče a bez registrace.$2')
    .replace(/(<meta property="og:url" content=")[^"]*(">)/, '$1https://www.parcelaka.cz/data.html$2')
    .replace(/(<meta name="twitter:title" content=")[^"]*(">)/, '$1Data Parcelky — Parcelka$2');
  const pata = sablona.slice(sablona.indexOf('<footer'));

  const telo = `
<main id="obsah">
  <section class="wrap dt-hlava">
    <h1>Data Parcelky</h1>
    <p class="dt-uvod">Všechny nabídky jsou v <b>jednom souboru</b>. Není k němu potřeba klíč,
      registrace ani domluva — stačí si ho stáhnout. Obnovuje se ${esc(popis.obnova)}.</p>
    <p class="dt-adresa"><code>https://www.parcelaka.cz/${esc(popis.soubor)}</code></p>
    <p class="dt-cisla">Teď je v něm <b>${fmt(nabidek)}</b> nabídek a má
      <b>${(velikost / 1024).toFixed(0)}&nbsp;kB</b>.</p>
  </section>

  <section class="wrap dt-sekce">
    <h2>Co v něm NENÍ</h2>
    <p>Tohle je potřeba vědět dřív, než na datech někdo něco postaví:</p>
    <ul class="dt-seznam">
      <li><b>Nejsou to prodejní ceny.</b> Jsou to ceny <b>nabídkové</b> — za kolik se pozemek
        nabízí, ne za kolik se prodal. Skutečné prodejní ceny ve veřejných zdrojích nejsou.</li>
      <li><b>Nejsou to všechny pozemky v ČR</b>, jen ty, které jsou právě někde nabízené.</li>
      <li><b>U spoluvlastnického podílu</b> (<code>podil: true</code>, ${fmt((data.opportunities || []).filter((o) => o.podil).length)} nabídek)
        je cena za zlomek, ale výměra za celou parcelu. Kdo dělí jedno druhým bez ohledu na
        <code>zlomek</code>, dostane číslo, které neplatí pro nikoho.</li>
      <li><b>Co není v poli <code>site</code>, není totéž co „není".</b> Sítě se čtou z popisu
        inzerátu; chybějící údaj znamená, že o tom inzerát mlčel.</li>
      <li><b>Výměra může být <code>null</code></b> — zdroj ji neuvedl a z textu se nedala
        bezpečně přečíst. Raději nic než cizí číslo.</li>
    </ul>
  </section>

  <section class="wrap dt-sekce">
    <h2>Hlavička souboru</h2>
    <div class="dt-tab-obal"><table class="dt-tab">
      <thead><tr><th>Pole</th><th>Typ</th><th></th><th>Co to je</th></tr></thead>
      <tbody>
${hlava}
      </tbody>
    </table></div>
  </section>

  <section class="wrap dt-sekce">
    <h2>Jedna nabídka</h2>
    <div class="dt-tab-obal"><table class="dt-tab">
      <thead><tr><th>Pole</th><th>Typ</th><th>Přítomnost</th><th>Co to je</th></tr></thead>
      <tbody>
${pole}
      </tbody>
    </table></div>
  </section>

  <section class="wrap dt-sekce">
    <h2>Kanály a mapa webu</h2>
    <p>Kdo chce jen sledovat, co přibylo, nemusí stahovat celý soubor:</p>
    <ul class="dt-seznam">
      <li><a href="novinky.xml">novinky.xml</a> — nové pozemky z celé ČR (RSS)</li>
      <li><code>novinky-&lt;kraj&gt;.xml</code> — totéž po krajích, například
        <a href="novinky-jihomoravsky.xml">novinky-jihomoravsky.xml</a></li>
      <li><a href="sitemap.xml">sitemap.xml</a> — všechny stránky webu</li>
    </ul>
  </section>

  <section class="wrap dt-sekce">
    <h2>Za jakých podmínek</h2>
    <p>Data pocházejí z veřejných zdrojů a Parcelka je dává k dispozici tak, jak jsou.
      Platí pro ně <a href="podminky.html">podmínky použití</a>. Prosíme o uvedení zdroje
      (<b>Parcelka.cz</b>) tam, kde se data zobrazují dál.</p>
    <p class="dt-pozn">Soubor je statický a leží na běžném webovém serveru, takže se chová
      jako každý jiný soubor: dá se cachovat a stahovat opakovaně. Žádné omezení počtu
      dotazů nenastavujeme — ale je slušné stahovat ho jen tehdy, když se mohl změnit,
      tedy nejvýš několikrát denně.</p>
    <p class="dt-pozn">Něco chybí nebo je potřeba jiný tvar? <a href="kontakt.html">Napište nám</a>.</p>
  </section>
</main>
`;
  fs.writeFileSync(path.join(ROOT, 'data.html'), hlavicka + telo + pata, 'utf8');
  console.log(`Stránka data.html: ${Object.keys(popis.pole).length} polí nabídky, `
    + `${Object.keys(popis.hlava).length} polí hlavičky, ${fmt(nabidek)} nabídek.`);
}

if (import.meta.url === `file://${process.argv[1]}`) spust();
