/* Úklid databáze — to, co se jen hromadí a nikdo to nečte.
   ====================================================================
   SPUŠTĚNÍ (běží samo z .github/workflows/kontrola-inzeratu.yml):

     SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/uklid-databaze.mjs

   PROČ. Dvě tabulky rostou bez konce a žádná z nich nemá kdo zmenšit:

   · navstevnost — čítače po dnech. Funkce uklid_navstevnosti() v
     supabase/navstevnost.sql existuje od začátku a maže řádky starší
     dvou let. Nevolal ji NIKDO: v celém repozitáři na ni byl jediný
     odkaz, a ten v komentáři jiného testu. Úklid, který se nespouští,
     je jen slib.
   · mail_poslane a push_poslane — klíče nabídek, které už odešly, aby
     se neposlaly podruhé. Nabídka z dat zmizí nejpozději za pár měsíců
     (změřeno: 308 z 1 980 nabídek zmizelo za 17 dní), takže záznam
     starší půl roku nehlídá už nic. Index na čase u obou tabulek byl —
     založený pro úklid, který se nenapsal.

   · osiřelé fotky v úložišti — mazání inzerátu ruší jen řádek
     v `listings`, takže fotky po smazaných inzerátech tam zůstávají
     ležet. Od 23. 10. je na počet fotek na účet strop, takže je to
     past: účet se zasekne na fotkách, které už k ničemu nepatří.
     Jediný krok, který maže i SOUBOR, ne jen řádek — a musí, protože
     smazaný řádek v `storage.objects` by soubor schoval před každým
     dalším úklidem.

   CO TENHLE SKRIPT NEPŘEPISUJE. Nic. Volá funkce v databázi (všechny
   smí spustit jen service_role), u osiřelých fotek navíc smaže soubory
   přes Storage API, a vypíše, kolik čeho ubylo.

   KDYŽ FUNKCE V DATABÁZI JEŠTĚ NEJSOU (majitel nepustil supabase/
   vykon.sql), skript to řekne a skončí v pořádku — úklid není důvod,
   proč by měla noční kontrola inzerátů spadnout.
   ==================================================================== */
import { fetchSLimitem } from './fetch-s-limitem.mjs';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const DNI = Math.max(parseInt(process.env.UKLID_DNI || '180', 10) || 180, 30);

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.log('Úklid databáze: chybí SUPABASE_URL nebo SUPABASE_SERVICE_ROLE_KEY — nedělám nic.');
  process.exit(0);
}

/* Vrací { stav, telo }. Servisní klíč se nikam nevypisuje — ani do
   chybové hlášky; obchází veškerá oprávnění, takže by stačil jeden
   snímek obrazovky z běhu úlohy. */
/* VÝPADEK SE HLÁSÍ STAVEM, NE PÁDEM. Doteď tu nebyl `catch`: když
   databáze neodpověděla, skript spadl uprostřed úklidu a volající se
   nedozvěděl, které kroky doběhly. Stav 0 znamená „nedošlo to tam" —
   volající ho umí odlišit od chyby, kterou databáze vrátila sama. */
/* STEJNÉ VOLÁNÍ, ALE S CELOU ODPOVĚDÍ. rpc() níž krátí tělo na 200
   znaků, aby se do výpisu nevylila půlka tabulky — u seznamu jmen fotek
   by se tím ale seznam rozsekal a mazalo by se podle poloviny jména.
   Tahle podoba tedy tělo nekrátí a používá se JEN tam, kde je odpověď
   data, ne hláška. */
async function rpcPlne(jmeno, parametry) {
  let r;
  try {
    r = await fetchSLimitem(`${SUPABASE_URL}/rest/v1/rpc/${jmeno}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parametry || {}),
    });
  } catch (e) {
    return { stav: 0, telo: 'spojení selhalo: '
      + ((e && (e.message || e.code)) || 'neznámá chyba').slice(0, 160) };
  }
  return { stav: r.status, telo: await r.text() };
}

async function rpc(jmeno, parametry) {
  let r;
  try {
    r = await fetchSLimitem(`${SUPABASE_URL}/rest/v1/rpc/${jmeno}`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(parametry || {}),
    });
  } catch (e) {
    return { stav: 0, telo: 'spojení selhalo: '
      + ((e && (e.message || e.code)) || 'neznámá chyba').slice(0, 160) };
  }
  return { stav: r.status, telo: (await r.text()).slice(0, 200) };
}

/* Dny u nepotvrzených přihlášek jsou JINÉ než u pošty: na potvrzovací
   odkaz člověk klikne za minutu, nebo nikdy. Měsíc je tedy velkorysý
   strop a držet je půl roku by znamenalo držet jen cizí smetí —
   subscribe_watch smí zavolat kdokoli s veřejným klíčem. */
const DNI_HLIDANI = Math.max(parseInt(process.env.UKLID_HLIDANI_DNI || '30', 10) || 30, 7);

const ukoly = [
  ['uklid_navstevnosti', {}, 'čítače návštěvnosti starší dvou let'],
  ['uklid_posty', { p_dni: DNI }, `záznamy o odeslané poště starší ${DNI} dní`],
  ['uklid_hlidani', { p_dni: DNI_HLIDANI }, `nepotvrzené přihlášky k hlídání starší ${DNI_HLIDANI} dní`],
];

let chyb = 0;
for (const [jmeno, parametry, popis] of ukoly) {
  const { stav, telo } = await rpc(jmeno, parametry);
  if (stav === 404) {
    console.log(`• ${jmeno}(): v databázi není — pusťte supabase/00-vse.sql. Přeskakuji.`);
    continue;
  }
  if (stav < 200 || stav >= 300) {
    console.log(`• ${jmeno}(): databáze odpověděla ${stav} — ${telo}`);
    chyb++;
    continue;
  }
  const kolik = Number(telo);
  console.log(`• ${jmeno}(): smazáno ${Number.isFinite(kolik) ? kolik : '?'} řádků (${popis}).`);
}

/* OSIŘELÉ FOTKY V ÚLOŽIŠTI. Mazání inzerátu (delete_listing) ruší jen
   řádek v `listings` — fotky zůstanou ležet v úložišti `listing-photos`.
   Dokud úložiště nemělo strop, byla to pomalu rostoucí faktura; od
   23. 10. má strop na počet fotek na účet (supabase/uloziste-strop.sql),
   takže je to past: účet se zasekne na fotkách, které už k ničemu
   nepatří, a sám je neuklidí.

   JE TO DVOUKROK A MUSÍ BÝT. osirele_fotky() jen VYPÍŠE jména; mazat
   se musí přes Storage API, protože smazat řádek v storage.objects by
   soubor nechal v úložišti ležet navždy — a ještě by ho schoval před
   každým dalším úklidem (osiřelý soubor bez řádku už nikdo nenajde).

   Fotky mladší než den se nemažou: mezi nahráním a založením inzerátu
   je chvíle, kdy na fotku ještě nic neodkazuje, a to je normální stav,
   ne odpad. */
const FOTKY_HODIN = Math.max(parseInt(process.env.UKLID_FOTKY_HODIN || '24', 10) || 24, 1);
const FOTKY_MAX = Math.min(Math.max(parseInt(process.env.UKLID_FOTKY_MAX || '200', 10) || 200, 1), 1000);
{
  const { stav, telo } = await rpcPlne('osirele_fotky',
    { p_starsi_nez_hodin: FOTKY_HODIN, p_limit: FOTKY_MAX });
  if (stav === 404) {
    console.log('• osirele_fotky(): v databázi není — pusťte supabase/00-vse.sql. Přeskakuji.');
  } else if (stav < 200 || stav >= 300) {
    console.log(`• osirele_fotky(): databáze odpověděla ${stav} — ${telo}`);
    chyb++;
  } else {
    let jmena = [], rozbite = false;
    try {
      const d = JSON.parse(telo);
      if (Array.isArray(d)) jmena = d.map((x) => (x && x.name) || '').filter(Boolean);
      else rozbite = true;
    } catch (e) { rozbite = true; }
    /* NEROZPARSOVANÁ ODPOVĚĎ NENÍ „NIC K ZAHOZENÍ". Kdyby se obojí
       slilo, vypadala by rozbitá odpověď jako uklizeno a nikdo by se
       nedozvěděl, že úklid neběží. */
    if (rozbite) {
      console.log('• osirele_fotky(): odpověď se nepovedlo přečíst — ' + telo.slice(0, 160));
      chyb++;
    } else if (!jmena.length) {
      console.log('• úklid fotek: nic k zahození.');
    } else {
      let r;
      try {
        r = await fetchSLimitem(`${SUPABASE_URL}/storage/v1/object/listing-photos`, {
          method: 'DELETE',
          headers: {
            apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ prefixes: jmena }),
        });
      } catch (e) {
        console.log('• úklid fotek: spojení s úložištěm selhalo — '
          + ((e && (e.message || e.code)) || 'neznámá chyba').slice(0, 120));
        chyb++;
      }
      if (r) {
        if (r.status >= 200 && r.status < 300) {
          console.log(`• úklid fotek: smazáno ${jmena.length} osiřelých fotek `
            + `(starších ${FOTKY_HODIN} h, na které už žádný inzerát neodkazuje).`);
        } else {
          console.log(`• úklid fotek: úložiště odpovědělo ${r.status} — `
            + (await r.text()).slice(0, 160));
          chyb++;
        }
      }
    }
  }
}

if (chyb) {
  console.log(`::warning::Úklid databáze: ${chyb} krok${chyb === 1 ? '' : 'y'} neproběhl${chyb === 1 ? '' : 'y'}.`);
}
process.exit(0);
