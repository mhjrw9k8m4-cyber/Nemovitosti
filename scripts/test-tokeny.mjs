// Test: každá barva/míra, na kterou se styl odvolává, je někde určená.
//
// Spuštění: node scripts/test-tokeny.mjs   (nepotřebuje prohlížeč ani síť)
//
// PROČ. `var(--neco)` bez záložní hodnoty, kde `--neco` nikdo nedefinoval,
// prohlížeč neohlásí ani nepřeskočí jen tu jednu hodnotu — zneplatní
// CELOU vlastnost. Napsat `border-radius:var(--r-karta)` a token zapomenout
// tedy neznamená „zaoblení bude výchozí", ale „zaoblení tam nebude" —
// a nic se nerozsvítí, protože stránka se vykreslí dál.
//
// Přišlo se na to takhle: při stavbě stránky s podkladem pro smlouvu
// jsem si vymyslel --r-karta, --r-mala a --stin-karta, které v paletě
// nikdy nebyly. Karty by byly bez zaoblení i bez stínu a vypadalo by
// to jako nedodělaný návrh, ne jako chyba v jednom slově.
//
// VÝJIMKY SE NEVĚŘÍ NA SLOVO. Tři tokeny se opravdu nedefinují ve
// stylopisu, protože je nastavuje skript do atributu style (barva druhu
// pozemku, barva shluku, šířka pruhu v animaci). Každá taková výjimka
// musí být DOLOŽENÁ: zkouška najde místo, které token opravdu nastavuje.
// Bez toho by se seznam výjimek stal smetištěm pro zapomenuté tokeny.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* KOMENTÁŘE SE MUSÍ VYHODIT PŘED HLEDÁNÍM, A TOHLE JE TO PODSTATNÉ.
   Napsal jsem tuhle zkoušku bez toho a hned mi nahlásila --text-onlight
   jako „určený" token — jenže ten se ve stylopisu vyskytuje jedině ve
   vysvětlivce, která popisuje, že byl zrušen. Hledání v komentářích
   by tedy udělalo pravý opak toho, k čemu zkouška je: token zmíněný
   ve vysvětlivce by umlčel hlášení o tom, že chybí. */
const STYL_SUROVY = readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const STYL = STYL_SUROVY.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Definice: `--jmeno:` kdekoli (v :root, v tmavém režimu, v pravidle). */
const urcene = new Set([...STYL.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
/* Použití BEZ záložní hodnoty — tyhle musí být určené, jinak celá
   deklarace propadne. Použití SE záložní hodnotou se kontroluje zvlášť,
   níž: psal jsem tu původně, že „s var(--x, 10px) se nic nestane", a to
   byla mýlka. Stane se to, že se tiše kreslí ta záložní hodnota — a tak
   se na webu kreslila barva s poměrem 1,92 : 1. */
const pouzite = [...STYL.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)].map((m) => m[1]);

/* PŘEDPOKLADY. Kdyby se rozbila jedna z těch dvou regulárek, seznam by
   vyšel prázdný a „nic nechybí" by byla pravda o ničem. */
pravda(`tokeny se ve stylu opravdu našly (${urcene.size} určených)`, urcene.size >= 60,
  'nalezeno jen ' + urcene.size);
pravda(`a odvolávky taky (${new Set(pouzite).size} různých)`, new Set(pouzite).size >= 50,
  'nalezeno jen ' + new Set(pouzite).size);

/* Tokeny, které stylopis záměrně nedefinuje, protože je nastavuje kód
   do atributu style. Ke každému je napsané, kde se to děje — a zkouška
   si to ověří, takže tahle tabulka nemůže zestárnout nepozorovaně. */
const ZJS = {
  '--c-druh': 'barva druhu pozemku na odznaku nabídky',
  '--sh': 'barva shluku na mapě',
  '--w': 'šířka pruhu v animaci najetí',
};
const ZDROJE = [];
for (const d of ['js', '.']) {
  const kde = path.join(ROOT, d);
  for (const f of readdirSync(kde)) {
    if (!/\.(js|html)$/.test(f)) continue;
    if (/^pozemek-|^pozemky-okres-|-kraj\.html$/.test(f)) continue;   // generované kopie
    ZDROJE.push(readFileSync(path.join(kde, f), 'utf8'));
  }
}
pravda(`je v čem hledat nastavení z kódu (${ZDROJE.length} souborů)`, ZDROJE.length >= 40,
  'jen ' + ZDROJE.length + ' souborů');

const nedolozene = Object.keys(ZJS).filter((t) =>
  !ZDROJE.some((s) => s.includes(t + ':') && /style/.test(s)));
pravda('každá výjimka je doložená místem, které ji nastavuje',
  nedolozene.length === 0,
  'bez nalezeného nastavení: ' + nedolozene.join(', ')
  + ' — pokud už se nenastavuje, patří ze seznamu výjimek ven');

const chybi = [...new Set(pouzite)].filter((t) => !urcene.has(t) && !(t in ZJS));
pravda('každý token, na který se styl odvolává, je určený', chybi.length === 0,
  chybi.map((t) => t + ' (×' + pouzite.filter((x) => x === t).length + ')').join(', '));

/* --- Bílý text na plné ploše musí být čitelný ----------------------- */
/* PRAVIDLO SE PŘESTAVĚLO, PROTOŽE JEHO DŮVOD ZMIZEL.
   Původně tu stálo: „--copper a --copper-bright se nesmí používat jako
   plocha pod bílým písmem, protože se mezi režimy obracejí — ve světlém
   tmavá zelená, v tmavém světlá máta, a bílá na mátě dává 1,82 : 1."
   To platilo, dokud web měl tmavý režim. Nemá. --copper je dnes vždycky
   #0F5C3B a bílá na něm dává 8,03 : 1, takže ten zákaz by od teď
   zakazoval něco, co je v pořádku — a to je horší než žádné pravidlo.

   Zůstává ale otázka, kvůli které pravidlo vzniklo, a ta se nezměnila:
   je ten bílý text na té ploše vidět? Místo zákazu konkrétního tokenu
   se proto POČÍTÁ POMĚR. Je to přísnější: chytí každou špatnou dvojici,
   ne jen tu jednu, kterou jsem tehdy našel.

   Měří se jen tam, kde se dá: plocha zapsaná tokenem s jednoznačnou
   barvou (ne přechod, ne průhlednost). Co spočítat nejde, se nehlásí —
   od toho je zkouška kontrastu na vykreslené stránce. */
{
  const BILA = /(?:^|;)\s*color\s*:\s*(?:#fff(?:fff)?\b|white\b|rgb\(\s*255\s*,\s*255\s*,\s*255\s*\))/i;
  function naRgb(h) {
    const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(h.trim());
    if (!m) return null;
    let x = m[1];
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    return [0, 2, 4].map((i) => parseInt(x.slice(i, i + 2), 16));
  }
  function svetlost(c) {
    const v = c.map((x) => x / 255).map((x) => (x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4)));
    return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
  }
  function pomer(a, b) {
    const la = svetlost(a), lb = svetlost(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }
  /* Hodnoty tokenů z :root. Bere se poslední zápis, ať platí přepisy. */
  const hodnoty = new Map();
  for (const m of STYL.matchAll(/(--[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*[;}]/g)) hodnoty.set(m[1], m[2]);

  const zdrojeStylu = [['css/styles.css', STYL_SUROVY]];
  for (const f of readdirSync(ROOT)) {
    if (!f.endsWith('.html')) continue;
    if (/^pozemek-|^pozemky-okres-|-kraj\.html$/.test(f)) continue;
    const t = readFileSync(path.join(ROOT, f), 'utf8');
    const m = t.match(/<style>([\s\S]*?)<\/style>/);
    if (m) zdrojeStylu.push([f, m[1]]);
  }
  let overeno = 0;
  const slabe = [];
  for (const [jmeno, text] of zdrojeStylu) {
    const bez = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
    for (const m of bez.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const dek = m[2];
      if (!BILA.test(dek)) continue;
      const bg = dek.match(/background(?:-color)?\s*:\s*var\((--[a-z0-9-]+)\)/);
      if (!bg) continue;
      const hex = hodnoty.get(bg[1]);
      const rgb = hex && naRgb(hex);
      if (!rgb) continue;                 // přechod, průhlednost, nedopočítatelné
      overeno++;
      const p = pomer([255, 255, 255], rgb);
      if (p < 4.5) slabe.push(`${jmeno}: ${m[1].trim().slice(0, 40)} — bílá na ${bg[1]} (${hex}) je ${p.toFixed(2)} : 1`);
    }
  }
  pravda(`dvojice bílá/plocha se opravdu počítaly (${overeno})`, overeno >= 5, 'spočítáno jen ' + overeno);
  pravda('bílý text na plné ploše je všude nad 4,5 : 1', slabe.length === 0, slabe.join('\n      '));

  /* --- Záložní hodnota je tichá výchozí hodnota -----------------------
   *
   * `var(--c-warn, #E8B341)` nevypadá jako rozhodnutí o barvě, ale je
   * jím: když --c-warn nikde není, kreslí se #E8B341. A ten měl na
   * bílé 1,92 : 1 — nečitelný text. Nikdo si toho nevšiml, protože
   * `.add-warn b` se objeví jen u podezřelého údaje ve formuláři, kam
   * měření hotové stránky nedosáhne. Stejně tak `var(--maxw, 1120px)`
   * dělalo drobečkovou cestu o 80 px širší než zbytek stránky.
   *
   * Pravidlo: na nedefinovaný token se smí odvolávat jen to, co je tady
   * vypsané s důvodem. A je-li tou záložní hodnotou barva, musí projít
   * stejnou mezí jako každý jiný text. */
  const NAHRADY = {
    '--vyska-hlavicky': 'pojmenovaná konstanta výšky hlavičky; schválně ji nikdo nenastavuje a body má stejné odsazení (viz vysvětlivka u body{padding-top})',
    '--cen-kroku': 'počet řádů na ose cen; nastavuje ho generátor na seznamu (cena-pozemku.html) podle skutečných dat. Záloha 3 je tam proto, že čáry řádů v pruhu jsou kresba: bez proměnné se nakreslí tři a pruh zůstane čitelný, místo aby zmizel celý.',
  };
  const PLOCHY = [['bílá karta', [255, 255, 255]],
    ['plocha stránky', naRgb(hodnoty.get('--bg') || '#ffffff')],
    ['zapuštěná plocha', naRgb(hodnoty.get('--ink') || '#ffffff')]];

  const sNahradou = [...STYL.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*,\s*([^(),]+?)\s*\)/g)]
    .map((m) => [m[1], m[2]]);
  /* Předpoklad: kdyby se regulárka rozbila, seznam by byl prázdný
     a „nic se tiše nekreslí" by byla pravda o ničem. */
  pravda(`záložní hodnoty se vůbec našly (${sNahradou.length})`, sNahradou.length >= 10,
    'nalezeno jen ' + sNahradou.length);

  const tiche = new Map();
  for (const [t, nahrada] of sNahradou) {
    if (urcene.has(t) || (t in ZJS)) continue;
    if (!tiche.has(t)) tiche.set(t, new Set());
    tiche.get(t).add(nahrada);
  }
  const nevypsane = [...tiche.keys()].filter((t) => !(t in NAHRADY));
  pravda('každá tichá výchozí hodnota je vypsaná s důvodem', nevypsane.length === 0,
    nevypsane.map((t) => `${t} → kreslí se ${[...tiche.get(t)].join(' / ')}`).join('\n      ')
    + '\n      (buď ten token určete, nebo ho sem dopište a napište proč)');

  const nective = [];
  for (const [t, hodnotyNahrad] of tiche) {
    for (const nahrada of hodnotyNahrad) {
      const rgb = naRgb(nahrada);
      if (!rgb) continue;                 // délka, přechod — barva to není
      for (const [kde, plocha] of PLOCHY) {
        if (!plocha) continue;
        const pp = pomer(rgb, plocha);
        if (pp < 4.5) nective.push(`${t} → ${nahrada} má na ${kde} jen ${pp.toFixed(2)} : 1`);
      }
    }
  }
  pravda('a žádná z nich není nečitelná', nective.length === 0,
    [...new Set(nective)].join('\n      '));

  /* --- Web je zelený -------------------------------------------------
   *
   * Zadání znělo, že web má být všude stejný. Modrá se do něj přesto
   * vracela po jednom pravidle: zástupný text v políčku hledání
   * (#8A93A3, odstín 218°), záře při zaostření u políčka i rozbalovátka
   * mapy (rgba(110,155,255), 221°), záblesk tlačítka zvětšení (#EEF2FF)
   * a nedostupné tlačítko (#9AA3B4) — a na profilu tečka „přihlášeno",
   * která si vzala modrou barvu PŮVODU INZERÁTU.
   *
   * Modrá a fialová na webu smí být, ale jen jako barva kategorie:
   * --c-sale (inzerát od realitky) a --c-majitel (od majitele). Poznají
   * se podle toho, že je jim přiřazen token --c-*. Modrá napsaná přímo
   * v pravidle je nález.
   *
   * MĚŘÍ SE ODSTÍN, NE JMÉNO. Hledat „modrá" podle názvu by nefungovalo:
   * #8A93A3 si o sobě nikde neřekne, že je modrá. */
  {
    const naHsl = ([r, g, b]) => {
      const mx = Math.max(r, g, b) / 255, mn = Math.min(r, g, b) / 255, d = mx - mn;
      let h = 0;
      if (d) {
        if (mx === r / 255) h = ((g - b) / 255 / d) % 6;
        else if (mx === g / 255) h = (b - r) / 255 / d + 2;
        else h = (r - g) / 255 / d + 4;
      }
      const l = (mx + mn) / 2;
      return { h: ((h * 60) + 360) % 360, s: d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1)), l };
    };
    const jeModra = (rgb) => { const x = naHsl(rgb); return x.h >= 195 && x.h <= 285 && x.s > 0.10; };

    /* Hodnoty přiřazené tokenům --c-* jsou barvy kategorií a modré být
       smějí. Ostatní tokeny ne — token jménem --line modrý být nemá. */
    const kategorie = new Set();
    for (const m of STYL.matchAll(/(--c-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))/g)) {
      kategorie.add(m[2].replace(/\s+/g, '').toLowerCase());
    }

    let barev = 0, kategoriiModrych = 0;
    const modre = [];
    for (const [jmeno, text] of zdrojeStylu) {
      const bez = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const m of bez.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const sel = m[1].trim().replace(/\s+/g, ' ').slice(0, 48), dek = m[2];
        /* I BARVY SCHOVANÉ V ADRESE OBRÁZKU. Šipka rozbalovátka byla
           modrá (#6E9BFF) a tahle kontrola ji nenašla, protože uvnitř
           data:image/svg+xml se mřížka píše jako %23. Hledání bez toho
           by přehlédlo každou barvu nakreslenou do vloženého SVG. */
        for (const b of dek.matchAll(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b|%23[0-9a-fA-F]{6}\b|%23[0-9a-fA-F]{3}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+[^)]*\)/g)) {
          const zapis = b[0].replace(/^%23/, '#');
          let rgb = naRgb(zapis);
          if (!rgb) {
            const c = zapis.match(/(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
            rgb = c ? [+c[1], +c[2], +c[3]] : null;
          }
          if (!rgb) continue;
          barev++;
          if (!jeModra(rgb)) continue;
          if (kategorie.has(zapis.replace(/\s+/g, '').toLowerCase())) { kategoriiModrych++; continue; }
          modre.push(`${jmeno}: ${sel} — ${zapis} (odstín ${Math.round(naHsl(rgb).h)}°)`);
        }
      }
    }
    /* Dva předpoklady, bez kterých by „nic modrého tu není" nic
       neznamenalo: barvy se musí najít, a odstín se musí počítat
       správně — což dokazuje právě to, že barvy kategorií jako modré
       rozpozná. */
    pravda(`barvy se v pravidlech opravdu našly (${barev})`, barev >= 300, 'nalezeno jen ' + barev);
    pravda(`a počítání odstínu funguje (${kategoriiModrych} modrých barev kategorií)`,
      kategoriiModrych >= 2, 'modrou kategorii nerozpoznalo — výpočet odstínu je rozbitý');
    pravda('mimo barvy kategorií není na webu nic modrého', modre.length === 0,
      [...new Set(modre)].slice(0, 10).join('\n      '));

    /* --- Barva zrušeného tmavého režimu ------------------------------
     *
     * rgba(228,240,231, …) je #E4F0E7, téměř bílá, kterou tmavý režim
     * používal jako „o stupeň jinou plochu". Na světlé kartě z ní není
     * vidět nic: změřeno na úvodu, odznaky .opp-hot, .opp-cd a
     * .opp-perm2 měly výplň rgba(228,240,231,0.06) nad rgb(249,253,251),
     * což je posun pod jednu úroveň jasu — tedy žádná plocha. Stejně
     * dopadl třpyt u načítacích kostiček a dráha ukazatele síly hesla.
     * Bylo jich třináct a jedno místo (pozemek.html) už opravené bylo,
     * takže to není nahodilost, ale celá skupina.
     *
     * Kontrola je schválně doslovná: tahle konkrétní barva na webu bez
     * tmavého režimu nemá co dělat. Žádné plané nálezy, žádné dohady. */
    const zbytky = [];
    for (const [jmeno, text] of zdrojeStylu) {
      const bez = text.replace(/\/\*[\s\S]*?\*\//g, ' ');
      for (const m of bez.matchAll(/([^{}]+)\{([^{}]*rgba\(\s*228\s*,\s*240\s*,\s*231[^}]*)\}/g)) {
        zbytky.push(`${jmeno}: ${m[1].trim().replace(/\s+/g, ' ').slice(0, 56)}`);
      }
    }
    pravda('žádná barva po zrušeném tmavém režimu', zbytky.length === 0,
      [...new Set(zbytky)].slice(0, 8).join('\n      ')
      + '\n      (rgba(228,240,231,…) je #E4F0E7 — na světlé ploše neviditelná)');
  }
}

/* A obráceně: token určený a nikde nepoužitý je mrtvý řádek v paletě.
   Není to chyba vzhledu, ale mate při každé další úpravě — člověk ladí
   barvu, která se nikde neprojeví. Hlásí se, ale nepadá se na tom. */
const JEN_PRO_REZIM = /^--(e[0-9]|r-(xs|sm|md|lg|pill))$/;   // stavební kameny palety
/* Token může být „nepoužitý ve stylopisu" a přesto živý: skripty si
   některé barvy čtou (tokenBarva) nebo je vpisují do atributu style.
   Kdo se objeví v kódu stránek, mrtvý není. */
const mrtve = [...urcene].filter((t) =>
  !STYL.includes('var(' + t + ')') && !STYL.includes('var(' + t + ',')
  && !JEN_PRO_REZIM.test(t) && !ZDROJE.some((s) => s.includes(t)));
zpravy.push('  · určených a nikde nepoužitých: ' + (mrtve.length || 0)
  + (mrtve.length ? ' (' + mrtve.slice(0, 8).join(', ') + ')' : ''));

console.log('\nTokeny stylu (barvy, míry, stíny)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Tokeny: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Tokeny: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
