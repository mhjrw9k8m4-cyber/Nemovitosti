// Zatřídí všech 1000 tříd, které model rozpoznává, do tří skupin
// a vypíše je do js/fotoskupiny.js.
//
// Proč to nestačí psát ručně: při ručním seznamu (asi 120 tříd) zbylo
// 880 tříd „neznámých", takže se fotka balíčku slaniny označená jako
// „oil filter" nebo „nipple" propustila. Tady dostane skupinu každá třída.
//
// Skupiny:
//   V … venku, krajina, zemědělství, rostliny, stavby v krajině
//       → mluví PRO to, že jde o fotku pozemku
//   N … jídlo, obaly, obrazovky a dokumenty, nábytek, spotřebiče, nářadí,
//       oblečení, elektronika → mluví PROTI
//   . … zvířata, vozidla, sport, budovy obecně, ostatní
//       → samo o sobě neříká nic (kráva na louce ani auto u plotu
//         nesmí fotku shodit)
//
// Spuštění: node scripts/build-skupiny.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TRIDY = createRequire(import.meta.url)(path.join(ROOT, 'js', 'tridy-imagenet.js'));

// --- ruční zařazení, které má přednost před vším ostatním ---------------
const VENKU_NAZVY = new Set([
  // krajina (v seznamu tříd bývá pohromadě na konci)
  'alp', 'cliff, drop, drop-off', 'coral reef', 'geyser', 'lakeside, lakeshore',
  'promontory, headland, head, foreland', 'sandbar, sand bar', 'seashore, coast, seacoast, sea-coast',
  'valley, vale', 'volcano',
  // zemědělství a stavby v krajině
  'barn', 'greenhouse, nursery, glasshouse', 'boathouse', 'hay', 'tractor', 'plow, plough',
  'thresher, thrasher, threshing machine', 'harvester, reaper', 'lawn mower, mower',
  'barrow, garden cart, lawn cart, wheelbarrow', 'picket fence, paling', 'chainlink fence',
  'worm fence, snake fence, snake-rail fence, Virginia fence', 'stone wall', 'dam, dike, dyke',
  'park bench', 'birdhouse', 'mountain tent', 'maze, labyrinth', 'sundial', 'swing',
  'beacon, lighthouse, beacon light, pharos', 'water tower', 'flagpole, flagstaff',
  'cliff dwelling', 'yurt', 'mobile home, manufactured home', 'triumphal arch', 'obelisk', 'totem pole',
  'viaduct', 'steel arch bridge', 'suspension bridge', 'pier', 'dock, dockage, docking facility',
  'castle', 'monastery', 'palace', 'church, church building', 'bell cote, bell cot',
  'stupa, tope', 'megalith, megalithic structure',
]);

const NE_NAZVY = new Set([
  // obrazovky a dokumenty
  'web site, website, internet site, site', 'screen, CRT screen', 'monitor', 'television, television system',
  'laptop, laptop computer', 'notebook, notebook computer', 'desktop computer', 'hand-held computer, hand-held microcomputer',
  'cellular telephone, cellular phone, cellphone, cell, mobile phone', 'envelope', 'menu', 'comic book',
  'crossword puzzle, crossword', 'book jacket, dust cover, dust jacket, dust wrapper', 'binder, ring-binder',
  'nipple', 'oil filter', 'hard disc, hard disk, fixed disk', 'loupe, jeweler\'s loupe', 'mousetrap',
  'cassette', 'cassette player', 'racket, racquet',
]);

// --- pravidla podle názvu třídy ----------------------------------------
const VENKU_SLOVA = [
  /\b(daisy|orchid|lady's slipper)\b/i, /\bfungus|agaric|bolete|earthstar|stinkhorn|gyromitra|hen-of-the-woods\b/i,
  /\b(acorn|buckeye|rose hip|rapeseed|corn|ear, spike)\b/i, /\bhip, rose hip\b/i,
  /\b(pot, flowerpot)\b/i,
];
const NE_SLOVA = [
  // jídlo a nápoje
  /\b(pizza|cheeseburger|hotdog|bagel|pretzel|ice cream|ice lolly|guacamole|meat loaf|potpie|burrito|carbonara|trifle|dough|French loaf|mashed potato|chocolate sauce|consomme|hot pot|plate|soup bowl|mixing bowl|measuring cup|espresso|eggnog|red wine|cup\b)/i,
  // obaly, obchod, kuchyně
  /\b(packet|plastic bag|carton|shopping basket|shopping cart|grocery store|butcher shop|bakery|confectionery|refrigerator|rotisserie|Dutch oven|frying pan|wok|caldron|coffeepot|teapot|tray|ladle|spatula|corkscrew|bottlecap|beer bottle|wine bottle|pop bottle|water bottle|pill bottle|beer glass|goblet|cocktail shaker|whiskey jug|milk can|pitcher|saltshaker|strainer|waffle iron|toaster|microwave|dishwasher|stove|rotisserie)/i,
  // nábytek, domácnost, koupelna
  /\b(dining table|desk|wardrobe|chiffonier|bookcase|china cabinet|entertainment center|studio couch|four-poster|crib|rocking chair|folding chair|barber chair|throne|toilet seat|bathtub|washbasin|shower curtain|shower cap|soap dispenser|paper towel|toilet tissue|bath towel|hamper|laundry|washer|vacuum|space heater|radiator|electric fan|lampshade|table lamp|candle|window shade|window screen|shoji|home theater|quilt|pillow|mosquito net|doormat|plate rack|medicine chest|file, file cabinet)/i,
  // oblečení a osobní věci
  /\b(jersey|sweatshirt|cardigan|suit, suit|military uniform|academic gown|bow tie|Windsor tie|necklace|brassiere|bikini|maillot|miniskirt|overskirt|hoopskirt|sarong|pajama|bathing cap|swimming trunks|diaper|mortarboard|wig|lab coat|kimono|abaya|poncho|trench coat|fur coat|jean|sock|Christmas stocking|running shoe|sandal|clog|cowboy boot|Loafer|handkerchief|sunglass|sunglasses|purse|wallet|backpack|mailbag|handbag|lipstick|hair spray|face powder|perfume|band aid|pick, plectrum)/i,
  // elektronika, nářadí, kancelář
  /\b(iPod|remote control|joystick|mouse, computer|computer keyboard|typewriter keyboard|printer|photocopier|scanner|modem|projector|loudspeaker|microphone|headphone|CD player|tape player|radio|digital clock|digital watch|stopwatch|analog clock|wall clock|hourglass|power drill|screwdriver|hammer|chain saw|hatchet|plane, carpenter|can opener|letter opener|scissors|safety pin|rubber eraser|ballpoint|fountain pen|pencil box|pencil sharpener|paper clip|rule, ruler|slide rule|abacus|calculator|stapler|thimble|syringe|stethoscope|scale, weighing|switch, electric|electrical outlet|light bulb|flashlight|candle|spotlight|torch)/i,
];

/* Třídy, které pravidla podle názvu zařadí špatně — slovo v názvu znamená
   něco jiného, než se zdá. „Cardigan" je plemeno psa, ne svetr; „hammerhead"
   je žralok, ne kladivo; „acorn squash" je dýně, ne žalud. */
const NEUTRALNI_NAZVY = new Set([
  'hammerhead, hammerhead shark',       // žralok, ne kladivo
  'Cardigan, Cardigan Welsh corgi',     // pes, ne svetr
  'grille, radiator grille',            // maska auta, ne radiátor
  'radio telescope, radio reflector',   // hvězdárna, ne rádio
  'warplane, military plane',           // letadlo, ne hoblík
  'planetarium',
  'pickup, pickup truck',               // auto, ne trsátko
  'pickelhaube',                        // přilba
]);
const JAKO_JIDLO = new Set(['acorn squash']);   // dýně, ne žalud

const skupiny = TRIDY.map((nazev, i) => {
  if (VENKU_NAZVY.has(nazev)) return 'V';
  if (NE_NAZVY.has(nazev)) return 'N';
  if (NEUTRALNI_NAZVY.has(nazev)) return '.';
  if (JAKO_JIDLO.has(nazev)) return 'N';
  for (const re of VENKU_SLOVA) if (re.test(nazev)) return 'V';
  for (const re of NE_SLOVA) if (re.test(nazev)) return 'N';
  return '.';
});

// --- výpis pro kontrolu člověkem ---------------------------------------
const pocty = skupiny.reduce((a, s) => ((a[s] = (a[s] || 0) + 1), a), {});
console.log(`Zatříděno: venku ${pocty.V || 0} · proti ${pocty.N || 0} · neutrální ${pocty['.'] || 0} (celkem ${TRIDY.length})`);

if (process.argv.includes('--vypis')) {
  for (const [kod, popis] of [['V', 'VENKU'], ['N', 'PROTI']]) {
    console.log(`\n=== ${popis} ===`);
    console.log(TRIDY.filter((_, i) => skupiny[i] === kod).map((x) => x.split(',')[0]).join(', '));
  }
  if (process.argv.includes('--neutralni')) {
    console.log('\n=== NEUTRÁLNÍ (ani pro, ani proti) ===');
    console.log(TRIDY.filter((_, i) => skupiny[i] === '.').map((x) => x.split(',')[0]).join(', '));
  }
}

const obsah = `/* Zatřídění 1000 tříd modelu do skupin — jeden znak na třídu:
     V = venku (mluví PRO fotku pozemku)
     N = jídlo, obaly, obrazovky, nábytek, oblečení, nářadí (mluví PROTI)
     . = zvířata, vozidla, budovy, sport a ostatní (neříká nic)

   NEUPRAVUJ RUČNĚ — vzniká příkazem:  node scripts/build-skupiny.mjs
   Kontrolní výpis skupin:             node scripts/build-skupiny.mjs --vypis */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKSkupiny = api;
})(typeof self !== 'undefined' ? self : this, function () {
  return '${skupiny.join('')}';
});
`;
fs.writeFileSync(path.join(ROOT, 'js', 'fotoskupiny.js'), obsah);
console.log('Zapsáno do js/fotoskupiny.js');
