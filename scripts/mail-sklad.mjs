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
  return { nadpis: `${druh} ${v} — ${kde}`, radek: `${c} · ${v}${podil}`, podil: !!d.podil };
}

/* Odkaz vede na VLASTNÍ stránku pozemku, ne na mapu s parametry: je to
   adresa, kterou zná vyhledávač i kanál novinek, a dá se poslat dál.
   Jméno souboru dodává rozesílač (souborPro() z generátoru stránek),
   aby tenhle modul nemusel znát ani data, ani generátor.
   Chybějící jméno je chyba, ne důvod poslat odkaz na úvodní stránku:
   nabídka bez odkazu je v e-mailu k ničemu a tichý odkaz „někam" by se
   poznal až podle toho, že na něj nikdo neklikne. */
export function odkazNaPozemek(d) {
  if (!d || !d.soubor) throw new Error('nabídka bez jména stránky — odkaz by vedl nikam');
  return `${WEB}/${d.soubor}`;
}

export function predmet(skupiny) {
  const kolik = skupiny.reduce((s, g) => s + g.nove.length, 0);
  if (!kolik) throw new Error('prázdný e-mail se neposílá');
  const slovo = kolik === 1 ? 'nový pozemek' : (kolik < 5 ? 'nové pozemky' : 'nových pozemků');
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
