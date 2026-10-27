// Stránka s popisem dat (data.html).
//
// PROČ SE GENERUJE. Popis polí je v data/pole.json; kdyby se tatáž
// tabulka psala ještě ručně do HTML, rozešla by se s daty při prvním
// novém poli. Takhle je jedno místo a stránka z něj jen roste.
import fs from 'node:fs';
import { bezKomentaruVHtml } from './text.mjs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const req = createRequire(import.meta.url);

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

export function spust() {
  const popis = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pole.json'), 'utf8'));
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
  const nabidek = (data.opportunities || []).length;
  /* PODÍLY DVĚMA ZPŮSOBY, PROTOŽE JSOU TO DVĚ RŮZNÁ ČÍSLA.
     Tady stálo jen „522 nabídek" spočítaných ze souboru, kdežto na mapě
     jich filtr „podíl" ukazuje 521 — a kdo si obě čísla přečetl, musel
     si myslet, že se web někde počítá špatně. Přitom obě platí: v
     souboru je 522 ŘÁDKŮ, ale jeden z nich je tatáž nabídka vypsaná
     dvakrát ze dvou zdrojů. Stránka to tedy řekne naplno, místo aby
     jedno z těch čísel zamlčela. Je to tentýž případ jako u celkového
     počtu o kus výš (viz poznámka u `duplicit`) — jen u podílů se na to
     zapomnělo.
     Počítá se touž funkcí, jakou k tomu používá web, ne vlastní kopií:
     dvě kopie pravidla se dřív nebo později rozejdou. */
  const podiluVSouboru = (data.opportunities || []).filter((o) => o.podil).length;
  /* KOLIK PODÍLŮ MÁ VÝMĚRU UŽ PODÍLOVOU. Věta v dokumentaci dřív tvrdila,
     že u podílu je „výměra za celou parcelu" — a kdo podle toho dělil,
     dostal u většiny řádků číslo nafouknuté zlomkem. Robot ten případ
     rozlišuje příznakem `vymera_podilu` a v souboru ho má většina
     podílů, takže to do popisu dat patří. */
  const podiluPodilova = (data.opportunities || []).filter((o) => o.podil && o.vymera_podilu).length;
  const podiluNaWebu = (() => {
    try {
      const H = req(path.join(ROOT, 'js', 'hlidani-logika.js'));
      const C = req(path.join(ROOT, 'js', 'cisteni.js'));
      return H.bezDuplicit(C.pozemky((data.opportunities || []).slice())).filter((o) => o.podil).length;
    } catch (e) { return podiluVSouboru; }
  })();
  /* KOLIK Z TOHO JSOU DUPLICITY. Bez tohohle čísla si stránka
     odporovala sama se zbytkem webu: tady stálo „2 018 nabídek",
     kdežto stránka okresu Hodonín 119 a řez 121. Číslo se nepočítá
     tady podruhé — bere se z rozcestníku, který ho zapisuje generátor
     řezů (data/index.json → celek.duplicit). */
  const duplicit = (() => {
    try {
      const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));
      return (R.celek && R.celek.duplicit) || 0;
    } catch (e) { return 0; }
  })();
  const velikost = fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size;

  const radek = (jmeno, d, vzdy) =>
    '<tr><td><code>' + esc(jmeno) + '</code></td><td>' + esc(d.typ) + '</td>'
    + '<td>' + (vzdy === undefined ? '—' : (d.vzdy ? 'vždy' : 'někdy')) + '</td>'
    + '<td>' + esc(d.popis)
    + (d.hodnoty ? ' <b>Hodnoty:</b> ' + d.hodnoty.map((h) => '<code>' + esc(h) + '</code>').join(', ') : '')
    + '</td></tr>';

  const hlava = Object.entries(popis.hlava).map(([k, v]) => radek(k, v)).join('\n');
  const pole = Object.entries(popis.pole).map(([k, v]) => radek(k, v, true)).join('\n');

  /* Čísla se berou z disku, ne z hlavy: stránka nemá tvrdit „10 kB",
     když řez vyroste. Rozcestník staví scripts/generate-data-rezy.mjs
     a běží v řetězci před touhle stránkou. */
  const velikostCelku = fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size;
  let nejvetsiRez = 0;
  try {
    const R = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'index.json'), 'utf8'));
    nejvetsiRez = Math.max(...(R.rezy || []).map((r) => r.bajtu || 0), 0);
  } catch (e) { nejvetsiRez = 0; }

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
  /* DVA SKRIPTY, KTERÉ POTŘEBUJE data.html A NE PŘEDLOHA.
     Pata se bere z moje-data.html, a s ní i seznam skriptů. Jenže ty
     dvě stránky nemají tytéž potřeby: tabulka polí na data.html přetéká
     na telefonu do strany (460/348 px) a stín „pokračuje vpravo" u ní
     dělá js/porovnani.js, kterému k tomu stačí .dt-tab-obal; ten
     zároveň sahá na PK_CENY, takže si s sebou bere i js/ceny.js.
     Na předloze (moje-data.html) není ani .dt-tab-obal, ani #porovnani —
     naměřeno 0 ze 3 prvků a 3 % vykonaných bajtů — takže tam oba
     skripty byly 28,7 kB po gzipu pro nic.
     Z předlohy jsou proto zahozeny a data.html si je dostane tady.
     Chtěl jsem je nejdřív vyhodit z obou a málem jsem rozbil ten stín:
     moje srovnání „s ním a bez něj" porovnávalo text a počet prvků, ale
     stín je JEN PŘEPNUTÍ TŘÍDY, takže o něm mlčelo. Shodilo to až
     scripts/test-skripty-na-strance.mjs, které hlídá, že stránka
     nenačítá knihovnu, kterou nikdo nevolá — a po mém zásahu ohlásilo,
     že PK_CENY nevolá na obou stránkách nikdo. Razítka ?v= doplní
     scripts/orazitkuj-verze.mjs, proto se tu nepíšou. */
  /* `obsah.js` staví rozcestník oddílů do levého sloupce. Stránka
     dat je nejdelší text na webu (4 850 px, sedm oddílů) a jako
     jediná z dlouhých stránek ho neměla — říkala si o něj stavbou
     (`.dt-sekce`), kterou skript do 27. 10. neznál. */
  const PRO_DATA = ['js/min/ceny.js', 'js/min/porovnani.js', 'js/min/obsah.js'];
  const pata = (() => {
    let p = sablona.slice(sablona.indexOf('<footer'));
    const znacky = PRO_DATA
      .filter((f) => !p.includes(f))
      .map((f) => `<script src="${f}" defer></script>\n`).join('');
    if (!znacky) return p;
    if (!p.includes('</body>')) {
      console.error('::error::pata z moje-data.html nemá </body> — skripty pro data.html se nemají kam vložit');
      process.exit(1);
    }
    return p.replace('</body>', znacky + '</body>');
  })();

  /* Kolik inzerátů od majitelů je ve statickém odrazu. Čte se, ne
     hádá: až jich nebude nula, musí to být na stránce vidět. */
  const majitelu = (() => {
    try {
      const u = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'user-listings.json'), 'utf8'));
      return Array.isArray(u) ? u.length : ((u && u.listings) || []).length;
    } catch (e) { return 0; }
  })();

  /* Kolik nabídek má zapsanou historii ceny. Čte se ze souboru, ne
     z hlavy: kdyby ho generátor zlevnění přestal psát, musí to být
     vidět na stránce, ne jen v kódu. */
  const zlevneniPocet = (() => {
    try {
      const z = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'zlevneni.json'), 'utf8'));
      return Object.keys(z.nabidky || {}).length;
    } catch (e) { return 0; }
  })();

  const telo = `
<main id="obsah">
  <section class="st-hlava">
    <div class="st-wrap">
      <a href="index.html" class="st-zpet">‹ Pozemky na mapě</a>
      <div><span class="st-odznak">Otevřená data</span></div>
      <h1>Data Parcelky</h1>
    </div>
  </section>

  <!-- Oddíly i úvod v jednom obalu, aby měl rozcestník kam a aby úvod
       stál na téže svislici jako text pod ním. -->
  <div class="wrap dt-telo">
  <section class="dt-hlava">
    <p class="dt-uvod">Všechny nabídky jsou v <b>jednom souboru</b>. Není k němu potřeba klíč,
      registrace ani domluva — stačí si ho stáhnout. Obnovuje se ${esc(popis.obnova)}.</p>
    <p class="dt-adresa"><code>https://www.parcelaka.cz/${esc(popis.soubor)}</code></p>
    <p class="dt-cisla">Teď je v něm <b>${fmt(nabidek)}</b> nabídek a má
      <b>${(velikost / 1024).toFixed(0)}&nbsp;kB</b>.${duplicit ? ` Z toho je <b>${fmt(duplicit)}</b>`
      + ' duplicit — tentýž pozemek vypsaný dvakrát; web i řezy po okresech je odstraňují,'
      + ` takže na stránkách najdete <b>${fmt(nabidek - duplicit)}</b> pozemků.` : ''}</p>
  </section>

  <section class="dt-sekce">
    <h2>Co v něm NENÍ</h2>
    <p>Tohle je potřeba vědět dřív, než na datech někdo něco postaví:</p>
    <ul class="dt-seznam">
      <li><b>Nejsou to prodejní ceny.</b> Jsou to ceny <b>nabídkové</b> — za kolik se pozemek
        nabízí, ne za kolik se prodal. Skutečné prodejní ceny ve veřejných zdrojích nejsou.</li>
      <li><b>Nejsou to všechny pozemky v ČR</b>, jen ty, které jsou právě někde nabízené.</li>
      <li><b>U spoluvlastnického podílu</b> (<code>podil: true</code>, ${fmt(podiluVSouboru)} ${podiluVSouboru === 1 ? 'řádek' : (podiluVSouboru >= 2 && podiluVSouboru <= 4 ? 'řádky' : 'řádků')} v souboru${podiluNaWebu !== podiluVSouboru ? `, na webu ${fmt(podiluNaWebu)} po odstranění duplicit` : ''})
        je cena za zlomek pozemku. Výměra ale neznamená u všech totéž:
        kde inzerát dokazuje, že je to už výměra podílu, má řádek
        <code>vymera_podilu: true</code> (${fmt(podiluPodilova)} z ${fmt(podiluVSouboru)}) — a dělit
        takovou výměru podílem ze <code>zlomek</code> znamená spočítat cenu za metr násobně
        vyšší. U zbytku je výměra celé parcely a dělit se musí. Kdo
        <code>vymera_podilu</code> přehlédne, dostane číslo, které neplatí pro nikoho — a to
        v obou směrech.</li>
      <li><b>Co není v poli <code>site</code>, není totéž co „není".</b> Sítě se čtou z popisu
        inzerátu; chybějící údaj znamená, že o tom inzerát mlčel.</li>
      <li><b>Výměra může být <code>null</code></b> — zdroj ji neuvedl a z textu se nedala
        bezpečně přečíst. Raději nic než cizí číslo.</li>
      <!-- INZERÁTY OD MAJITELŮ V TOM SOUBORU NEJSOU. Nahoře je napsané
           „všechny nabídky jsou v jednom souboru" a u stažených dat to
           platí. Jenže na mapě jsou vedle nich i inzeráty, které sem
           vloží sami majitelé — ty chodí ze serveru a do
           data/opportunities.json je robot nepíše. Dnes je jich nula,
           takže si toho nikdo nevšimne; ten slib se tedy rozbije přesně
           ve chvíli, kdy někdo první inzerát vloží. Proto to tu stojí
           teď, ne až potom. Hlídá to scripts/test-data-rozhrani.mjs. -->
      <li><b>Nejsou v něm inzeráty od majitelů.</b> Co sem vloží sám
        majitel pozemku, se na mapě ukazuje vedle stažených nabídek, ale
        do tohohle souboru to nepatří — chodí to z naší databáze a může
        se to měnit každou minutou. Statický odraz schválených inzerátů
        je v <code>data/user-listings.json</code> (teď ${fmt(majitelu)}
        ${majitelu === 1 ? 'inzerát' : (majitelu >= 2 && majitelu <= 4 ? 'inzeráty' : 'inzerátů')});
        ve stažených nabídkách jsou jen pozemky z veřejných zdrojů.</li>
    </ul>
  </section>

  <section class="dt-sekce">
    <h2>Hlavička souboru</h2>
    <div class="dt-tab-obal"><table class="dt-tab">
      <thead><tr><th>Pole</th><th>Typ</th><th></th><th>Co to je</th></tr></thead>
      <tbody>
${hlava}
      </tbody>
    </table></div>
  </section>

  <section class="dt-sekce">
    <h2>Jedna nabídka</h2>
    <div class="dt-tab-obal"><table class="dt-tab">
      <thead><tr><th>Pole</th><th>Typ</th><th>Přítomnost</th><th>Co to je</th></tr></thead>
      <tbody>
${pole}
      </tbody>
    </table></div>
  </section>

  <section class="dt-sekce">
    <h2>Kanály a mapa webu</h2>
    <p>Kdo chce jen sledovat, co přibylo, nemusí stahovat celý soubor:</p>
    <ul class="dt-seznam">
      <li><a href="novinky.xml">novinky.xml</a> — nové pozemky z celé ČR (RSS)</li>
      <li><code>novinky-&lt;kraj&gt;.xml</code> — totéž po krajích, například
        <a href="novinky-jihomoravsky.xml">novinky-jihomoravsky.xml</a></li>
      <li><a href="sitemap.xml">sitemap.xml</a> — všechny stránky webu</li>
    </ul>
  </section>

  <section class="dt-sekce">
    <h2>Jen jeden okres? Nemusíte brát všechno</h2>
    <p class="dt-uvod">Celý soubor má ${fmt(Math.round(velikostCelku / 1024))}&nbsp;kB. Komu jde
      o jeden okres, tomu stačí jeho řez — a ten má ${fmt(Math.round(nejvetsiRez / 1024))}&nbsp;kB
      v nejhorším případě.</p>
    <p class="dt-adresa"><code>https://www.parcelaka.cz/data/okres/benesov.json</code></p>
    <ul class="dt-seznam">
      <li><b>Tvar je stejný jako u celku</b> — tatáž hlavička, tatáž pole u nabídky. Navíc je
        tam <code>rez</code> s tím, čí výběr to je, aby se řez nedal splést s celkem.</li>
      <li><b>Řez je to, co web ukazuje</b>, ne doslovný výřez souboru: duplicity (tentýž
        pozemek vypsaný dvakrát) jsou odstraněné, a tou samou funkcí, jakou k tomu používá
        mapa i stránky okresů. Počty v řezech proto odpovídají číslům na stránkách. Kdo chce
        i duplicity, vezme si celek; kolik jich je, stojí v rozcestníku pod
        <code>celek.duplicit</code>.</li>
      <li><b>Jméno souboru</b> je okres bez diakritiky a s pomlčkami, stejně jako v adrese
        stránky okresu: <code>praha-vychod.json</code>, <code>ceske-budejovice.json</code>.</li>
      <li><b>Rozcestník</b> <a href="data/index.json">data/index.json</a> vypisuje všechny
        řezy s počtem nabídek a velikostí — není potřeba jména hádat.</li>
      <li><b>Krajské řezy schválně nejsou.</b> Kraj je součet svých okresů, takže by to byla
        druhá kopie týchž dat při každé ze čtyř denních obnov. Které okresy do kterého kraje
        patří, stojí v rozcestníku pod <code>kraje</code>.</li>
      <li><b>Okres bez nabídek</b> má řez taky — prázdný. Vrátit 404 by znamenalo, že si
        každý musí ošetřit rozdíl mezi „nic tam není" a „spletl jsem adresu".</li>
      <li><b>Ještě jeden řez je celostátní:</b> <a href="data/mapa.json">data/mapa.json</a>
        je celek bez jediného pole — <code>url</code>, tedy adresy inzerátu. Stahuje ho naše
        úvodní stránka, protože mapu ani výpis adresa nezajímá a je to o čtvrtinu dat míň
        přes drát. Pro cizí použití je lepší celek nebo řez okresu: v nich adresy jsou.</li>
    </ul>
    <p class="dt-pozn">Je to obyčejný soubor na obyčejném serveru: cachovatelný, bez klíče,
      bez limitu dotazů a bez aplikační vrstvy, která by mohla spadnout.</p>
  </section>

  <!-- HISTORIE CENY JE JEDINÁ VĚC, KTEROU NIKDE JINDE NESEŽENETE.
       Soubor data/zlevneni.json leží veřejně, web si ho bere na mapu
       a dosud o něm na téhle stránce nestálo nic — kdo si bere naše
       data, o něm nevěděl, přestože je to to nejcennější, co tu je.
       Čísla se dopočítávají při sestavení, ať se nerozejdou. -->
  <section class="dt-sekce">
    <h2>Komu cena spadla — a kdy</h2>
    <p class="dt-uvod">Tohle je jediná část našich dat, která se nikde jinde nedá vzít:
      zapisujeme si nabídky den po dni, takže u ${fmt(zlevneniPocet)} ${zlevneniPocet === 1 ? 'nabídky' : 'nabídek'}
      víme, jak se u nich cena měnila.</p>
    <p class="dt-adresa"><code>https://www.parcelaka.cz/data/zlevneni.json</code></p>
    <ul class="dt-seznam">
      <li><b>Tvar</b> je <code>{ den, nabidky: { "&lt;klíč&gt;": [[den, cena], …] } }</code>.
        Dvojice jdou odpředu a den u každé znamená, kdy ta cena <b>začala</b> platit.</li>
      <li><b>Klíč je náš vnitřní</b> — obec, parcela, okres, souřadnice a výměra
        (<code>klicPozemku</code>). Na nabídky z <code>opportunities.json</code> se dá
        napojit jen tím výpočtem, který na to má web (<code>js/klic.js</code>); jako
        trvalý identifikátor ho neberte, může se změnit. Do 20.&nbsp;10. v něm místo
        výměry stál otisk adresy inzerátu; změnilo se to proto, aby se historie dala
        najít i bez adresy — tu úvodní stránka nestahuje.</li>
      <li><b>Jen nabídky, které na trhu jsou.</b> U těch, co zmizely, historii máme, ale
        do tohohle souboru nepatří — na mapě by se nikdy nepoužila.</li>
      <li><b>Změnu pod 3 % nehlásíme</b> ani tady, ani na stránkách: bývá to zaokrouhlení
        nebo přepis u zdroje, ne sleva.</li>
      <li><b>Pozor na to, co to NEZNAMENÁ.</b> Jsou to pořád ceny nabídkové. „Cena spadla"
        neznamená, že se pozemek prodal pod původní cenou — znamená, že prodávající změnil,
        za kolik ho nabízí.</li>
      <li><b>Nejdřív je 14. 9. 2026.</b> Dřív si nabídky nikdo nezapisoval, takže o starších
        změnách ceny nevíme a nikdy se nedozvíme.</li>
    </ul>
    <p class="dt-pozn">Souhrn přes celý trh — kolik nabídek je po N dnech pryč a jak hluboko
      se slevuje — je na stránce <a href="cena-pozemku.html">ceny pozemků</a>.</p>
  </section>

  <section class="dt-sekce">
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
  </div>
</main>
`;
  /* Komentáře do hotové stránky nezapisujeme — totéž pravidlo a tatáž
     funkce jako u stránek pozemků a regionů (scripts/text.mjs). */
  fs.writeFileSync(path.join(ROOT, 'data.html'),
    bezKomentaruVHtml(hlavicka + telo + pata), 'utf8');
  console.log(`Stránka data.html: ${Object.keys(popis.pole).length} polí nabídky, `
    + `${Object.keys(popis.hlava).length} polí hlavičky, ${fmt(nabidek)} nabídek.`);
}

if (import.meta.url === `file://${process.argv[1]}`) spust();
