/* SKLÁDÁNÍ E-MAILU S NOVÝMI POZEMKY — bez sítě, bez databáze.
   ------------------------------------------------------------------
   Odděleno od rozesílače schválně: co se dá vyzkoušet bez odeslání
   jediného e-mailu, se tak vyzkoušet má. Rozesílač pak jen čte databázi,
   zavolá tohle a výsledek odešle.

   Tři pravidla, která tenhle modul VYNUCUJE, ne doporučuje:
     1. E-mail bez odhlašovacího odkazu nevznikne. Není to vlastnost
        navíc, je to povinnost — a povinnost, kterou je nejsnazší
        zapomenout, protože chybějící odkaz e-mail nijak nerozbije.
     2. Prázdný e-mail nevznikne. „Dnes nic nového" je pošta, o kterou
        nikdo nestojí.
     3. Víc než MAX_V_MAILU nabídek se nevypisuje. Kdo si uloží celý
        okres, dostane jinak sloupec o dvou stech řádcích, který
        neotevře — a zbytek se dohledá na webu. */
import { readFileSync } from 'node:fs';

export const MAX_V_MAILU = 8;
export const WEB = 'https://www.parcelaka.cz';

export function esc(t) {
  return String(t == null ? '' : t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function odhlasitOdkaz(token) {
  if (!token) throw new Error('odhlašovací token chybí — e-mail bez odkazu na odhlášení se neposílá');
  return `${WEB}/odhlasit-maily.html?t=${encodeURIComponent(token)}`;
}

/* Číslo s mezerami po tisících. Vlastní, protože toLocaleString('cs')
   se na runnerech bez locale dat tiše vrátí k anglickému tvaru. */
export function cislo(n) {
  if (!isFinite(n)) return '';
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
}

/* TERMÍN DRAŽBY SE MUSÍ ŘÍCT, a bere se z js/terminy.js — jednoho místa
   pro celý web. Čtvrtá kopie počítání dní by znamenala, že e-mail tvrdí
   o téže dražbě něco jiného než mapa; přesně tak se tu už jednou rozešel
   cenový verdikt.

   PROČ TO TU CHYBĚLO A PROČ TO VADÍ. Naměřeno na ostrých datech: ze 166
   dražeb a exekucí s termínem je 24 do týdne a 6 do dvou dnů, medián je
   16 dní. U dražby je termín ta jediná věc, která nutí jednat — web na to
   má celý řádek rádce „Kolik zbývá času" — a upozornění místo něj
   posílalo jen cenu a výměru. „Nový pozemek, 480 000 Kč, 2 000 m²"
   o dražbě, která je pozítří, zamlčuje to podstatné. */
const okno = {};
new Function('window', readFileSync(new URL('../js/terminy.js', import.meta.url), 'utf8'))(okno);
const T = okno.PK_TERMINY;

/** „dražba zítra", „dražba za 2 týdny" — nebo prázdno, když termín není. */
export function terminText(d) {
  if (d.type !== 'drazba' && d.type !== 'exekuce') return '';
  const dni = T.daysUntil(d.extra);
  if (dni == null) return '';
  /* Proběhlou dražbu se neposílá jako novinku: data se obnovují 4× denně
     a proběhlé z nich padají, ale mezi obnovou a odesláním je mezera. */
  if (dni < 0) return '';
  const slovo = d.type === 'exekuce' ? 'nucená dražba' : 'dražba';
  /* Datum v českém tvaru, ne strojové „20261008": zdrojText() je právě na
     tohle a je v témž modulu. Samotné „za 3 dny" by nestačilo — e-mail se
     čte i za týden a odpočet by pak lhal; datum platí vždycky. */
  const kdy = T.zdrojText((/(\d{4})-(\d{2})-(\d{2})/.exec(d.extra || '') || [''])[0]);
  return `${slovo} ${T.countdownText(dni)}${kdy ? ` (${kdy})` : ''}`;
}

export function popisNabidky(d) {
  const c = d.price > 0 ? `${cislo(d.price)} Kč` : 'cena neuvedena';
  const v = d.area > 0 ? `${cislo(d.area)} m²` : 'výměra neuvedena';
  const kde = [d.place, d.okres && `okres ${d.okres}`].filter(Boolean).join(', ');
  const druh = d.druh || 'Pozemek';
  /* PODÍL SE MUSÍ ŘÍCT. V ceně je zlomek, ale výměra celé parcely, takže
     taková nabídka vypadá v e-mailu jako trhák — a je to past, kterou web
     pojmenovává na každé stránce. Mlčet o ní v poště by bylo horší než
     neposlat nic. */
  const podil = d.podil ? ` — spoluvlastnický podíl${d.podil_zlomek ? ` ${d.podil_zlomek}` : ''}` : '';
  /* A CENA, KTERÉ WEB SÁM NEVĚŘÍ, SE MUSÍ ŘÍCT TAKY. Přiznaný podíl
     výš je jen menší půlka problému: měřeno na ostrých datech, mezi
     nabídkami pod 20 Kč/m² je přiznaný podíl JEDEN, kdežto cen, které
     cenový model označuje za pochybné, je 93. Jsou to nepřiznané
     podíly a chyby ve výměře — třeba „stavební pozemek 3 315 m²" za
     tři koruny za metr, tedy celý pozemek za deset tisíc.
     Na mapě i na stránce pozemku u nich stojí „cena k ověření". Poslat
     je e-mailem jako čerstvý nález bez jediného slova by bylo totéž,
     co web jinde pojmenovává jako past — a e-mail se nedá vzít zpátky.
     Příznak nastavuje rozesílač z TÉHOŽ modelu, jaký počítá odznak na
     webu (js/ceny.js); tenhle modul data nezná a jen je vypisuje. */
  const overit = d.overit ? ' — cena k ověření' : '';
  const termin = terminText(d);
  return { nadpis: `${druh} ${v} — ${kde}`,
    radek: `${c} · ${v}${podil}${overit}${termin ? ' · ' + termin : ''}`,
    podil: !!d.podil, overit: !!d.overit };
}

/* Odkaz vede na VLASTNÍ stránku pozemku, ne na mapu s parametry: je to
   adresa, kterou zná vyhledávač i kanál novinek, a dá se poslat dál.
   Jméno souboru dodává rozesílač, a bere ho z MAPY JMEN (mapaSouboru
   v generátoru stránek), ne z výpočtu souborPro(): na jeho klíči se
   nabídky srážejí a odkaz by vedl na cizí pozemek. Tenhle modul tedy
   nemusí znát ani data, ani generátor — jen trvá na tom, že jméno je.
   Chybějící jméno je chyba, ne důvod poslat odkaz na úvodní stránku:
   nabídka bez odkazu je v e-mailu k ničemu a tichý odkaz „někam" by se
   poznal až podle toho, že na něj nikdo neklikne. */
export function odkazNaPozemek(d) {
  if (!d || !d.soubor) throw new Error('nabídka bez jména stránky — odkaz by vedl nikam');
  return `${WEB}/${d.soubor}`;
}

/* ČEŠTINA MÁ TŘI TVARY, ne dva. „2 nových pozemků" je ostuda, kterou
   tenhle web už jednou opravoval v odznaku hlídání („1 nových"). Je to
   tady jednou a vyváží se, aby si to rozesílač push zpráv nemusel psát
   znovu — třetí kopie by znamenala, že se dřív nebo později rozejdou. */
export function tvarNovyPozemek(n) {
  if (n === 1) return 'nový pozemek';
  if (n >= 2 && n <= 4) return 'nové pozemky';
  return 'nových pozemků';
}

export function predmet(skupiny) {
  const kolik = skupiny.reduce((s, g) => s + g.nove.length, 0);
  if (!kolik) throw new Error('prázdný e-mail se neposílá');
  const slovo = tvarNovyPozemek(kolik);
  if (skupiny.length === 1 && skupiny[0].label) {
    return `${kolik} ${slovo} — ${skupiny[0].label}`;
  }
  return `${kolik} ${slovo} v tom, co hlídáte`;
}

/* Skupina = jedno uložené hledání: { label, nove: [nabídky], celkem }.
   celkem je počet VŠECH nových, i když se vypisuje jen část. */
export function text(skupiny, token) {
  const odhl = odhlasitOdkaz(token);
  if (!skupiny.length || !skupiny.some((g) => g.nove.length)) throw new Error('prázdný e-mail se neposílá');
  const r = ['Dobrý den,', '', 'v tom, co máte na Parcelce uložené, přibylo:'];
  for (const g of skupiny) {
    if (!g.nove.length) continue;
    r.push('', `── ${g.label || 'Uložené hledání'} (${g.celkem}) ──`);
    for (const d of g.nove.slice(0, MAX_V_MAILU)) {
      const p = popisNabidky(d);
      r.push('', `${p.nadpis}`, `  ${p.radek}`, `  ${odkazNaPozemek(d)}`);
    }
    if (g.celkem > MAX_V_MAILU) {
      r.push('', `  …a dalších ${g.celkem - MAX_V_MAILU}. Celý seznam: ${WEB}/hlidani.html`);
    }
  }
  r.push('', '---',
    'Ceny jsou NABÍDKOVÉ (co prodávající žádá), ne prodejní.',
    'U spoluvlastnických podílů je cena za podíl, ale výměra celé parcely.',
    '',
    `Posílání vypnete jedním klikem: ${odhl}`,
    `Jednotlivá hledání nastavíte na ${WEB}/hlidani.html`);
  return r.join('\n');
}

export function html(skupiny, token) {
  const odhl = odhlasitOdkaz(token);
  if (!skupiny.length || !skupiny.some((g) => g.nove.length)) throw new Error('prázdný e-mail se neposílá');
  const kusy = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;'
    + 'font-size:15px;line-height:1.55;color:#14231C;max-width:600px">',
    '<p>Dobrý den,</p>',
    '<p>v tom, co máte na Parcelce uložené, přibylo:</p>',
  ];
  for (const g of skupiny) {
    if (!g.nove.length) continue;
    kusy.push(`<h2 style="font-size:17px;margin:22px 0 8px">${esc(g.label || 'Uložené hledání')} `
      + `<span style="font-weight:400;color:#4A5750">(${g.celkem})</span></h2>`);
    for (const d of g.nove.slice(0, MAX_V_MAILU)) {
      const p = popisNabidky(d);
      kusy.push('<div style="padding:10px 0;border-bottom:1px solid #E3E8E5">'
        + `<a href="${esc(odkazNaPozemek(d))}" style="color:#13663E;font-weight:600;text-decoration:none">`
        + `${esc(p.nadpis)}</a><br>`
        + `<span style="color:#4A5750">${esc(p.radek)}</span></div>`);
    }
    if (g.celkem > MAX_V_MAILU) {
      kusy.push(`<p style="color:#4A5750">…a dalších ${g.celkem - MAX_V_MAILU}. `
        + `<a href="${esc(WEB)}/hlidani.html" style="color:#13663E">Celý seznam</a>.</p>`);
    }
  }
  kusy.push('<p style="margin-top:24px;font-size:13px;color:#4A5750">'
    + 'Ceny jsou <b>nabídkové</b> (co prodávající žádá), ne prodejní. '
    + 'U spoluvlastnických podílů je cena za podíl, ale výměra celé parcely.</p>',
  `<p style="font-size:13px;color:#4A5750"><a href="${esc(odhl)}" style="color:#4A5750">`
    + 'Vypnout posílání jedním klikem</a> · '
    + `<a href="${esc(WEB)}/hlidani.html" style="color:#4A5750">Nastavit jednotlivá hledání</a></p>`,
  '</div>');
  return kusy.join('\n');
}
