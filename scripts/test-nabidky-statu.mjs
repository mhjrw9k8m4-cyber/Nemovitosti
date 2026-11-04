// Zkoušky čtečky otevřených dat státu (scripts/cti-nabidky-statu.mjs).
//
// Spuštění: node scripts/test-nabidky-statu.mjs
//
// ŘÁDKY VE FIXTUŘE JSOU SKUTEČNÉ — opsané z ohledání exportu
// 3. 11. 2026 (běh 41740275644). Vymyšlená fixtura by u čtečky cizího
// formátu neměřila nic: celá otázka zní „čteme TENHLE tvar správně",
// a na to se vymyšlený tvar zeptat nedá.
import * as S from './cti-nabidky-statu.mjs';
const F = await import('./fetch-opportunities.mjs');
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}\n      vyšlo  ${a}`); }
}
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const HLAVICKA = ['ID_ZAZNAMU', 'PUBLIKOVANO', 'PUBLIKUJCI', 'PUBLIKUJICI_ISDS', 'NABIZEJICI_NAZEV',
  'NABIZEJICI_ADRESA', 'NABIZEJICI_IC', 'NABIZEJICI_ZAKLADATEL', 'POPIS', 'PLATNOST_DO',
  'KONTAKT_TEL', 'KONTAKT_EMAIL', 'KONTAKT_OSOBA', 'KONTAKT_UTVAR', 'KATASTRALNI_UZEMI',
  'PARCELNI_CISLO', 'TYP_POZEMEK', 'TYP_BUDOVA', 'TYP_JEDNOTKA', 'TYP_JINY', 'ULICE',
  'CP_CEV', 'CJEDNOTKY', 'POPIS_POLOZKY', 'POZADOVANA_CENA'].join(',');

/* Skutečné řádky z exportu. Čárky uvnitř uvozovek jsou to podstatné. */
const R1 = '109183,2026-11-03,"Lesy České republiky, s.p.",e8jcfsn,,,,MZe,Prodej pozemku v k.ú. Dlouhá Lomnice,2026-12-04,956226106,martina.ptackova@lesycr.cz,Mgr. Martina Ptáčková,LS Toužim,"Dlouhá Lomnice, Bochov, okres Karlovy Vary",98/2,ano,ne,ne,ne,,,,Prodej pozemku p.č. 98/2 lesní pozemek o výměře 463 m2 v k.ú. Dlouhá Lomnice.,23150';
const R2 = '109181,2026-11-03,"Povodí Labe, státní podnik",dbyt8g2,,,,Ministerstvo zemědělství,Pozemek,2026-12-04,495088871,lodrovam@pla.cz,Martina Lodrová,majetkový odbor,"Lysá nad Labem, Lysá nad Labem, okres Nymburk",739/29,ano,ne,ne,ne,,,,"Pozemek - pozemková parcela č. 739/29, orná půda, o výměře 2 150 m2.",450000';

/* ---- 1) CSV, KTERÉ UMÍ UVOZOVKY -------------------------------- */
{
  const b = S.rozdelRadek(R1);
  je('řádek se rozdělí na správný počet buněk', b.length, 25);
  /* TOHLE JE TA PAST. „Lesy České republiky, s.p." i katastrální
     území obsahují čárku. Dělení na čárkách by posunulo všechno
     doprava a tiše: počet sloupců by u řádků bez čárky seděl. */
  je('název s čárkou zůstane jednou buňkou', b[2], 'Lesy České republiky, s.p.');
  je('katastrální území s čárkami taky', b[14], 'Dlouhá Lomnice, Bochov, okres Karlovy Vary');
  je('a sloupce za nimi nejsou posunuté', [b[15], b[16], b[24]], ['98/2', 'ano', '23150']);
  je('zdvojená uvozovka je doslovná', S.rozdelRadek('a,"b""c",d')[1], 'b"c');
  const z = S.rozdelCsv(HLAVICKA + '\n' + R1 + '\n' + R2);
  je('z hlavičky a dvou řádků vyjdou dva záznamy', z.length, 2);
  je('a jsou klíčované podle hlavičky', z[0].PARCELNI_CISLO, '98/2');
  /* Víceřádkový popis: řádky se smí dělit jen MIMO uvozovky. */
  const sZlomem = S.rozdelCsv('a,b\n1,"dva\nřádky"');
  je('zlom uvnitř uvozovek nerozdělí záznam', sZlomem.length, 1);
  je('a text zlomu se zachová', sZlomem[0].b, 'dva\nřádky');
}

/* ---- 2) MÍSTO --------------------------------------------------- */
{
  je('katastr, obec, okres', S.mistoZKatastru('Dlouhá Lomnice, Bochov, okres Karlovy Vary'),
    { place: 'Bochov', okres: 'Karlovy Vary', katastr: 'Dlouhá Lomnice' });
  je('katastr shodný s obcí', S.mistoZKatastru('Lysá nad Labem, Lysá nad Labem, okres Nymburk'),
    { place: 'Lysá nad Labem', okres: 'Nymburk', katastr: 'Lysá nad Labem' });
  /* OKRES SE POZNÁ SLOVEM, NE POŘADÍM. Kdyby úřad jednou vynechal
     katastr, posunulo by se všechno o jedno — a obec by se tiše
     změnila v okres, což by na kartě nikdo nepoznal. */
  je('bez katastru se obec nezamění za okres', S.mistoZKatastru('Bochov, okres Karlovy Vary'),
    { place: 'Bochov', okres: 'Karlovy Vary', katastr: 'Bochov' });
  /* A KDYŽ SLOVO „okres" CHYBÍ ÚPLNĚ, okres se NEVYMÝŠLÍ. Tohle je
     ta kontrola, která teprve dává smysl hledání podle slova: dokud
     měly všechny fixtury okres na konci, dala poziční verze přesně
     totéž a sabotáž prošla zeleně. Bez okresu nabídka propadne sítem
     (bezMista) — a to je správně, protože bez okresu se nedá zařadit. */
  je('bez slova „okres" se okres nevymýšlí',
    S.mistoZKatastru('Dlouhá Lomnice, Bochov'), { place: 'Bochov', okres: '', katastr: 'Dlouhá Lomnice' });
  je('prázdný vstup nic nevymyslí', S.mistoZKatastru(''), { place: '', okres: '', katastr: '' });
}

/* ---- 3) VÝMĚRA A DRUH ------------------------------------------- */
{
  je('výměra z popisu', S.vymeraZPopisu('lesní pozemek o výměře 463 m2 v k.ú.'), 463);
  je('s mezerou v tisících a s m²', S.vymeraZPopisu('o výměře 2 150 m²'), 2150);
  je('s desetinnou čárkou se zaokrouhlí', S.vymeraZPopisu('o výměře 1 234,6 m2'), 1235);
  /* TVARY JSOU OPSANÉ ZE SKUTEČNÝCH POPISŮ, ne odhadnuté. */
  je('bez „o" a v jiném pádu: „výměra 148 m2"',
    S.vymeraZPopisu('Pozemek p.č. 1364/2 druh vodní plocha, výměra 148 m2'), 148);
  je('se slovy mezi: „o celkové výměře cca 415,1 m2"',
    S.vymeraZPopisu('v k.ú. České Budějovice 6 o celkové výměře cca 415,1 m2'), 415);
  /* VÍC VÝMĚR SE SČÍTÁ — a tohle je oprava MÉ ÚVAHY, ne kódu.
     Napsal jsem nejdřív „ber poslední" a postavil to na vymyšlené
     fixtuře s oddělenou částí. Ve skutečných datech se oddělená část
     uvádí s JEDNOU výměrou, kdežto dvě výměry znamenají dvě parcely
     prodávané spolu. Brát poslední by u nich nabídlo 10 m² místo 48
     a cena za metr by vyšla pětinásobná. */
  je('dvě parcely v jedné položce se sečtou',
    S.vymeraZPopisu('p.č. 2010/1 o výměře 38 m2 a p.č. 2010/2 o výměře 10 m2'), 48);
  je('oddělená část má jednu výměru a bere se celá',
    S.vymeraZPopisu('p.č. 1053/1 oddělená dle GP č. 337-212/2026 jako p.č. 1053/3 o výměře 291 m2'), 291);
  /* A DIAGNÓZA, ať se příště neladí regulární výraz naslepo: je rozdíl
     mezi „popis výměru neuvádí" a „uvádí a neumíme ji přečíst". */
  je('popis bez metrů se pozná', S.zminujeMetry('Prodej pozemku v obci.'), false);
  je('popis s metry taky', S.zminujeMetry('plocha 100 m2'), true);
  je('kde výměra není, vrátí se null', S.vymeraZPopisu('Prodej pozemku v obci.'), null);
  je('druh lesní', S.druhZPopisu('lesní pozemek o výměře 463 m2'), 'les');
  je('druh orná', S.druhZPopisu('pozemková parcela, orná půda, v obci'), 'orná půda');
  je('druh neznámý zůstane obecný', S.druhZPopisu('Prodej pozemku.'), 'pozemek');
}

/* ---- 4) CELÝ PŘEVOD --------------------------------------------- */
{
  const { nabidky, zahozeno } = S.nabidkyZCsv(HLAVICKA + '\n' + R1 + '\n' + R2, '2026-11-03');
  je('ze dvou záznamů vyjdou dvě nabídky', nabidky.length, 2);
  /* ČTE SE OBRANNĚ. Když se čtečka rozbije tak, že nevrátí nic,
     `nabidky[0].place` SPADNE — a pád v polovině souboru znamená, že
     se zbytek kontrol vůbec nespustí a o příčině se nedozvíme. Dnes
     se mi to stalo potřetí; hlídač má hlásit, ne padat. */
  const n0 = nabidky[0] || {};
  const n1 = nabidky[1] || {};
  je('první je celá a správně', {
    place: n0.place, okres: n0.okres, area: n0.area,
    price: n0.price, druh: n0.druh, parcel: n0.parcel, type: n0.type,
  }, { place: 'Bochov', okres: 'Karlovy Vary', area: 463, price: 23150,
    druh: 'les', parcel: '98/2', type: 'sale' });
  je('druhá taky', { place: n1.place, area: n1.area, price: n1.price, druh: n1.druh },
    { place: 'Lysá nad Labem', area: 2150, price: 450000, druh: 'orná půda' });
  pravda('nabídka nese, kdo ji nabízí', /Lesy České republiky/.test(n0.extra || ''), String(n0.extra));
  pravda('a má adresu do evidence', /portal\.gov\.cz/.test(n0.url || ''), String(n0.url));
  je('nic se nezahodilo', Object.values(zahozeno).reduce((a, b) => a + b, 0), 0);
  /* KLÍČ PODLE ČÍSLA ZÁZNAMU. Robot zahazuje duplicity podle
     `type|okres|_key||parcel`, takže bez vlastního klíče by se nabídky
     bez parcelního čísla v jednom okrese slily do jedné. */
  pravda('každá nabídka má vlastní klíč podle čísla záznamu v evidenci',
    /^stat-109183-1$/.test(n0._key || '') && n0._key !== n1._key,
    JSON.stringify([n0._key, n1._key]));
}

/* ---- 5) BEZ PARCELNÍHO ČÍSLA SE NABÍDKA NEZAHAZUJE ---------------
   NALEZENO MĚŘENÍM 4. 11.: zdroj vrátil 33 pozemků, na web se dostalo
   11 — a všech jedenáct mělo v CSV parcelní číslo. Zbylých 22 zahodil
   robot v `valid()`, kde je `parcel` povinné pole; tenhle zdroj psal
   `undefined`, kdežto ostatní zdroje píšou pomlčku. Parcelní číslo je
   údaj na přečtení, ne měřítko jakosti: obec, okres, výměra i cena
   tam byly. */
{
  const bezCisla = R1.replace('okres Karlovy Vary",98/2,', 'okres Karlovy Vary",,');
  const { nabidky } = S.nabidkyZCsv(HLAVICKA + '\n' + bezCisla, '2026-11-03');
  const n = nabidky[0] || {};
  je('nabídka bez parcelního čísla zůstane', nabidky.length, 1);
  je('a místo čísla má pomlčku, ne prázdno', n.parcel, '—');
  pravda('takže ji síto robota pustí na web',
    F.procNeplatna({ ...n, lat: 50.15, lng: 13.05 }) === null,
    String(F.procNeplatna({ ...n, lat: 50.15, lng: 13.05 })));
}

/* ---- 5) KVALITA: CO SE NEVEZME ---------------------------------- */
/* „Dostatečná kvalita tam musí být." Nabídka bez výměry se nedá
   srovnat s ničím, nespočítá se u ní Kč/m² a na mapě by jen
   překážela. Radši míň nabídek než nabídky, o kterých web nic neumí
   říct — a kolik se zahodilo, musí být VIDĚT (§356). */
{
  const bezVymery = HLAVICKA + '\n' + '1,2026-11-03,X,i,,,,,P,2026-12-04,,,,,"Obec, okres Brno-venkov",1,ano,ne,ne,ne,,,,Prodej pozemku.,1000';
  const bezCeny = HLAVICKA + '\n' + '2,2026-11-03,X,i,,,,,P,2026-12-04,,,,,"Obec, okres Brno-venkov",1,ano,ne,ne,ne,,,,o výměře 100 m2,';
  const budova = HLAVICKA + '\n' + '3,2026-11-03,X,i,,,,,P,2026-12-04,,,,,"Obec, okres Brno-venkov",1,ano,ano,ne,ne,,,,o výměře 100 m2,1000';
  const neniPozemek = HLAVICKA + '\n' + '4,2026-11-03,X,i,,,,,P,2026-12-04,,,,,"Obec, okres Brno-venkov",1,ne,ano,ne,ne,,,,o výměře 100 m2,1000';
  const prosla = HLAVICKA + '\n' + '5,2026-01-01,X,i,,,,,P,2026-10-01,,,,,"Obec, okres Brno-venkov",1,ano,ne,ne,ne,,,,o výměře 100 m2,1000';
  const bezMista = HLAVICKA + '\n' + '6,2026-11-03,X,i,,,,,P,2026-12-04,,,,,"Jen katastr",1,ano,ne,ne,ne,,,,o výměře 100 m2,1000';
  const d = '2026-11-03';
  je('bez výměry se nebere', S.nabidkyZCsv(bezVymery, d).nabidky.length, 0);
  je('a je to vidět v počtu zahozených', S.nabidkyZCsv(bezVymery, d).zahozeno.bezVymery, 1);
  je('bez ceny se nebere', S.nabidkyZCsv(bezCeny, d).zahozeno.bezCeny, 1);
  je('pozemek s budovou se nebere (cena je za obojí)', S.nabidkyZCsv(budova, d).zahozeno.sBudovou, 1);
  je('co není pozemek, se nebere', S.nabidkyZCsv(neniPozemek, d).zahozeno.nenipozemek, 1);
  je('prošlá nabídka se nebere', S.nabidkyZCsv(prosla, d).zahozeno.prosle, 1);
  je('bez okresu se nebere', S.nabidkyZCsv(bezMista, d).zahozeno.bezMista, 1);
  /* A OPAČNÝ SMĚR: ať se to nedá „opravit" tím, že se nevezme nic. */
  je('ale platná nabídka projde', S.nabidkyZCsv(HLAVICKA + '\n' + R1, d).nabidky.length, 1);
  je('a nabídka platná PRÁVĚ DNES se nezahodí jako prošlá',
    S.nabidkyZCsv(HLAVICKA + '\n' + R1, '2026-12-04').nabidky.length, 1);
}

/* ---- 6) VÍC POLOŽEK V JEDNOM ZÁZNAMU ---------------------------- */
{
  const h2 = HLAVICKA + ',KATASTRALNI_UZEMI_2,POZADOVANA_CENA_2,PARCELNI_CISLO_2,TYP_POZEMEK_2,TYP_BUDOVA_2,TYP_JEDNOTKA_2,TYP_JINY_2,ULICE_2,CP_CEV_2,CJEDNOTKY_2,POPIS_POLOZKY_2';
  const r = '7,2026-11-03,X,i,,,,,P,2026-12-04,,,,,"Obec, okres Zlín",1,ano,ne,ne,ne,,,,o výměře 100 m2,1000'
    + ',"Druhá, okres Zlín",2000,2,ano,ne,ne,ne,,,,o výměře 200 m2';
  const v = S.nabidkyZCsv(h2 + '\n' + r, '2026-11-03');
  je('jeden záznam může nést dvě nabídky', v.nabidky.length, 2);
  je('a liší se místem, výměrou i cenou',
    v.nabidky.map((n) => [n.place, n.area, n.price]), [['Obec', 100, 1000], ['Druhá', 200, 2000]]);
}

console.log('Nabídky státu:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) {
  console.error(`::error::Nabídky státu: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy)
    + ' Čte se otevřené CSV z portal.gov.cz; když se změní jeho tvar, pozná se to tady.');
  process.exit(1);
}
