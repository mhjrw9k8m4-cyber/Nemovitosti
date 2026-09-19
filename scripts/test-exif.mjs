// Testy čtení EXIFu (js/exif.js) a pravidel, která z něj plynou.
//
// Testovací fotky do repozitáře nedáváme — místo toho si tady poskládáme
// JPEG hlavičku bajt po bajtu. Je to přesnější: víme, co přesně v ní je,
// a test nezávisí na tom, čím kdo kdy fotil.
//
// Spuštění: node scripts/test-exif.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const E = require_(path.join(ROOT, 'js', 'exif.js'));
const K = require_(path.join(ROOT, 'js', 'kontrola.js'));

let bezi = 0, spadlo = 0;
function tvrdi(popis, podminka, detail) {
  bezi++;
  if (!podminka) { spadlo++; console.log(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

/* ---------- skládání zkušebního JPEGu ---------- */

// Jedna položka IFD (12 bajtů): značka, typ, počet, hodnota/odkaz
function polozka(znacka, typ, pocet, hodnota) {
  const b = Buffer.alloc(12);
  b.writeUInt16LE(znacka, 0);
  b.writeUInt16LE(typ, 2);
  b.writeUInt32LE(pocet, 4);
  b.writeUInt32LE(hodnota, 8);
  return b;
}

/* Poskládá JPEG s EXIFem. Rozvržení držíme jednoduché: IFD0 hned za TIFF
   hlavičkou, za ním Exif IFD, GPS IFD a nakonec všechna delší data. */
function jpegSExifem({ znacka, model, datum, lat, lng, software }) {
  const data = [];            // delší hodnoty (texty, zlomky) za tabulkami
  let dataOffset = 0;
  const pridejText = (s) => {
    const buf = Buffer.from(s + '\0', 'latin1');
    const off = dataOffset;
    data.push(buf); dataOffset += buf.length;
    return off;
  };
  const pridejZlomky = (cisla) => {              // stupně, minuty, vteřiny
    const buf = Buffer.alloc(cisla.length * 8);
    cisla.forEach(([c, j], i) => { buf.writeUInt32LE(c, i * 8); buf.writeUInt32LE(j, i * 8 + 4); });
    const off = dataOffset;
    data.push(buf); dataOffset += buf.length;
    return off;
  };

  const ifd0 = [], exifIfd = [], gpsIfd = [];
  const textOdkazy = [];      // {buffer, indexPolozky, ktereIFD} — offsety dopočítáme

  // připravíme hodnoty, offsety opravíme až budeme znát rozvržení
  const naText = (s) => ({ typ: 2, pocet: s.length + 1, off: pridejText(s) });

  const znackaV = znacka ? naText(znacka) : null;
  const modelV = model ? naText(model) : null;
  const swV = software ? naText(software) : null;
  const datumV = datum ? naText(datum) : null;

  const naDms = (st) => {
    const a = Math.floor(Math.abs(st));
    const m = Math.floor((Math.abs(st) - a) * 60);
    const sec = Math.round(((Math.abs(st) - a) * 60 - m) * 60 * 100);
    return [[a, 1], [m, 1], [sec, 100]];
  };
  const latV = lat != null ? { off: pridejZlomky(naDms(lat)) } : null;
  const lngV = lng != null ? { off: pridejZlomky(naDms(lng)) } : null;
  const latRefV = lat != null ? naText(lat >= 0 ? 'N' : 'S') : null;
  const lngRefV = lng != null ? naText(lng >= 0 ? 'E' : 'W') : null;

  // velikosti tabulek
  const pocetIfd0 = (znackaV ? 1 : 0) + (modelV ? 1 : 0) + (swV ? 1 : 0) + (datumV ? 1 : 0) + (lat != null ? 1 : 0);
  const pocetExif = datumV ? 1 : 0;
  const pocetGps = lat != null ? 4 : 0;

  const velIfd0 = 2 + pocetIfd0 * 12 + 4;
  const velExif = pocetExif ? 2 + pocetExif * 12 + 4 : 0;
  const velGps = pocetGps ? 2 + pocetGps * 12 + 4 : 0;

  const ifd0Off = 8;                       // hned za TIFF hlavičkou
  const exifOff = ifd0Off + velIfd0;
  const gpsOff = exifOff + velExif;
  const dataOff = gpsOff + velGps;

  if (znackaV) ifd0.push(polozka(0x010F, 2, znackaV.pocet, dataOff + znackaV.off));
  if (modelV) ifd0.push(polozka(0x0110, 2, modelV.pocet, dataOff + modelV.off));
  if (swV) ifd0.push(polozka(0x0131, 2, swV.pocet, dataOff + swV.off));
  if (datumV) ifd0.push(polozka(0x8769, 4, 1, exifOff));      // odkaz na Exif IFD
  if (lat != null) ifd0.push(polozka(0x8825, 4, 1, gpsOff));  // odkaz na GPS IFD

  if (datumV) exifIfd.push(polozka(0x9003, 2, datumV.pocet, dataOff + datumV.off));

  if (lat != null) {
    gpsIfd.push(polozka(1, 2, 2, dataOff + latRefV.off));
    gpsIfd.push(polozka(2, 5, 3, dataOff + latV.off));
    gpsIfd.push(polozka(3, 2, 2, dataOff + lngRefV.off));
    gpsIfd.push(polozka(4, 5, 3, dataOff + lngV.off));
  }

  const tabulka = (polozky) => {
    if (!polozky.length) return Buffer.alloc(0);
    const hlava = Buffer.alloc(2); hlava.writeUInt16LE(polozky.length, 0);
    return Buffer.concat([hlava, ...polozky, Buffer.alloc(4)]);
  };

  const tiff = Buffer.concat([
    Buffer.from([0x49, 0x49, 0x2A, 0x00]),                       // „II", 42
    (() => { const b = Buffer.alloc(4); b.writeUInt32LE(ifd0Off, 0); return b; })(),
    tabulka(ifd0), tabulka(exifIfd), tabulka(gpsIfd), ...data
  ]);

  const app1Telo = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const delka = Buffer.alloc(2); delka.writeUInt16BE(app1Telo.length + 2, 0);
  return Buffer.concat([
    Buffer.from([0xFF, 0xD8]),                 // začátek JPEGu
    Buffer.from([0xFF, 0xE1]), delka, app1Telo,
    Buffer.from([0xFF, 0xD9])                  // konec
  ]);
}

const naArrayBuffer = (b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);

/* ---------- čtení ---------- */

const fotkaZMobilu = E.zBuferu(naArrayBuffer(jpegSExifem({
  znacka: 'Apple', model: 'iPhone 15', datum: '2026:09:18 14:03:22', lat: 50.0755, lng: 14.4378
})));
tvrdi('pozná, že fotka EXIF má', fotkaZMobilu.maEXIF === true, JSON.stringify(fotkaZMobilu));
tvrdi('přečte značku přístroje', fotkaZMobilu.znacka === 'Apple', 'vyšlo: ' + fotkaZMobilu.znacka);
tvrdi('přečte model', fotkaZMobilu.model === 'iPhone 15', 'vyšlo: ' + fotkaZMobilu.model);
tvrdi('přečte čas pořízení', fotkaZMobilu.datum === '2026:09:18 14:03:22', 'vyšlo: ' + fotkaZMobilu.datum);
tvrdi('přečte zeměpisnou šířku (Praha ≈ 50,0755)',
  Math.abs((fotkaZMobilu.lat || 0) - 50.0755) < 0.01, 'vyšlo: ' + fotkaZMobilu.lat);
tvrdi('přečte zeměpisnou délku (Praha ≈ 14,4378)',
  Math.abs((fotkaZMobilu.lng || 0) - 14.4378) < 0.01, 'vyšlo: ' + fotkaZMobilu.lng);

const bezGps = E.zBuferu(naArrayBuffer(jpegSExifem({ znacka: 'Samsung', model: 'SM-S911B', datum: '2026:05:01 09:10:11' })));
tvrdi('zvládne fotku bez souřadnic', bezGps.maEXIF && bezGps.lat === undefined, JSON.stringify(bezGps));

const prazdny = E.zBuferu(naArrayBuffer(Buffer.from([0xFF, 0xD8, 0xFF, 0xD9])));
tvrdi('JPEG bez EXIFu → maEXIF false', prazdny.maEXIF === false, JSON.stringify(prazdny));

const nesmysl = E.zBuferu(naArrayBuffer(Buffer.from('tohle vůbec není obrázek')));
tvrdi('nesmyslná data nevyhodí výjimku', nesmysl.maEXIF === false);

// Uříznutý soubor: hlavičku „Exif" v sobě má, ale tabulka za ní chybí.
// Nejde o to, aby vyšlo maEXIF false — jde o to, že se čtení nezhroutí
// a nevrátí vymyšlené údaje.
const usekly = E.zBuferu(naArrayBuffer(jpegSExifem({ znacka: 'Apple', model: 'iPhone 15' }).subarray(0, 20)));
tvrdi('uříznutý soubor nevyhodí výjimku a nevymyslí si údaje',
  usekly && typeof usekly === 'object' && !usekly.znacka && !usekly.model && usekly.lat === undefined,
  JSON.stringify(usekly));

/* ---------- vzdálenost ---------- */
const praha = [50.0755, 14.4378], brno = [49.1951, 16.6068];
const km = E.vzdalenostKm(praha[0], praha[1], brno[0], brno[1]);
tvrdi('Praha–Brno vyjde kolem 185 km', km > 175 && km < 195, 'vyšlo: ' + Math.round(km) + ' km');
tvrdi('stejný bod → nula', Math.round(E.vzdalenostKm(50, 15, 50, 15)) === 0);
tvrdi('chybějící souřadnice → null', E.vzdalenostKm(50, 15, null, 15) === null);

/* ---------- pravidla nad EXIFem ---------- */
tvrdi('běžná fotka z mobilu projde', K.fotkaPuvod(fotkaZMobilu, 'image/jpeg', 4032, 3024).ok === true);
tvrdi('fotka bez EXIFu projde (messenger je maže)', K.fotkaPuvod({ maEXIF: false }, 'image/jpeg', 1600, 1200).ok === true);
tvrdi('snímek obrazovky z iPhonu neprojde',
  K.fotkaPuvod({ maEXIF: false }, 'image/png', 1170, 2532).ok === false,
  JSON.stringify(K.fotkaPuvod({ maEXIF: false }, 'image/png', 1170, 2532)));
tvrdi('snímek obrazovky hlášený v poli Software neprojde',
  K.fotkaPuvod({ maEXIF: true, software: 'Screenshot' }, 'image/jpeg', 1000, 800).ok === false);
tvrdi('čas pořízení v budoucnosti neprojde',
  K.fotkaPuvod({ maEXIF: true, datum: '2030:01:01 10:00:00' }, 'image/jpeg', 2000, 1500).ok === false);
const stara = K.fotkaPuvod({ maEXIF: true, datum: '2009:06:01 10:00:00' }, 'image/jpeg', 2000, 1500);
tvrdi('fotka starší deseti let projde s upozorněním', stara.ok === true && !!stara.varovani, JSON.stringify(stara));

tvrdi('fotka z místa pozemku projde', K.fotkaMisto(3).ok === true);
tvrdi('fotka 40 km daleko projde s upozorněním', K.fotkaMisto(40).ok === true && !!K.fotkaMisto(40).varovani);
tvrdi('fotka 300 km daleko neprojde', K.fotkaMisto(300).ok === false);
tvrdi('fotka bez souřadnic se neřeší', K.fotkaMisto(null).ok === true && !K.fotkaMisto(null).varovani);

console.log(`\nEXIF a původ fotek: ${bezi} testů`);
if (spadlo) { console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`); process.exit(1); }
console.log('Všechny prošly.\n');
