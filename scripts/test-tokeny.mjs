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
  /* '--vc' (barva verdiktu o ceně) tu chvíli byl, a neprávem: výchozí
     hodnotu má od té doby v paletce v css/styles.css a vložený styl
     v pozemek.html ji jen přebíjí podle toho, jak nabídka vyšla.
     Deklarovaný token do seznamu výjimek nepatří. */
  /* '--w' tu býval pro najížděcí animaci puntíku na cenovém proužku.
     Proužek nahradil graf rozdělení cen (pvGrafHtml v js/pozemek.js),
     ten se nenajíždí a polohu teček píše rovnou do `left`. Token se
     tedy nikde nenastavuje — a protože zkouška tuhle tabulku ověřuje
     proti skutečnosti, musel ze seznamu ven, ne v něm zůstat jako
     památka. */
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
   Původně tu stálo (token se tehdy jmenoval --copper): „--znacka
   a --znacka-svetla se nesmí používat jako
   plocha pod bílým písmem, protože se mezi režimy obracejí — ve světlém
   tmavá zelená, v tmavém světlá máta, a bílá na mátě dává 1,82 : 1."
   To platilo, dokud web měl tmavý režim. Nemá. --znacka je dnes vždycky
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
    ['zapuštěná plocha', naRgb(hodnoty.get('--plocha-zapustena') || '#ffffff')]];

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
    /* TOTÉŽ PRO ČERVENOU, A ZE STEJNÉHO DŮVODU. Do 22. 10. dělaly jednu
       práci — světlé podbarvení pod tmavě červeným textem — ČTYŘI ručně
       psané červené na sedmi místech. Nenašel je žádný hlídač; přišlo se
       na ně ručním procházením a stejně tiše se mohly vrátit. Hledá se
       tedy červená mimo paletu úplně stejně, jako se hledá modrá. */
    const jeCervena = (rgb) => { const x = naHsl(rgb); return (x.h >= 345 || x.h <= 20) && x.s > 0.25 && x.l > 0.15 && x.l < 0.75; };

    /* Hodnoty přiřazené tokenům --c-* jsou barvy kategorií a modré být
       smějí. Ostatní tokeny ne — token jménem --line modrý být nemá. */
    const kategorie = new Set();
    for (const m of STYL.matchAll(/(--c-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6}|rgba?\([^)]*\))/g)) {
      kategorie.add(m[2].replace(/\s+/g, '').toLowerCase());
    }

    let barev = 0, kategoriiModrych = 0, kategoriiCervenych = 0;
    const modre = [], cervene = [];
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
          const klic = zapis.replace(/\s+/g, '').toLowerCase();
          if (jeCervena(rgb)) {
            if (kategorie.has(klic)) kategoriiCervenych++;
            else cervene.push(`${jmeno}: ${sel} — ${zapis} (odstín ${Math.round(naHsl(rgb).h)}°)`);
          }
          if (!jeModra(rgb)) continue;
          if (kategorie.has(klic)) { kategoriiModrych++; continue; }
          modre.push(`${jmeno}: ${sel} — ${zapis} (odstín ${Math.round(naHsl(rgb).h)}°)`);
        }
      }
    }
    /* Dva předpoklady, bez kterých by „nic modrého tu není" nic
       neznamenalo: barvy se musí najít, a odstín se musí počítat
       správně — což dokazuje právě to, že barvy kategorií jako modré
       rozpozná. */
    /* PODLAHA SE NESMÍ LEPIT NA DNEŠNÍ ČÍSLO. Počet barev zapsaných
       přímo v pravidlech KLESÁ, kdykoli nějaká dostane jméno — a to je
       smysl té práce, ne porucha. Když 22. 10. dostaly jméno čtyři
       ručně psané červené, spadl ze 300 na 292 a zkouška to nahlásila
       jako chybu, přestože web byl o kus lepší. Podlaha je tu jen proto,
       aby „nic modrého tu není" neznamenalo „nic jsem nenašel"; stačí
       tedy s rezervou pod dnešním stavem. Že se odstín počítá správně,
       dokazuje sesterská kontrola (barvy kategorií rozpozná jako modré),
       ne tohle číslo. */
    pravda(`barvy se v pravidlech opravdu našly (${barev})`, barev >= 250, 'nalezeno jen ' + barev);
    pravda(`a počítání odstínu funguje (${kategoriiModrych} modrých barev kategorií)`,
      kategoriiModrych >= 2, 'modrou kategorii nerozpoznalo — výpočet odstínu je rozbitý');
    pravda('mimo barvy kategorií není na webu nic modrého', modre.length === 0,
      [...new Set(modre)].slice(0, 10).join('\n      '));
    pravda(`a počítání odstínu najde i červenou (${kategoriiCervenych} z palety)`,
      kategoriiCervenych >= 2, 'červenou z palety nerozpoznalo — kontrola níž by pak nic neznamenala');
    pravda('ani nic červeného mimo paletu', cervene.length === 0,
      [...new Set(cervene)].slice(0, 10).join('\n      '));

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

/* --- JEDNA BARVA, JEDNO JMÉNO (nebo napsaný důvod) ------------------
   Naměřeno 20. 10.: #FFFFFF mělo v :root ŠEST jmen, #8A5512 dvě,
   #8C2F1E tři a #EDF3EF dvě. Dva stejné hexy vedle sebe nejsou alias,
   je to dvojí zdroj pravdy: rozejdou se a nikdo si toho nevšimne.
   Kde se role opravdu mohou rozejít (text proti ploše, plovoucí pruh
   proti kartě), se token ponechá — a je tady vypsaný i s tím proč.
   Kde se rozejít nemají, token na ten druhý ODKAZUJE: `var(--jiny)`,
   takže se nemá co rozejít (a tahle kontrola ho pak nevidí, protože
   hodnota není hex). */
const STEJNA_BARVA = {
  '--plocha-karta': 'plocha karty a panelu — bílá, protože karta má ležet NAD stránkou',
  '--text-ondeep': 'bílý TEXT na tmavém pásu; kdyby pás zesvětlal, mění se text, ne plocha',
  '--plocha-plovouci': 'plovoucí pruh (lepivá hlavička) — má svou tlumenou dvojici --plocha-plovouci-tlum',
  '--plocha-plovouci-plna': 'neprůhledná varianta pro dotyk; MUSÍ se rovnat <meta name="theme-color"> (dnes #FFFFFF), jinak je nahoře na telefonu vidět šev',
  /* 31. 10.: obě jsou krok z-700 téže stupnice, a je to tak správně —
     JEDNA značková zeleň pro text i pro plné plochy. Do té doby to byly
     dvě barvy, které vypadaly stejně a stejné nebyly (#0F5C3B text vedle
     #004F2F plochy, 2,48 odchylky v OKLabu); kdo je viděl vedle sebe,
     nepoznal proč. Jména zůstávají dvě, protože role jsou dvě: kdyby se
     někdy měnila barva TEXTU kvůli kontrastu, nesmí se tím hnout
     s plochami, a naopak. */
  '--znacka': 'barva značkového TEXTU a akcentů (krok z-700)',
  '--plocha-znacka': 'táž zeleň jako PLNÁ PLOCHA pod bílým textem (týž krok z-700, jiná role)',
};
{
  const koren = /:root\s*\{([\s\S]*?)\n\}/.exec(STYL);
  const tok = {};
  for (const d of (koren ? koren[1] : '').split(';')) {
    const i = d.indexOf(':');
    if (i < 0) continue;
    const k = d.slice(0, i).trim(), v = d.slice(i + 1).trim();
    if (k.startsWith('--')) tok[k] = v;
  }
  pravda('je co měřit — tokeny v :root', Object.keys(tok).length > 80,
    `nalezeno ${Object.keys(tok).length}`);
  const podle = {};
  for (const [k, v] of Object.entries(tok)) {
    const n = v.toLowerCase().replace(/\s+/g, '');
    if (!/^#|^rgba?\(/.test(n)) continue;          // odkaz var(--x) tu není hodnota
    const norm = n === '#fff' ? '#ffffff' : (n === '#000' ? '#000000' : n);
    (podle[norm] = podle[norm] || []).push(k);
  }
  const bezDuvodu = [];
  for (const [v, ks] of Object.entries(podle)) {
    if (ks.length < 2) continue;
    for (const k of ks) if (!STEJNA_BARVA[k]) bezDuvodu.push(`${v} → ${k}`);
  }
  pravda('táž barva pod víc jmény jen tam, kde je napsané proč',
    bezDuvodu.length === 0,
    bezDuvodu.join(' | ') + ' — buď ať jeden token odkazuje na druhý (var(--jiny)), nebo dopiš do STEJNA_BARVA, co ta jména rozlišuje');
  const mrtveDuvody = Object.keys(STEJNA_BARVA).filter((k) => !tok[k]);
  pravda('a žádný vypsaný důvod není mrtvý (ten token existuje)',
    mrtveDuvody.length === 0, mrtveDuvody.join(', '));
}

/* --- ZNAČKOVÉ ZELENÉ JSOU KROKY JEDNÉ STUPNICE ---------------------
   31. 10. („ta barva musí být dokonalá, najdi si nějakou paletu
   a jak grafičtí designéři pracují s barvami") dostal web stupnici
   postavenou v OKLabu: jeden odstín 161°, rovnoměrné kroky světlosti,
   sytost po křivce. Celá tabulka i důvody jsou v css/styles.css nad
   tokenem --znacka. Kroky se do tokenů píšou hodnotou (odkaz na jiný
   token statické zkoušky neumí rozložit), takže vazbu musí hlídat
   někdo jiný — tady. Bez toho by stačilo jedno „trochu to zesvětlím"
   a ze stupnice je zase šest nepříbuzných zelených, což je přesně
   stav, ze kterého se web dostával. */
{
  const STUPNICE = {
    '--plocha-znacka-svetla': '#B8E1CC',  // z-200
    '--znacka-na-tmave': '#8ECAAD',       // z-300
    '--znacka-svetla': '#247052',         // z-600
    '--znacka': '#175A40',                // z-700 — značka
    '--plocha-znacka': '#175A40',         // z-700 — táž barva, jiná role
    '--znacka-hluboka': '#124632',        // z-800
  };
  const spatne = [];
  for (const [k, cekam] of Object.entries(STUPNICE)) {
    const m = new RegExp(k + '\\s*:\\s*([^;]+);').exec(STYL);
    const je = (m ? m[1] : '').trim().toUpperCase();
    if (je !== cekam.toUpperCase()) spatne.push(`${k} = ${je || '(není)'}, stupnice říká ${cekam}`);
  }
  pravda('značkové zelené jsou kroky stupnice (viz tabulka v stylopisu)',
    spatne.length === 0, spatne.join(' | '));

  /* A JEDEN ODSTÍN. Tohle je ta vlastnost, kvůli které se stupnice
     stavěla: dřív měly zelené webu odstíny 158,2 · 158,9 · 159,1 ·
     159,2 · 163,5 — rozdíly, které se jednotlivě neztratí, ale vedle
     sebe dělají „skoro stejné, a přece ne". Mez 2° je těsná schválně:
     krok stupnice se počítá, neodhaduje. */
  const odstin = (hex) => {
    const n = hex.replace('#', '');
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
    return ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360;
  };
  const odstiny = [...new Set(Object.values(STUPNICE))].map((h) => ({ h, o: odstin(h) }));
  const rozptyl = Math.max(...odstiny.map((x) => x.o)) - Math.min(...odstiny.map((x) => x.o));
  pravda('a všechny mají týž odstín (rozptyl do 2°)', rozptyl <= 2,
    odstiny.map((x) => `${x.h} ${x.o.toFixed(1)}°`).join(', ') + ` — rozptyl ${rozptyl.toFixed(1)}°`);
}

/* --- ZNAČKA V OBRÁZKU SE MUSÍ SHODOVAT S TOKENEM -------------------
   Dlaždice loga není CSS plocha, ale obrázek (assets/logo-mark.svg),
   takže na změnu tokenu nereaguje. 31. 10. se značková zeleň
   zesvětlila (#004F2F → #0E6A47) a logo zůstalo o stupeň tmavší, než
   všechno kolem — na snímku je to vidět hned, v kódu vůbec. Tady se
   proto porovnají obě místa: kresba smí mít jen bílou a tu zeleň,
   kterou říká token --plocha-znacka. */
{
  const m = /--plocha-znacka\s*:\s*([^;]+);/.exec(STYL);
  const plocha = (m ? m[1] : '').trim().toLowerCase();
  for (const soubor of ['logo-mark.svg']) {
    const znak = readFileSync(path.join(ROOT, 'assets', soubor), 'utf8');
    const barvy = [...znak.matchAll(/fill="(#[0-9a-fA-F]{3,8})"/g)].map((x) => x[1].toLowerCase());
    const cizi = barvy.filter((x) => x !== plocha && x !== '#ffffff' && x !== '#fff');
    pravda(`kresba značky (${soubor}) má touž zeleň jako token --plocha-znacka`,
      !!plocha && barvy.length > 0 && cizi.length === 0,
      `token ${plocha || '(není)'}, v kresbě ${[...new Set(barvy)].join(', ') || '(žádná)'}`);
  }
}

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
