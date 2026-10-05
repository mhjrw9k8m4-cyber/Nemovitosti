/* ODESÍLÁNÍ PUSH ZPRÁV (Web Push) — bez závislostí.
   ==================================================================
   Používá scripts/send-alerts.mjs. Prohlížeč na druhé straně to čte
   přes service worker (sw.js, obsluha události „push").

   PROČ VLASTNÍ, A NE BALÍČEK. Balíček web-push by do repozitáře, který
   má dvě závislosti, přitáhl sedmnáct dalších. Žádná kryptografie se tu
   přitom nepíše: HMAC, HKDF, ECDH i AES-GCM dělá vestavěné node:crypto.
   Tenhle soubor je jen SKLÁDÁNÍ podle dvou norem:

     RFC 8291 — Message Encryption for Web Push
     RFC 8292 — VAPID (čím se server u push služby legitimuje)

   ŽE TO SKLÁDÁNÍ JE SPRÁVNÉ, se neověřuje tím, že si to přečtu znovu.
   scripts/test-web-push.mjs obsahuje zapsaný vzorek vyrobený
   REFERENČNÍ implementací (balíčkem web-push 3.x): dvojici klíčů
   příjemce, tajemství, text zprávy a hotové zašifrované tělo. Test ho
   rozšifruje touhle implementací a musí z něj vyjít původní text. Kdyby
   se tady kterýkoli krok odvozování klíčů lišil, nevyjde.

   ------------------------------------------------------------------
   JAK TO CELÉ ZAPADÁ DO SEBE

   1. Server má jednu dvojici klíčů VAPID (P-256). Veřejný zná
      i prohlížeč — bez něj se nedá odebírat. Privátní je tajemství
      a patří do secrets repozitáře, NE do souboru ve webu.
   2. Prohlížeč vrátí „subscription": adresu push služby (endpoint)
      a dva klíče — p256dh (veřejný klíč příjemce) a auth (tajemství).
   3. Zpráva se zašifruje pro TOHO příjemce (RFC 8291). Push služba
      obsah nevidí; vidí jen adresu a velikost.
   4. K požadavku se přiloží podepsaný token VAPID (RFC 8292), kterým
      se server přihlásí k tomu, že zprávu posílá on.
   ================================================================== */
import crypto from 'node:crypto';

const b64url = (b) => Buffer.from(b).toString('base64url');
const zb64url = (s) => Buffer.from(String(s), 'base64url');

/* P-256 veřejný klíč se v Web Pushi posílá v „nekomprimované" podobě:
   jeden bajt 0x04 a za ním X a Y po 32 bajtech. node:crypto umí tenhle
   formát přímo ('uncompressed'). */
function verejnyZeKlice(kdp) {
  return kdp.getPublicKey(); // Buffer, 65 B, začíná 0x04
}

function hmac(klic, data) {
  return crypto.createHmac('sha256', klic).update(data).digest();
}
/* HKDF v podobě, ve které ho RFC 8291 používá: extract a jeden krok
   expand (delší výstup než 32 B se tu nikde nepotřebuje). */
function hkdf(sul, ikm, info, delka) {
  const prk = hmac(sul, ikm);
  return hmac(prk, Buffer.concat([Buffer.from(info), Buffer.from([1])])).subarray(0, delka);
}

/* Odvození klíče obsahu a nonce podle RFC 8291 §3.4.
 *
 * JE TU JEDNOU, ZÁMĚRNĚ. Napoprvé jsem tentýž postup napsal dvakrát —
 * raz v šifrování, raz v rozšifrování. Vypadalo to nevinně, ale měřilo
 * to méně, než se zdálo: zapsaný vzorek od referenční implementace
 * kontroluje jen tu kopii, která se používá při ROZŠIFROVÁNÍ. Když jsem
 * do té druhé pro zkoušku přehodil pořadí klíčů v „key_info", vzorek
 * prošel dál a chybu zachytilo jen zpětné rozšifrování vlastní zprávy —
 * tedy kontrola, která by přežila i to, kdyby se obě kopie mýlily stejně.
 * Teď je postup jeden: co ověří vzorek, platí pro obě strany.
 *
 * Pořadí klíčů v „key_info" se nesmí přehodit — útočníkovi to nedá nic,
 * ale prohlížeč zprávu neotevře a nikdo se nedozví proč. */
function odvod(spolecne, verejnyPrijemce, verejnyOdesilatel, tajemstvi, sul) {
  const keyInfo = Buffer.concat([
    Buffer.from('WebPush: info\0'), verejnyPrijemce, verejnyOdesilatel
  ]);
  const ikm = hkdf(tajemstvi, spolecne, keyInfo, 32);
  return {
    cek: hkdf(sul, ikm, 'Content-Encoding: aes128gcm\0', 16),
    nonce: hkdf(sul, ikm, 'Content-Encoding: nonce\0', 12)
  };
}

/** Zašifruje text pro jednoho odběratele. Vrací tělo požadavku (Buffer). */
export function zasifruj(text, p256dh, auth, volby) {
  const verejnyPrijemce = zb64url(p256dh);
  const tajemstvi = zb64url(auth);
  if (verejnyPrijemce.length !== 65) throw new Error(`p256dh má ${verejnyPrijemce.length} B, čekáno 65`);
  if (tajemstvi.length !== 16) throw new Error(`auth má ${tajemstvi.length} B, čekáno 16`);

  /* Sůl i efemérní klíč jsou náhodné při každém odeslání. Pro test se
     dají předat, aby šel výsledek porovnat s uloženým vzorkem. */
  const sul = (volby && volby.sul) || crypto.randomBytes(16);
  const ecdh = crypto.createECDH('prime256v1');
  if (volby && volby.efemerni) ecdh.setPrivateKey(volby.efemerni);
  else ecdh.generateKeys();
  const verejnyOdesilatel = verejnyZeKlice(ecdh);

  const { cek, nonce } = odvod(ecdh.computeSecret(verejnyPrijemce),
    verejnyPrijemce, verejnyOdesilatel, tajemstvi, sul);

  /* Oddělovač konce záznamu je 0x02 u POSLEDNÍHO (a tady jediného)
     záznamu. S 0x01 to prohlížeč odmítne. */
  const otevreny = Buffer.concat([Buffer.from(text, 'utf8'), Buffer.from([2])]);
  const sifra = crypto.createCipheriv('aes-128-gcm', cek, nonce);
  const telo = Buffer.concat([sifra.update(otevreny), sifra.final(), sifra.getAuthTag()]);

  /* Hlavička podle RFC 8188: sůl, velikost záznamu, délka klíče, klíč. */
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096, 0);
  return Buffer.concat([sul, rs, Buffer.from([verejnyOdesilatel.length]), verejnyOdesilatel, telo]);
}

/** Rozšifruje tělo — jen pro test (prohlížeč to dělá sám). */
export function rozsifruj(telo, privatniPrijemce, auth) {
  const sul = telo.subarray(0, 16);
  const idlen = telo[20];
  const verejnyOdesilatel = telo.subarray(21, 21 + idlen);
  const sifrovane = telo.subarray(21 + idlen);

  const ecdh = crypto.createECDH('prime256v1');
  ecdh.setPrivateKey(zb64url(privatniPrijemce));
  const verejnyPrijemce = verejnyZeKlice(ecdh);
  const { cek, nonce } = odvod(ecdh.computeSecret(verejnyOdesilatel),
    verejnyPrijemce, verejnyOdesilatel, zb64url(auth), sul);

  const tag = sifrovane.subarray(sifrovane.length - 16);
  const desifra = crypto.createDecipheriv('aes-128-gcm', cek, nonce);
  desifra.setAuthTag(tag);
  const out = Buffer.concat([desifra.update(sifrovane.subarray(0, sifrovane.length - 16)), desifra.final()]);
  /* Odřízne se oddělovač konce záznamu i případné vycpávky nulami. */
  let i = out.length - 1;
  while (i >= 0 && out[i] === 0) i--;
  if (i < 0 || out[i] !== 2) throw new Error('chybí oddělovač konce záznamu (0x02)');
  return out.subarray(0, i).toString('utf8');
}

/* ------------------------- VAPID (RFC 8292) ------------------------- */

/* Podpis ES256 vrací node v DER; JWT chce dvě 32bajtová čísla za sebou. */
function derNaRaw(der) {
  let i = 2;
  if (der[1] & 0x80) i += der[1] & 0x7f;
  const cti = () => {
    if (der[i] !== 0x02) throw new Error('podpis není DER INTEGER');
    const d = der[i + 1];
    let v = der.subarray(i + 2, i + 2 + d);
    i += 2 + d;
    while (v.length > 32 && v[0] === 0) v = v.subarray(1);
    return Buffer.concat([Buffer.alloc(32 - v.length), v]);
  };
  return Buffer.concat([cti(), cti()]);
}

/** Hlavičky pro požadavek na push službu. */
export function hlavicky(endpoint, verejny, privatni, subject, zivot) {
  const u = new URL(endpoint);
  const hlava = b64url(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  /* Platnost tokenu: push služby odmítají delší než 24 hodin. */
  const exp = Math.floor(Date.now() / 1000) + (zivot || 12 * 3600);
  const telo = b64url(JSON.stringify({ aud: u.origin, exp, sub: subject }));
  const podepisovane = `${hlava}.${telo}`;

  /* Privátní klíč je 32 B surového skaláru; node chce klíč jako objekt,
     takže se složí z JWK. */
  const d = zb64url(privatni);
  const v = zb64url(verejny);
  const klic = crypto.createPrivateKey({
    key: { kty: 'EC', crv: 'P-256', d: d.toString('base64url'),
      x: v.subarray(1, 33).toString('base64url'), y: v.subarray(33, 65).toString('base64url') },
    format: 'jwk'
  });
  const der = crypto.sign('sha256', Buffer.from(podepisovane), { key: klic, dsaEncoding: 'der' });
  const jwt = `${podepisovane}.${b64url(derNaRaw(der))}`;
  return {
    Authorization: `vapid t=${jwt}, k=${verejny}`,
    'Content-Encoding': 'aes128gcm',
    'Content-Type': 'application/octet-stream',
    TTL: '86400'
  };
}

/** Pošle jednu zprávu. Vrací { stav, pryc } — pryc znamená „odběr zrušit". */
export async function posli(odber, text, klice, fetchFn) {
  const telo = zasifruj(text, odber.p256dh, odber.auth);
  const h = hlavicky(odber.endpoint, klice.verejny, klice.privatni, klice.subject);
  const r = await (fetchFn || fetch)(odber.endpoint, { method: 'POST', headers: h, body: telo });
  /* 404 a 410 znamenají, že odběr zanikl (odinstalovaná aplikace,
     odebraná povolení). Takový řádek se smaže, jinak by se do něj
     tlačilo donekonečna. */
  return { stav: r.status, pryc: r.status === 404 || r.status === 410 };
}
