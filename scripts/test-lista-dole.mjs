/* Test: spodní lišta s cenou a akcí na stránce pozemku (telefon).
   ==================================================================
   Spuštění: node scripts/test-lista-dole.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ. Stránka pozemku je dlouhá — verdikt o ceně, graf rozdělení,
   srovnatelné nabídky, rádce, mapa, popis, kalkulačka, poznámka. Hlavní
   tlačítko („na inzerát") leží nahoře, takže kdo si ji přečte celou,
   musí se kvůli němu vracet o několik obrazovek zpátky. Na širokém
   displeji to řeší připnutý pravý pruh s cenou; na telefonu nebylo nic.
   Okoukáno u velkých zahraničních webů (Rightmove, Zillow, Idealista):
   na telefonu mají u nabídky připnutý spodní pruh s cenou a akcí.

   Hlídá se to, co se na tom dá pokazit:
     · nahoře se lišta NEUKAZUJE (nad cenou a tlačítky by byla druhá
       kopie téhož),
     · po odrolování se ukáže a drží se u spodní hrany,
     · vede na TOTÉŽ co tlačítko nahoře (klonuje se z něj),
     · nic jí nestojí v cestě ani pod ní: nepřekrývá patičku a kulatý
       návrat nahoru se nad ni posune,
     · na monitoru není vůbec — tam je připnutý pruh u ceny. */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
const STRANKA = readdirSync('.').find((f) => /^pozemek-.*\.html$/.test(f));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});

const zmer = (p) => p.evaluate(() => {
  const l = document.getElementById('pz-lista');
  const r = l ? l.getBoundingClientRect() : null;
  const btn = l ? l.querySelector('a, button') : null;
  const hlavni = document.querySelector('.pz-akce-hlavni .pz-btn.primary');
  const nahoru = document.querySelector('.to-top');
  const rn = nahoru ? nahoru.getBoundingClientRect() : null;
  return {
    je: !!l,
    videt: l ? getComputedStyle(l).display !== 'none' : false,
    dole: r ? Math.round(window.innerHeight - r.bottom) : null,
    vyska: r ? Math.round(r.height) : null,
    cil: btn ? btn.getAttribute('href') : null,
    cilHlavni: hlavni ? hlavni.getAttribute('href') : null,
    terc: btn ? Math.round(btn.getBoundingClientRect().height) : null,
    odsazeniTela: parseFloat(getComputedStyle(document.body).paddingBottom) || 0,
    nahoruNadListou: (r && rn && rn.height > 1) ? rn.bottom <= r.top + 1 : null,
    idDvakrat: document.querySelectorAll('#pz-fav').length,
  };
});

try {
  /* TELEFON. Dotyk musí být zapnutý: telefonní rozvržení stojí na
     `hover:none`, ne na šířce okna. */
  const ctx = await prohlizec.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${STRANKA}`, { waitUntil: 'load' });
  await p.waitForSelector('.pz-akce-hlavni .pz-btn', { timeout: 25000 });
  await p.waitForTimeout(1500);

  const nahore = await zmer(p);
  pravda('lišta na stránce je (jinak není co měřit)', nahore.je, '#pz-lista se nenašel');
  pravda('ale nahoře, u ceny a tlačítek, se neukazuje', nahore.je && !nahore.videt,
    'lišta svítí, přestože je vidět cena i tlačítka');

  await p.evaluate(() => window.scrollTo(0, 2500));
  await p.waitForTimeout(1200);
  const dole = await zmer(p);
  pravda('po odrolování se ukáže', dole.videt, 'po odrolování lišta nesvítí');
  pravda('a drží se u spodní hrany okna', dole.dole === 0, `od spodní hrany ${dole.dole} px`);
  pravda('vede na totéž co tlačítko nahoře',
    !!dole.cil && dole.cil === dole.cilHlavni, `lišta ${dole.cil}, nahoře ${dole.cilHlavni}`);
  pravda('a její tlačítko má aspoň 44 px na výšku', (dole.terc || 0) >= 44, `${dole.terc} px`);
  pravda('obsah stránky se o ni odsadí, ať nestojí na patičce',
    dole.odsazeniTela >= dole.vyska - 8, `odsazení ${dole.odsazeniTela} px, lišta ${dole.vyska} px`);
  pravda('a kulatý návrat nahoru se nad ni posune, ne přes ni',
    dole.nahoruNadListou !== false, 'tlačítko „nahoru" leží na liště');
  /* Klonuje se tlačítko, ne celý pruh — „Uložit" nese id a dvakrát
     v dokumentu být nesmí. */
  pravda('a „Uložit" se neklonuje (id smí být v dokumentu jednou)',
    dole.idDvakrat <= 1, `#pz-fav je na stránce ${dole.idDvakrat}×`);

  await p.evaluate(() => window.scrollTo(0, 0));
  await p.waitForTimeout(900);
  pravda('po návratu nahoru zase zmizí', !(await zmer(p)).videt, 'nahoře zůstala svítit');
  await ctx.close();

  /* MONITOR. Tam je připnutý pruh u ceny, takže lišta dole nemá co dělat. */
  const ctx2 = await prohlizec.newContext({
    viewport: { width: 1280, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/${STRANKA}`, { waitUntil: 'load' });
  await p2.waitForSelector('.pz-akce-hlavni .pz-btn', { timeout: 25000 });
  await p2.waitForTimeout(1200);
  await p2.evaluate(() => window.scrollTo(0, 2500));
  await p2.waitForTimeout(900);
  pravda('na monitoru se lišta neukáže vůbec', !(await zmer(p2)).videt,
    'na širokém displeji svítí spodní lišta, přestože je vpravo připnutý pruh');
  await ctx2.close();
} catch (e) {
  chyb++;
  zpravy.push('  ✕ zkouška spadla: ' + (e && e.message ? e.message : e));
}
await prohlizec.close();

console.log('\nSpodní lišta s cenou a akcí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Spodní lišta: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
