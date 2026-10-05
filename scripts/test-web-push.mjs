/* Test: šifrování push zpráv sedí s referenční implementací.
   ==================================================================
   Spuštění: node scripts/test-web-push.mjs

   scripts/web-push.mjs skládá push zprávu podle RFC 8291 (šifrování)
   a RFC 8292 (VAPID) z vestavěného node:crypto, aby do repozitáře
   nemusel balíček web-push a jeho sedmnáct závislostí. Riziko je
   zřejmé: kdybych v odvozování klíčů přehodil jediný krok, vyrobí to
   dál „nějaké" zašifrované tělo — a prohlížeč ho jen tiše neotevře.
   Nikdo by se o tom nedozvěděl, dokud by si někdo nestěžoval, že mu
   upozornění nechodí.

   PROTO ZAPSANÝ VZOREK. Tělo níž NEVYROBIL tenhle kód: vyrobil ho
   balíček web-push 3.x (referenční implementace, na které stojí většina
   serverů) a je tu uložený tak, jak ho vydal. Test ho rozšifruje tímhle
   kódem a musí z něj vyjít původní text. Když se odvozování klíčů
   rozejde, nevyjde — a to je ta jediná vlastnost, na které tady záleží.

   Dvojice klíčů ve vzorku je vyrobená jen pro test a nikdy nikde
   nesloužila, takže na jejím zveřejnění nic nezáleží.
   ================================================================== */
import crypto from 'node:crypto';
import { zasifruj, rozsifruj, hlavicky, posli } from './web-push.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
/* Rozšifrování vyhazuje, když se odvozování klíčů rozejde — a to je
   přesně to, co se tady zkouší. Bez tohohle obalu spadne celý test
   bez výpisu, takže se ze CI nedá poznat, KTERÁ kontrola selhala.
   Spadlý test se pozná hůř než červený. */
function zkus(f) {
  try { return f(); } catch (e) { return 'CHYBA: ' + (e && e.message ? e.message : String(e)); }
}
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

/* ---- VZOREK OD REFERENČNÍ IMPLEMENTACE (balíček web-push 3.x) ---- */
const VZOREK = {
  p256dh: "BACNr8ai61YdzxLJ4C5HE8stBf5jHXsPYERzswGPH8bwmeHOza4MXoiVAu-VGzHCGsMde6Av1EVA2ZDYDcs-ZVs",
  privatni: "BTOEoRnwY-Ini1NQfI5_M5oJKtiBXL50DCrX_i_2rww",
  auth: "F1vQLoQFfd7H-0IH_YPUSg",
  text: "Parcelka: nový pozemek v okrese Benešov — 2 400 m², 240 Kč/m². Příšerně dlouhý text, aby se ověřilo i to, že se do jednoho záznamu vejde víc než pár bajtů: ěščřžýáíé ĚŠČŘŽÝÁÍÉ ůúňťď 0123456789.",
  telo: "bI50S0tuN7TU3nwgOTW2CQAAEABBBCBvoxHnk9gjb8xef+hBgyxAp7ueS2CVOJsTCf6cylX6fRaul87Okd2q79QZW18+954qcIglMH9zmqFlx7zlLsll7Pue3FPBupe5xTyYFD7bSOyP9hStGlYAqn2f6ld2f4ljGUyFxdys58vn4LMDgKjcQ+/lZ2yF1du87DPzfZ0zDGf20r8aVjBj4ch5MmE0MVLVR48Tr0P/CBZwvwmfmviSH7ruPglq/e+KzoF7j1H+Vgz94nK+dnkYFfcbtjyiEBECwL1krUaWDxyF6tb2mhp/QvuybGgLrgRgjgyCuzjuW8w7XzKVoVNDVsjCmt4Yd9BSk+QySi34o3fEy+Zi4RLltX9IR4z7nudH4Y+zT5BVjuskqghZRl9RHiawe3dysFNw9xteEALQiifXQ3M8gWC4GvmAK+wnXhRPvDv4"
};

{
  const telo = Buffer.from(VZOREK.telo, 'base64');
  pravda('vzorek od referenční implementace je na místě', telo.length > 60, `${telo.length} B`);
  je('rozšifruje se z něj PŘESNĚ původní text',
    zkus(() => rozsifruj(telo, VZOREK.privatni, VZOREK.auth)), VZOREK.text);
}

/* ---- Tvar těla podle RFC 8188 ---- */
{
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const p256dh = e.getPublicKey().toString('base64url');
  const auth = crypto.randomBytes(16).toString('base64url');
  const telo = zasifruj('zkouška', p256dh, auth);
  je('velikost záznamu v hlavičce je 4096', telo.readUInt32BE(16), 4096);
  je('délka klíče v hlavičce je 65', telo[20], 65);
  je('a klíč začíná bajtem 0x04 (nekomprimovaný P-256)', telo[21], 4);
  /* 16 sůl + 4 velikost + 1 délka + 65 klíč + text + 1 oddělovač + 16 značka */
  je('tělo má přesně očekávanou délku', telo.length, 16 + 4 + 1 + 65 + Buffer.byteLength('zkouška') + 1 + 16);
  je('a rozšifruje se zpátky', zkus(() => rozsifruj(telo, e.getPrivateKey().toString('base64url'), auth)), 'zkouška');
}

/* ---- Nesmí se dát rozšifrovat cizím klíčem ---- */
{
  const a = crypto.createECDH('prime256v1'); a.generateKeys();
  const b = crypto.createECDH('prime256v1'); b.generateKeys();
  const auth = crypto.randomBytes(16).toString('base64url');
  const telo = zasifruj('tajné', a.getPublicKey().toString('base64url'), auth);
  let selhalo = false;
  try { rozsifruj(telo, b.getPrivateKey().toString('base64url'), auth); } catch (e) { selhalo = true; }
  pravda('zpráva se nedá rozšifrovat klíčem někoho jiného', selhalo,
    'rozšifrovala se — pak se nešifruje pro konkrétního odběratele');
  let selhaloAuth = false;
  try { rozsifruj(telo, a.getPrivateKey().toString('base64url'), crypto.randomBytes(16).toString('base64url')); }
  catch (e) { selhaloAuth = true; }
  pravda('ani se správným klíčem, ale cizím tajemstvím', selhaloAuth, 'rozšifrovala se');
}

/* ---- Špatný vstup se musí poznat hned, ne až u push služby ---- */
{
  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const auth = crypto.randomBytes(16).toString('base64url');
  let chyba = '';
  try { zasifruj('x', 'kratky', auth); } catch (err) { chyba = String(err); }
  pravda('krátký p256dh se odmítne s vysvětlením', /65/.test(chyba), chyba || 'neodmítl se');
  chyba = '';
  try { zasifruj('x', e.getPublicKey().toString('base64url'), 'kratke'); } catch (err) { chyba = String(err); }
  pravda('krátké auth taky', /16/.test(chyba), chyba || 'neodmítlo se');
}

/* ---- VAPID (RFC 8292) ---- */
{
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const verejny = Buffer.concat([Buffer.from([4]),
    Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url');
  const privatni = Buffer.from(pair.privateKey.export({ format: 'jwk' }).d, 'base64url').toString('base64url');

  const h = hlavicky('https://fcm.googleapis.com/fcm/send/abc', verejny, privatni, 'mailto:a@b.cz');
  pravda('hlavička Authorization je ve tvaru vapid t=…, k=…', /^vapid t=[\w-]+\.[\w-]+\.[\w-]+, k=[\w-]+$/.test(h.Authorization), h.Authorization);
  je('kódování obsahu je aes128gcm', h['Content-Encoding'], 'aes128gcm');

  const jwt = /t=([^,]+)/.exec(h.Authorization)[1];
  const [hlava, telo, podpis] = jwt.split('.');
  const nalozeni = JSON.parse(Buffer.from(telo, 'base64url'));
  je('příjemce tokenu je PŮVOD push služby, ne celá adresa', nalozeni.aud, 'https://fcm.googleapis.com');
  je('a předmět je ten zadaný', nalozeni.sub, 'mailto:a@b.cz');
  pravda('platnost je v budoucnosti a do 24 hodin (víc push služby odmítají)',
    nalozeni.exp > Math.floor(Date.now() / 1000) && nalozeni.exp <= Math.floor(Date.now() / 1000) + 86400,
    `exp za ${nalozeni.exp - Math.floor(Date.now() / 1000)} s`);
  je('algoritmus je ES256', JSON.parse(Buffer.from(hlava, 'base64url')).alg, 'ES256');

  /* Podpis musí jít ověřit VEŘEJNÝM klíčem — jinak by token žádná push
     služba nepřijala. Podpis je v JWT surový (r||s), node chce DER. */
  const raw = Buffer.from(podpis, 'base64url');
  je('podpis má 64 bajtů (r a s po 32)', raw.length, 64);
  const derInt = (b) => {
    let v = b;
    while (v.length > 1 && v[0] === 0) v = v.subarray(1);
    if (v[0] & 0x80) v = Buffer.concat([Buffer.from([0]), v]);
    return Buffer.concat([Buffer.from([0x02, v.length]), v]);
  };
  const r = derInt(raw.subarray(0, 32)), s = derInt(raw.subarray(32));
  const der = Buffer.concat([Buffer.from([0x30, r.length + s.length]), r, s]);
  pravda('a dá se ověřit veřejným klíčem VAPID',
    crypto.verify('sha256', Buffer.from(`${hlava}.${telo}`), { key: pair.publicKey, dsaEncoding: 'der' }, der),
    'ověření neprošlo — push služba by token odmítla');
}

/* ---- CELÁ CESTA: posli() proti vlastnímu serveru ----
   Šifrování i token mohou být správné a odeslání přesto rozbité —
   špatná metoda, chybějící hlavička, zahozené tělo. Tady stojí
   nefalšovaná push služba na localhostu: přijme POST, a test si
   zkontroluje, co jí doopravdy přišlo, a rozšifruje to. */
{
  const http = await import('node:http');
  const prijato = [];
  const server = http.createServer((req, res) => {
    const kusy = [];
    req.on('data', (c) => kusy.push(c));
    req.on('end', () => {
      prijato.push({ metoda: req.method, hlavicky: req.headers, telo: Buffer.concat(kusy) });
      /* Poslední odběr dostane 410, aby se ověřilo i poznání zaniklého. */
      res.writeHead(prijato.length >= 2 ? 410 : 201).end();
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;

  const e = crypto.createECDH('prime256v1'); e.generateKeys();
  const odber = {
    endpoint: `http://127.0.0.1:${port}/push/abc`,
    p256dh: e.getPublicKey().toString('base64url'),
    auth: crypto.randomBytes(16).toString('base64url')
  };
  const pair = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = pair.publicKey.export({ format: 'jwk' });
  const klice = {
    verejny: Buffer.concat([Buffer.from([4]), Buffer.from(jwk.x, 'base64url'), Buffer.from(jwk.y, 'base64url')]).toString('base64url'),
    privatni: Buffer.from(pair.privateKey.export({ format: 'jwk' }).d, 'base64url').toString('base64url'),
    subject: 'mailto:test@parcelaka.cz'
  };
  const obsah = JSON.stringify({ nadpis: 'Nový pozemek v hlídání', text: 'Benešov 240 Kč/m²', odkaz: 'upozorneni.html' });

  const prvni = await posli(odber, obsah, klice);
  je('push služba dostala 1 požadavek', prijato.length, 1);
  je('a byl to POST', prijato[0].metoda, 'POST');
  je('stav se vrací, jak přišel', prvni.stav, 201);
  je('a 201 neznamená zaniklý odběr', prvni.pryc, false);
  je('hlavička Content-Encoding je aes128gcm', prijato[0].hlavicky['content-encoding'], 'aes128gcm');
  pravda('hlavička Authorization nese token VAPID', /^vapid t=/.test(prijato[0].hlavicky.authorization || ''),
    prijato[0].hlavicky.authorization);
  pravda('TTL je nastavené (bez něj push služby zprávu zahodí)', !!prijato[0].hlavicky.ttl,
    'chybí hlavička TTL');
  je('a tělo se rozšifruje na to, co se posílalo',
    zkus(() => rozsifruj(prijato[0].telo, e.getPrivateKey().toString('base64url'), odber.auth)), obsah);

  const druhy = await posli(odber, obsah, klice);
  je('odpověď 410 se pozná jako zaniklý odběr', druhy.pryc, true);
  je('a stav se vrací', druhy.stav, 410);
  await new Promise((r) => server.close(r));
}

/* ---- Text upozornění ----
   Na uzamčené obrazovce je vidět jeden řádek nadpisu a dva řádky textu.
   „Máte 3 nové pozemky" je k ničemu — podle toho se nedá rozhodnout,
   jestli se na to teď podívat. */
{
  const { zprava } = await import('./send-push.mjs');
  const jedna = zprava({ label: 'Benešov do 300', hledani_id: 'h1' },
    [{ place: 'Bystřice', price: 480000, area: 2000 }]);
  je('u jednoho pozemku je nadpis v jednotném čísle', jedna.nadpis, 'Nový pozemek v hlídání');
  pravda('v textu je obec i cena za metr', /Bystřice 240 Kč\/m²/.test(jedna.text), jedna.text);
  pravda('a jméno hledání', /^Benešov do 300: /.test(jedna.text), jedna.text);
  je('značka je id hledání (aby se upozornění slučovala)', jedna.znacka, 'h1');

  const pet = zprava({ label: 'Pole', hledani_id: 'h2' }, [
    { place: 'A', price: 100, area: 10 }, { place: 'B', price: 200, area: 10 },
    { place: 'C', price: 300, area: 10 }, { place: 'D', price: 400, area: 10 },
    { place: 'E', price: 500, area: 10 }]);
  je('u pěti je nadpis v množném čísle s počtem', pet.nadpis, '5 nových pozemků v hlídání');
  pravda('vypíšou se tři a zbytek se sečte', /A 10 Kč\/m² · B 20 Kč\/m² · C 30 Kč\/m² a 2 dalších/.test(pet.text), pet.text);
  pravda('čtvrtý a pátý se do textu nedostanou', !/ D | E /.test(pet.text), pet.text);

  const bezCeny = zprava({ hledani_id: 'h3' }, [{ place: 'Lhota', price: 0, area: 0 }]);
  pravda('bez ceny se cena netvrdí', /Lhota/.test(bezCeny.text) && !/Kč/.test(bezCeny.text), bezCeny.text);
}

console.log('Šifrování push zpráv (RFC 8291) a VAPID (RFC 8292)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb`);
if (chyb) console.log('::error::Push zprávy: kontroly neprošly.');
process.exit(chyb ? 1 : 0);
