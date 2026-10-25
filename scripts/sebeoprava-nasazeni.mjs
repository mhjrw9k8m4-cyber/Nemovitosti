#!/usr/bin/env node
/* SEBEOPRAVA NASAZENÍ — když jsou venku stará data, pustí robota
   ==================================================================
   Spuštění:
     node scripts/sebeoprava-nasazeni.mjs --nalezy nalezy.json
     node scripts/sebeoprava-nasazeni.mjs --nalezy nalezy.json --opravdu
   (bez `--opravdu` jen vypíše, co by udělal — a je to tak schválně)

   PROČ. Sebeoprava v tomhle repozitáři umí zatím jen to, co se dá
   spočítat ze zdroje (`scripts/sebeoprava.mjs`): dopočítá odvozené
   soubory a pushne. Kontrola nasazení (`scripts/kontrola-nasazeni.mjs`)
   naproti tomu umí poznat „venku jsou stará data" — a pak jen napíše
   úkol a čeká na člověka. Přitom robot, který data obnovuje, se
   z repozitáře vyvolat DÁ (`update-data.yml` má `workflow_dispatch`).
   Tohle je tedy ten krok od hlášení k opravě.

   A TEĎ TA PODSTATNÁ ČÁST: „zkusit to znovu" není oprava, pokud se
   neví, co je rozbité. Proto se nespouští nic naslepo. Rozhodnutí
   je v jedné čisté funkci `rozhodni(stav)`, která nic nedělá a nic
   nečte — jde změřit na tabulce stavů — a má jediný případ, kdy řekne
   „pustit":

     • vypínač `.github/SEBEOPRAVA-VYPNUTA` leží na místě → nic,
     • mezi nálezy není `stara-data` → nic (na ostatní vady oprava
       není; nasazení ani cizí službu z repozitáře nespravím),
     • robot právě běží → nic (druhé spuštění jen zdvojí práci),
     • nevíme, kdy robot běžel naposledy → NIC, a řekne se to nahlas.
       Hlídač, který neví, nemá jednat,
     • robot dojel před chvílí a data venku jsou PŘESTO stará → nic,
       a to je ten nejdůležitější řádek celé tabulky: tohle není vada
       robota, ale NASAZENÍ. Další běh robota by ji nespravil, jen
       zakryl tím, že se něco dělo,
     • jinak → pustit robota, jednou.

   CO TENHLE SKRIPT NIKDY NEUDĚLÁ: nepustí nic jiného než robota dat,
   nepushne, nesmaže, a bez `--opravdu` nepošle vůbec nic.
   ================================================================== */
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (jm, vychozi) => {
  const i = process.argv.indexOf(jm);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const s = process.argv.find((a) => a.startsWith(jm + '='));
  return s ? s.slice(jm.length + 1) : vychozi;
};

export const VYPINAC = '.github/SEBEOPRAVA-VYPNUTA';
export const ROBOT = 'update-data.yml';
/* Kolik minut po dojetí robota se jeho další spuštění považuje za
   nesmyslné. Šest hodin je jeho perioda, 90 minut je s rezervou doba,
   za kterou stihne doběhnout a nasadit se (naměřeno: běh robota jde
   v desítkách minut, nasazení Pages v jednotkách). */
export const TICHO_MINUT = 90;

/* ČISTÉ ROZHODNUTÍ. Žádné čtení disku, žádná síť, žádný čas — jen
   vstup a verdikt. Právě proto se dá změřit tabulkou stavů ve
   scripts/test-sebeoprava-nasazeni.mjs. */
export function rozhodni(stav) {
  const { kody = [], vypnuto = false, robotBezi = false, robotBezelMinut = null } = stav || {};
  if (vypnuto) return { akce: 'nic', duvod: `vypínač ${VYPINAC} je na místě` };
  if (!kody.includes('stara-data')) {
    return { akce: 'nic', duvod: 'mezi nálezy není stará data — na ostatní vady oprava odsud není' };
  }
  if (robotBezi) return { akce: 'nic', duvod: 'robot právě běží — druhé spuštění by jen zdvojilo práci' };
  if (robotBezelMinut === null || !isFinite(robotBezelMinut)) {
    return { akce: 'nic', duvod: 'nevím, kdy robot běžel naposledy — a hádat se nemá' };
  }
  if (robotBezelMinut < TICHO_MINUT) {
    return {
      akce: 'nic',
      duvod: `robot dojel před ${Math.round(robotBezelMinut)} min a data venku jsou PŘESTO stará`
        + ' — to není vada robota, ale nasazení; další běh by ji nespravil, jen zakryl',
    };
  }
  return {
    akce: 'pustit-robota',
    duvod: `data venku jsou stará a robot neběžel ${Math.round(robotBezelMinut)} min`
      + ` (strop ${TICHO_MINUT} min) — pouští se jednou`,
  };
}

/* ---- odsud dál to, co se opravdu dotýká světa -------------------- */
const API = 'https://api.github.com';
const REPO = process.env.GITHUB_REPOSITORY || '';
const TOKEN = process.env.GITHUB_TOKEN || '';
const VETEV = process.env.GITHUB_REF_NAME || '';

async function ghx(cesta, nastaveni = {}) {
  const r = await fetch(`${API}${cesta}`, {
    ...nastaveni,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${TOKEN}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'parcelaka-sebeoprava',
      ...(nastaveni.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(30000),
  });
  return r;
}

/* Poslední běh robota: zajímá nás, jestli právě běží, a jak dávno
   dojel ten předchozí. Když se to nepodaří zjistit, vrací se null —
   a rozhodnutí z toho udělá „nejednat", ne „jednat naslepo". */
async function stavRobota() {
  if (!REPO || !TOKEN) return { robotBezi: false, robotBezelMinut: null, poznamka: 'není GITHUB_TOKEN ani GITHUB_REPOSITORY' };
  try {
    const r = await ghx(`/repos/${REPO}/actions/workflows/${ROBOT}/runs?per_page=10`);
    if (!r.ok) return { robotBezi: false, robotBezelMinut: null, poznamka: `API vrátilo ${r.status}` };
    const j = await r.json();
    const behy = j.workflow_runs || [];
    if (!behy.length) return { robotBezi: false, robotBezelMinut: null, poznamka: 'robot nemá ani jeden běh' };
    const bezi = behy.some((b) => b.status !== 'completed');
    const hotove = behy.filter((b) => b.status === 'completed' && b.updated_at);
    const minut = hotove.length
      ? (Date.now() - Date.parse(hotove[0].updated_at)) / 60000
      : null;
    return { robotBezi: bezi, robotBezelMinut: minut, poznamka: `běhů v API: ${behy.length}` };
  } catch (e) {
    return { robotBezi: false, robotBezelMinut: null, poznamka: `API se nepodařilo zavolat (${e.message})` };
  }
}

async function pustRobota() {
  const r = await ghx(`/repos/${REPO}/actions/workflows/${ROBOT}/dispatches`, {
    method: 'POST',
    body: JSON.stringify({ ref: VETEV }),
  });
  if (r.status === 204) return { ok: true };
  let telo = '';
  try { telo = (await r.text()).slice(0, 200); } catch (e) { telo = ''; }
  return { ok: false, proc: `API vrátilo ${r.status} ${telo}` };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const NALEZY = arg('--nalezy', '');
  const OPRAVDU = process.argv.includes('--opravdu');
  let kody = [];
  let poznamkaNalezu = '';
  if (!NALEZY) poznamkaNalezu = 'nebyl předán --nalezy';
  else if (!existsSync(NALEZY)) poznamkaNalezu = `soubor ${NALEZY} není`;
  else {
    try {
      const j = JSON.parse(readFileSync(NALEZY, 'utf8'));
      kody = Array.isArray(j.kody) ? j.kody : [];
    } catch (e) { poznamkaNalezu = `soubor ${NALEZY} není platný JSON (${e.message})`; }
  }

  const vypnuto = existsSync(path.join(KOREN, VYPINAC));
  /* NASIMULOVANÝ STAV ROBOTA — jen pro zkoušku, a POJIŠTĚNÝ.
     Bez něj by se tabulka stavů dala změřit jen na čisté funkci, a
     nikdo by nedokázal, že se bez `--opravdu` opravdu nic neposílá.
     Pojistka: dohromady s `--opravdu` se to odmítne. Na vymyšleném
     stavu se naostro nejedná — ani kdyby to někdo napsal omylem. */
  const ZK_ROBOT = arg('--zkouska-robot', '');
  const ZK_BEZI = process.argv.includes('--zkouska-bezi');
  if ((ZK_ROBOT || ZK_BEZI) && OPRAVDU) {
    console.log('::error::Sebeoprava nasazení: --zkouska-robot/--zkouska-bezi'
      + ' se nesmí kombinovat s --opravdu. Na nasimulovaném stavu se naostro nejedná.');
    process.exit(1);
  }
  const robot = (ZK_ROBOT || ZK_BEZI)
    ? {
      robotBezi: ZK_BEZI,
      robotBezelMinut: ZK_ROBOT === 'nevim' || ZK_ROBOT === '' ? null : Number(ZK_ROBOT),
      poznamka: 'nasimulováno pro zkoušku',
    }
    : await stavRobota();
  const stav = { kody, vypnuto, robotBezi: robot.robotBezi, robotBezelMinut: robot.robotBezelMinut };
  const v = rozhodni(stav);

  console.log('\nSEBEOPRAVA NASAZENÍ');
  console.log(`  nálezy: ${kody.length ? kody.join(', ') : '(žádné kódy)'}`
    + (poznamkaNalezu ? ` — ${poznamkaNalezu}` : ''));
  console.log(`  vypínač: ${vypnuto ? 'JE na místě' : 'není'}`);
  console.log(`  robot: ${robot.robotBezi ? 'právě běží' : 'neběží'}`
    + `, naposledy dojel ${robot.robotBezelMinut === null ? 'nevím' : Math.round(robot.robotBezelMinut) + ' min'}`
    + ` (${robot.poznamka})`);
  console.log(`  rozhodnutí: ${v.akce} — ${v.duvod}`);

  if (v.akce !== 'pustit-robota') { console.log(''); process.exit(0); }
  if (!OPRAVDU) {
    console.log('  BEZ --opravdu se nic neposílá. Takhle by se pustil'
      + ` ${ROBOT} nad větví ${VETEV || '(neznámá)'}.\n`);
    process.exit(0);
  }
  const vysledek = await pustRobota();
  if (vysledek.ok) console.log(`  PUŠTĚNO: ${ROBOT} nad větví ${VETEV}.\n`);
  else {
    /* Selhání spuštění se NESMÍ spolknout: jinak by to vypadalo, že se
       oprava provedla, a úkol pro člověka by chyběl. */
    console.log(`::error::Sebeoprava nasazení: robota se nepodařilo pustit — ${vysledek.proc}`);
    console.log('');
    process.exit(1);
  }
}
