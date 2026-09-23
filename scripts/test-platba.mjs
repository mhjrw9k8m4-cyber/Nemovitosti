// Test: za peníze se musí něco stát.
//
// Spuštění: node scripts/test-platba.mjs   (nepotřebuje prohlížeč ani síť)
//
// Proč vznikl: api/create-checkout.js umí založit skutečnou platbu na
// 299 Kč za „zvýraznění inzerátu". Doručit ji má api/stripe-webhook.js —
// jenže ten zaplacení jen zapsal do logu a inzerát nezvýraznil. Adresa
// funkce je veřejná i bez odkazu na webu, takže kdokoli, kdo na ni pošle
// POST, mohl zaplatit za službu, kterou nikdo nedodá.
//
// Ve formuláři je placené zvýraznění schválně schované s poznámkou, že
// „rozdělaná placená funkce snižuje důvěru k webu víc, než kolik
// přinese". Tenhle test drží u téhož rozhodnutí i platební koncový bod.
//
// Pravidlo: DOKUD WEBHOOK NEUMÍ ZVÝRAZNĚNÍ ZAPNOUT, CHECKOUT MUSÍ BÝT
// ZAVŘENÝ. Obojí je v jednom testu schválně — kdyby to byly dva, dá se
// zapnout jeden a zapomenout na druhý, a to je přesně ta situace, kdy
// lidé platí za nic.
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const checkout = readFileSync(path.join(ROOT, 'api', 'create-checkout.js'), 'utf8');
const webhook = readFileSync(path.join(ROOT, 'api', 'stripe-webhook.js'), 'utf8');
const formular = readFileSync(path.join(ROOT, 'pridat.html'), 'utf8');
const podminky = readFileSync(path.join(ROOT, 'podminky.html'), 'utf8');

/* Umí webhook doručit? Poznává se to podle toho, že podle listingRef
   opravdu sáhne do databáze — ne podle komentáře o tom, že jednou bude.
   Komentáře se proto nejdřív vyhodí: první verze téhle kontroly se
   chytila právě té poznámky, která popisuje, co se MÁ stát, a usoudila
   z ní, že se to děje. */
function bezKomentaru(kod) {
  return kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}
const webhookKod = bezKomentaru(webhook);
const webhookDorucuje = /featured\s*[:=]\s*true|set\s+featured|update\s+listings|rpc\/[a-z_]*featur|set_featured/i.test(webhookKod);

pravda('webhook zatím zvýraznění nedoručuje (jen eviduje platbu)', !webhookDorucuje,
  'pokud už doručuje, je tenhle test potřeba přepsat — a checkout se smí otevřít');

if (!webhookDorucuje) {
  pravda('checkout je proto zavřený', /ZVYRAZNENI_ZAPNUTO/.test(checkout),
    'api/create-checkout.js by založil skutečnou platbu za službu, kterou nikdo nedodá');
  pravda('a zavřený je VÝCHOZÍ stav, ne volba',
    /=== '1'/.test(checkout) && /if \(!doruceniHotovo\)/.test(checkout),
    'zapnuto musí být jen při výslovném nastavení; cokoli jiného znamená zavřeno');
  pravda('a odmítne dřív, než sáhne na Stripe',
    checkout.indexOf('doruceniHotovo') < checkout.indexOf('new Stripe('),
    'platba se nesmí ani začít zakládat');
  pravda('člověk se dozví proč, ne jen chybu',
    /zdarma|nespouštíme/i.test(checkout.slice(checkout.indexOf('doruceniHotovo'), checkout.indexOf('doruceniHotovo') + 600)),
    'holé 503 vypadá jako porucha, ne jako rozhodnutí');
  pravda('nedoručená platba se loguje jako CHYBA, ne jako běžný záznam',
    /console\.error\([^)]*doručení není hotové/.test(webhook.replace(/\s+/g, ' ')),
    'kdyby se sem platba přesto dostala, nesmí zapadnout mezi informační hlášky');
  pravda('a ve formuláři zůstává zvýraznění schované',
    /<div class="add-boost" hidden>/.test(formular),
    'nabízet ke koupi něco, co se nedá koupit, je horší než to nenabízet');
  pravda('vzor nastavení říká, kdy se smí otevřít',
    /ZVYRAZNENI_ZAPNUTO/.test(readFileSync(path.join(ROOT, '.env.example'), 'utf8')));
  /* Podmínky použití to slibují i slovy. Slib a kód musí padnout naráz:
     kdyby se checkout otevřel a tenhle odstavec zůstal, měl by web v
     podmínkách napsané „zaplatit ho nejde" o službě, která se prodává. */
  pravda('a podmínky použití to říkají i návštěvníkovi',
    /Zatím se neprodává/.test(podminky) && /zaplatit ho nejde/.test(podminky),
    'podminky.html musí říkat totéž co kód — jinak si každý přečte něco jiného');
} else {
  /* Až doručení bude: otevřít se smí, ale platba musí být dohledatelná. */
  pravda('když webhook doručuje, checkout smí být otevřený', true);
  pravda('ale podmínky použití už nesmí tvrdit, že se neprodává',
    !/Zatím se neprodává/.test(podminky),
    'zvýraznění se prodává, a podminky.html pořád slibují, že ne');
}

console.log('\nPlacené zvýraznění — za peníze se musí něco stát');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Platba: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
