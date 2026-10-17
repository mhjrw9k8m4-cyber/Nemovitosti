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

   CO TENHLE SKRIPT NEDĚLÁ. Nemaže nic jiného a nic nepřepisuje. Volá
   dvě funkce v databázi, obě smí spustit jen service_role, a vypíše,
   kolik řádků ubylo.

   KDYŽ FUNKCE V DATABÁZI JEŠTĚ NEJSOU (majitel nepustil supabase/
   vykon.sql), skript to řekne a skončí v pořádku — úklid není důvod,
   proč by měla noční kontrola inzerátů spadnout.
   ==================================================================== */
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
async function rpc(jmeno, parametry) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${jmeno}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(parametry || {}),
  });
  return { stav: r.status, telo: (await r.text()).slice(0, 200) };
}

const ukoly = [
  ['uklid_navstevnosti', {}, 'čítače návštěvnosti starší dvou let'],
  ['uklid_posty', { p_dni: DNI }, `záznamy o odeslané poště starší ${DNI} dní`],
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

if (chyb) {
  console.log(`::warning::Úklid databáze: ${chyb} z ${ukoly.length} funkcí neproběhlo.`);
}
process.exit(0);
