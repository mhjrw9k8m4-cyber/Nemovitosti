#!/usr/bin/env node
/* VYROBÍ DVOJICI KLÍČŮ VAPID pro upozornění do telefonu.
   ==================================================================
   Spuštění: node scripts/vapid-klice.mjs

   Vypíše dva klíče a neukládá je nikam. Proč ne: PRIVÁTNÍ KLÍČ NESMÍ DO
   REPOZITÁŘE. Kdo ho má, může posílat upozornění pod jménem tohoto webu
   komukoli, kdo si je kdy zapnul.

   Kam s nimi:
     · veřejný  → js/config.js, window.PK_PUSH_VEREJNY_KLIC
                  (je veřejný ze své podstaty — prohlížeč ho potřebuje
                   při zapnutí odběru, takže patří do stránky)
     · privátní → Settings → Secrets and variables → Actions,
                  secret PK_VAPID_PRIVATNI
     · a k tomu secret PK_VAPID_SUBJECT, například mailto:vase@adresa.cz
       (RFC 8292: push služba podle něj ví, komu se ozvat, když je
        s posíláním něco v nepořádku; bez něj zprávy odmítá)

   Dvojice se vyrábí JEDNOU. Když se změní, všechny existující odběry
   přestanou platit a každý si je musí zapnout znovu.
   ================================================================== */
import crypto from 'node:crypto';

const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const vJwk = publicKey.export({ format: 'jwk' });
const pJwk = privateKey.export({ format: 'jwk' });

/* Veřejný klíč se ve Web Pushi posílá nekomprimovaný: 0x04 a za ním X a Y. */
const verejny = Buffer.concat([
  Buffer.from([4]),
  Buffer.from(vJwk.x, 'base64url'),
  Buffer.from(vJwk.y, 'base64url')
]).toString('base64url');
const privatni = Buffer.from(pJwk.d, 'base64url').toString('base64url');

console.log('');
console.log('VEŘEJNÝ (do js/config.js jako window.PK_PUSH_VEREJNY_KLIC):');
console.log('  ' + verejny);
console.log('');
console.log('PRIVÁTNÍ (do secrets repozitáře jako PK_VAPID_PRIVATNI — nikam jinam):');
console.log('  ' + privatni);
console.log('');
console.log('A ještě secret PK_VAPID_SUBJECT, například: mailto:vase@adresa.cz');
console.log('');
