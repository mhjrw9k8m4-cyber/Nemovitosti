// Generátor regionálních SEO stránek z reálných dat (data/opportunities.json).
// Vytváří: okresní stránky, krajské stránky, národní přehled dražeb a rozcestník.
// Spouští se automaticky po aktualizaci dat (viz .github/workflows/update-data.yml),
// takže stránky nikdy nezestárnou. Ručně: `node scripts/generate-region-pages.mjs`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = 'v=20260822h';
const MIN_OKRES = 10;   // okres musí mít aspoň tolik nabídek pro vlastní stránku
const MIN_KRAJ = 15;    // kraj musí mít aspoň tolik nabídek pro vlastní stránku

const OKRES_KRAJ = {
 'Hlavní město Praha':'Praha','Praha':'Praha',
 'Benešov':'Středočeský','Beroun':'Středočeský','Kladno':'Středočeský','Kolín':'Středočeský','Kutná Hora':'Středočeský','Mělník':'Středočeský','Mladá Boleslav':'Středočeský','Nymburk':'Středočeský','Praha-východ':'Středočeský','Praha-západ':'Středočeský','Příbram':'Středočeský','Rakovník':'Středočeský',
 'České Budějovice':'Jihočeský','Český Krumlov':'Jihočeský','Jindřichův Hradec':'Jihočeský','Písek':'Jihočeský','Prachatice':'Jihočeský','Strakonice':'Jihočeský','Tábor':'Jihočeský',
 'Domažlice':'Plzeňský','Klatovy':'Plzeňský','Plzeň-město':'Plzeňský','Plzeň-jih':'Plzeňský','Plzeň-sever':'Plzeňský','Rokycany':'Plzeňský','Tachov':'Plzeňský',
 'Cheb':'Karlovarský','Karlovy Vary':'Karlovarský','Sokolov':'Karlovarský',
 'Děčín':'Ústecký','Chomutov':'Ústecký','Litoměřice':'Ústecký','Louny':'Ústecký','Most':'Ústecký','Teplice':'Ústecký','Ústí nad Labem':'Ústecký',
 'Česká Lípa':'Liberecký','Jablonec nad Nisou':'Liberecký','Liberec':'Liberecký','Semily':'Liberecký',
 'Hradec Králové':'Královéhradecký','Jičín':'Královéhradecký','Náchod':'Královéhradecký','Rychnov nad Kněžnou':'Královéhradecký','Trutnov':'Královéhradecký',
 'Chrudim':'Pardubický','Pardubice':'Pardubický','Svitavy':'Pardubický','Ústí nad Orlicí':'Pardubický',
 'Havlíčkův Brod':'Vysočina','Jihlava':'Vysočina','Pelhřimov':'Vysočina','Třebíč':'Vysočina','Žďár nad Sázavou':'Vysočina',
 'Blansko':'Jihomoravský','Brno-město':'Jihomoravský','Brno-venkov':'Jihomoravský','Břeclav':'Jihomoravský','Hodonín':'Jihomoravský','Vyškov':'Jihomoravský','Znojmo':'Jihomoravský',
 'Jeseník':'Olomoucký','Olomouc':'Olomoucký','Prostějov':'Olomoucký','Přerov':'Olomoucký','Šumperk':'Olomoucký',
 'Kroměříž':'Zlínský','Uherské Hradiště':'Zlínský','Vsetín':'Zlínský','Zlín':'Zlínský',
 'Bruntál':'Moravskoslezský','Frýdek-Místek':'Moravskoslezský','Karviná':'Moravskoslezský','Nový Jičín':'Moravskoslezský','Opava':'Moravskoslezský','Ostrava-město':'Moravskoslezský'
};
const KRAJ_ORDER = ['Praha','Středočeský','Jihočeský','Plzeňský','Karlovarský','Ústecký','Liberecký','Královéhradecký','Pardubický','Vysočina','Jihomoravský','Olomoucký','Zlínský','Moravskoslezský'];
const KRAJ_META = {
 'Praha':            { disp:'Praha',              loc:'v Praze',                 mapName:'Praha' },
 'Středočeský':      { disp:'Středočeský kraj',   loc:'ve Středočeském kraji',   mapName:'Středočeský' },
 'Jihočeský':        { disp:'Jihočeský kraj',     loc:'v Jihočeském kraji',      mapName:'Jihočeský' },
 'Plzeňský':         { disp:'Plzeňský kraj',      loc:'v Plzeňském kraji',       mapName:'Plzeňský' },
 'Karlovarský':      { disp:'Karlovarský kraj',   loc:'v Karlovarském kraji',    mapName:'Karlovarský' },
 'Ústecký':          { disp:'Ústecký kraj',       loc:'v Ústeckém kraji',        mapName:'Ústecký' },
 'Liberecký':        { disp:'Liberecký kraj',     loc:'v Libereckém kraji',      mapName:'Liberecký' },
 'Královéhradecký':  { disp:'Královéhradecký kraj', loc:'v Královéhradeckém kraji', mapName:'Královéhradecký' },
 'Pardubický':       { disp:'Pardubický kraj',    loc:'v Pardubickém kraji',     mapName:'Pardubický' },
 'Vysočina':         { disp:'Kraj Vysočina',      loc:'na Vysočině',             mapName:'Vysočina' },
 'Jihomoravský':     { disp:'Jihomoravský kraj',  loc:'v Jihomoravském kraji',   mapName:'Jihomoravský' },
 'Olomoucký':        { disp:'Olomoucký kraj',     loc:'v Olomouckém kraji',      mapName:'Olomoucký' },
 'Zlínský':          { disp:'Zlínský kraj',       loc:'ve Zlínském kraji',       mapName:'Zlínský' },
 'Moravskoslezský':  { disp:'Moravskoslezský kraj', loc:'v Moravskoslezském kraji', mapName:'Moravskoslezský' }
};
const TYPE_LABEL = { sale:'Na prodej', drazba:'Dražba', exekuce:'Exekuce', obec:'Záměr obce', majitel:'Od majitele' };

function slug(s){
  const map={'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z'};
  return String(s).toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g,c=>map[c]||c).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const attr = esc;
function fmt(n){ return (typeof n==='number'&&isFinite(n)) ? n.toLocaleString('cs-CZ') : ''; }
function pluralPozemek(n){ if(n===1)return 'pozemek'; if(n>=2&&n<=4)return 'pozemky'; return 'pozemků'; }
function krajFile(kraj){ return `pozemky-${slug(kraj)}-kraj.html`; }
function okresFile(okres){ return `pozemky-okres-${slug(okres)}.html`; }
function write(file, html){ fs.writeFileSync(path.join(ROOT, file), html); }

const data = JSON.parse(fs.readFileSync(path.join(ROOT,'data','opportunities.json'),'utf8'));
const all = Array.isArray(data.opportunities) ? data.opportunities : [];
if(!all.length){ console.error('Žádná data — generování přeskočeno.'); process.exit(0); }

// Úklid: smaž jen VLASTNÍ vygenerované stránky (ne rádce jako pozemky-od-obce.html
// ani rozcestník pozemky-podle-okresu.html), ať po změně dat nezůstanou sirotci.
for(const f of fs.readdirSync(ROOT)){
  if(/^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f)) fs.rmSync(path.join(ROOT,f));
}

const byOkres = {}, byKraj = {};
for(const o of all){
  if(o.okres){ (byOkres[o.okres]=byOkres[o.okres]||[]).push(o); }
  const k = OKRES_KRAJ[o.okres]; if(k){ (byKraj[k]=byKraj[k]||[]).push(o); }
}
const eligibleOkres = Object.keys(byOkres).filter(ok=>byOkres[ok].length>=MIN_OKRES);
const eligibleKraj  = KRAJ_ORDER.filter(k=>byKraj[k] && byKraj[k].length>=MIN_KRAJ);
const hasOkresPage = new Set(eligibleOkres);
const hasKrajPage  = new Set(eligibleKraj);

/* ---------- Cenový přehled (unikátní funkce): medián Kč/m² podle druhu a regionu ----------
   Poctivě: počítá se jen z nabídek, kde je cena i výměra; Kč/m² dává smysl jen
   v rámci jednoho druhu (stavební × pole × les), proto rozdělené podle druhu.
   Číslo se ukáže jen tam, kde je dost vzorků (MIN_PRICE), a vždy se uvádí počet. */
const MIN_PRICE = 10;
const DRUH_GROUPS = ['Zemědělská půda','Lesní pozemek','Zahrada','Stavební'];
function druhGroup(s){
  s=(s||'').toLowerCase();
  if(/stav/.test(s)) return 'Stavební';
  if(/les/.test(s)) return 'Lesní pozemek';
  if(/zahrad/.test(s)) return 'Zahrada';
  if(/orná|orna|louka|travní|travni|pastvin|zeměděl|zemedel|chmel|vinice|sad|ovocn|pole/.test(s)) return 'Zemědělská půda';
  return 'Ostatní';
}
function median(a){ if(!a.length) return 0; a=a.slice().sort((x,y)=>x-y); const n=a.length; return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2; }
function pctl(a,p){ if(!a.length) return 0; a=a.slice().sort((x,y)=>x-y); return a[Math.max(0,Math.min(a.length-1,Math.floor(a.length*p)))]; }
// Vrátí mapu skupina -> {n, med, lo, hi} pro danou sadu nabídek (jen platné Kč/m²).
function priceStats(list){
  const buckets={};
  for(const o of list){
    if(!(o.price>0 && o.area>=100 && o.area<=500000)) continue;
    const g=druhGroup(o.druh); if(g==='Ostatní') continue;
    const perm2 = o.price/o.area;
    // Pole/les nad 500 Kč/m² jsou fakticky stavební parcely (jen vedené jako „orná"),
    // do ceny zemědělské půdy/lesa nepatří — jinak by zkreslily medián okresu nahoru.
    if((g==='Zemědělská půda' || g==='Lesní pozemek') && perm2>500) continue;
    (buckets[g]=buckets[g]||[]).push(perm2);
  }
  const out={};
  for(const g of Object.keys(buckets)){
    const v=buckets[g];
    if(v.length>=MIN_PRICE) out[g]={ n:v.length, med:Math.round(median(v)), lo:Math.round(pctl(v,0.25)), hi:Math.round(pctl(v,0.75)) };
  }
  return out;
}
const priceNational = priceStats(all);
const priceByKraj = {}; for(const k of KRAJ_ORDER){ if(byKraj[k]) priceByKraj[k]=priceStats(byKraj[k]); }
const priceByOkres = {}; for(const ok of Object.keys(byOkres)){ priceByOkres[ok]=priceStats(byOkres[ok]); }
// Kompaktní věta o ceně pro region (nejsilnější skupina = nejvíc vzorků).
function priceLine(stats){
  const groups=Object.keys(stats).sort((a,b)=>stats[b].n-stats[a].n);
  if(!groups.length) return '';
  const g=groups[0], s=stats[g];
  return `Medián ceny (${g.toLowerCase()}): <b>${fmt(s.med)} Kč/m²</b> <span class="okr-more" style="display:inline">(orientačně, z ${s.n} nabídek)</span>`;
}

const SITE = 'https://parcelaka.cz/';
function crumbNav(items){
  if(!items || !items.length) return '';
  const inner = items.map(it=> it.href
    ? `<a href="${attr(it.href)}">${esc(it.name)}</a>`
    : `<span aria-current="page">${esc(it.name)}</span>`
  ).join('<span class="crumb-sep" aria-hidden="true">›</span>');
  return `\n<nav class="crumbs" aria-label="Drobečková navigace">${inner}</nav>\n`;
}
function crumbLd(items){
  return {"@type":"BreadcrumbList","itemListElement":items.map((it,i)=>{
    const li={"@type":"ListItem","position":i+1,"name":it.name};
    if(it.abs) li.item = it.abs;
    return li;
  })};
}
function head(title, desc, canonicalPath, ld, crumbs){
  // ld může být objekt nebo pole; přidáme BreadcrumbList, je-li předán.
  let ldArr = Array.isArray(ld) ? ld.slice() : (ld ? [ld] : []);
  if(crumbs && crumbs.length) ldArr.push(crumbLd(crumbs));
  const jsonld = ldArr.length ? JSON.stringify(ldArr.length===1 ? ldArr[0] : ldArr) : '';
  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(desc)}">
  <meta name="theme-color" content="#16232F">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://parcelaka.cz/${canonicalPath}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(desc)}">
  <meta property="og:locale" content="cs_CZ">
  <meta property="og:site_name" content="Parcelka">
  <meta property="og:url" content="https://parcelaka.cz/${canonicalPath}">
  <meta property="og:image" content="https://parcelaka.cz/assets/og.png?v=2">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(desc)}">
  <meta name="twitter:image" content="https://parcelaka.cz/assets/og.png?v=2">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="icon" type="image/png" sizes="192x192" href="assets/icon-192.png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="css/styles.css?${V}">
${jsonld ? '  <script type="application/ld+json">\n  '+jsonld+'\n  </'+'script>\n' : ''}</head>
<body>

<a class="skip-link" href="#obsah">Přeskočit na obsah</a>


<header id="header">
  <div class="wrap">
    <a class="logo" href="index.html" aria-label="Parcelka — domů"><span class="logo-mark" aria-hidden="true"></span>Parcelka</a>
    <a href="pridat.html" class="btn-primary header-cta"><span class="cta-full">Přidat pozemek</span><span class="cta-short">Přidat</span></a>
    <button class="nav-toggle" aria-label="Otevřít menu" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
    <nav id="nav" aria-label="Hlavní navigace">
      <a href="index.html#mapa">Mapa</a>
      <a href="cena-pozemku.html">Ceny pozemků</a>
      <a href="muj-inzerat.html">Můj profil</a>
      <a href="index.html#faq">Dotazy</a>
      <a href="kontakt.html">Kontakt</a>
      <a href="pridat.html" class="btn-primary nav-add">Přidat pozemek</a>
      <span class="nav-cta-note">Prodáváte pozemek? Přidejte ho zdarma a bez provize.</span>
    </nav>
  </div>
</header>
${crumbNav(crumbs)}`;
}
function footer(){
  return `
<footer>
  <div class="wrap foot-grid">
    <div class="foot-brand-col">
      <div class="foot-brand"><span class="logo-mark small" aria-hidden="true"></span><span>Parcelka</span></div>
      <p class="foot-tag">Mapa příležitostí u pozemků — srozumitelně a pro každého.</p>
    </div>
    <nav class="foot-col" aria-label="Produkt"><h5>Produkt</h5><a href="index.html#mapa">Mapa</a><a href="pozemky-podle-okresu.html">Pozemky podle okresů</a><a href="cena-pozemku.html">Ceny pozemků</a><a href="pridat.html">Přidat pozemek</a></nav>
    <nav class="foot-col" aria-label="Rádce"><h5>Rádce</h5><a href="drazby-pozemku.html">Koupě v dražbě</a><a href="kolik-stoji-koupe-pozemku.html">Náklady při koupi</a><a href="list-vlastnictvi-katastr.html">List vlastnictví</a><a href="pozemek-od-obce.html">Pozemek od obce</a><a href="stavebni-vs-zemedelsky-pozemek.html">Stavební vs. zemědělský</a></nav>
    <nav class="foot-col" aria-label="Právní"><h5>Právní</h5><a href="ochrana-udaju.html">Ochrana osobních údajů</a><a href="podminky.html">Podmínky použití</a><a href="pravidla-inzerce.html">Pravidla inzerce</a><a href="kontakt.html">Kontakt</a></nav>
  </div>
  <div class="wrap foot-bottom"><span class="mono">Tvořeno s péčí v Česku · data z veřejných zdrojů</span><span class="mono">© 2026 Parcelka</span></div>
</footer>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<script src="js/pridat.js?${V}" defer></script>
</body>
</html>
`;
}
function itemRow(o){
  const badge = `<span class="okr-badge t-${esc(o.type)}">${esc(TYPE_LABEL[o.type]||o.type)}</span>`;
  const bits = [];
  if(o.druh && o.druh!=='—') bits.push(esc(o.druh));
  if(o.area) bits.push('<b>'+fmt(o.area)+' m²</b>');
  if(o.price) bits.push('<b>'+fmt(o.price)+' Kč</b>');
  if(o.okres) bits.push('okres '+esc(o.okres));
  if(o.extra && o.extra!=='—') bits.push(esc(o.extra));
  const src = (o.url && /^https?:\/\//.test(o.url)) ? `<a class="okr-src" href="${attr(o.url)}" target="_blank" rel="noopener nofollow">Zdroj →</a>` : '';
  return `      <div class="okr-item">
        ${badge}
        <span class="okr-place">${esc(o.place)}</span>
        <span class="okr-meta">${bits.join(' · ')}</span>
        ${src}
      </div>`;
}

const okresPages = [];
const krajPages = [];

// ---------- OKRES ----------
for(const okres of eligibleOkres){
  const list = byOkres[okres].slice();
  const kraj = OKRES_KRAJ[okres] || '';
  const file = okresFile(okres);
  const count = list.length;
  const byType={}; for(const o of list) byType[o.type]=(byType[o.type]||0)+1;
  const typeParts = Object.keys(byType).sort((a,b)=>byType[b]-byType[a]).map(t=>`${byType[t]}× ${(TYPE_LABEL[t]||t).toLowerCase()}`);
  const priced = list.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0], maxP=priced[priced.length-1];
  list.sort((a,b)=>(a.price||1e15)-(b.price||1e15));
  const dispK = (KRAJ_META[kraj]||{}).disp || (kraj+' kraj');

  const title = `Pozemky v okrese ${okres} — prodej, dražby, exekuce | Parcelka`;
  const desc = `${count} ${pluralPozemek(count)} v okrese ${okres}${kraj?', '+dispK:''} na jedné mapě — prodeje, dražby i exekuce z veřejných zdrojů. ${minP?('Ceny od '+fmt(minP)+' Kč. '):''}Ověřte si nabídku v katastru.`;
  const items = list.slice(0,20).map((o,i)=>({"@type":"ListItem","position":i+1,"name":`${o.place} — ${TYPE_LABEL[o.type]||o.type}${o.area?', '+o.area+' m²':''}`}));
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":`Pozemky v okrese ${okres}`,"inLanguage":"cs","description":`Nabídky pozemků v okrese ${okres} — prodeje, dražby a exekuce z veřejných zdrojů.`,"mainEntityOfPage":`https://parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":{"@type":"ItemList","numberOfItems":count,"itemListElement":items}};
  const rows = list.map(itemRow).join('\n');
  const mapName = (KRAJ_META[kraj]||{}).mapName || kraj;
  const krajLink = mapName ? `index.html?kraj=${encodeURIComponent(mapName)}#mapa` : 'index.html#mapa';
  const siblings = eligibleOkres.filter(x=>x!==okres && OKRES_KRAJ[x]===kraj).sort((a,b)=>byOkres[b].length-byOkres[a].length).slice(0,6);
  const sibLinks = siblings.map(x=>`<a href="${okresFile(x)}">Pozemky ${esc(x)} <span>${byOkres[x].length}</span></a>`).join('');
  const krajBack = hasKrajPage.has(kraj) ? `<a href="${krajFile(kraj)}">Celý ${esc(dispK)} →</a>` : `<a href="pozemky-podle-okresu.html">Všechny okresy →</a>`;
  const crumbs = [
    {name:'Mapa', href:'index.html', abs:SITE},
    {name:'Pozemky podle okresů', href:'pozemky-podle-okresu.html', abs:SITE+'pozemky-podle-okresu.html'},
  ];
  if(hasKrajPage.has(kraj)) crumbs.push({name:dispK, href:krajFile(kraj), abs:SITE+krajFile(kraj)});
  crumbs.push({name:'Okres '+okres, abs:SITE+file});

  const html = head(title,desc,file,jsonld,crumbs) + `
<main id="obsah">

  <section class="add-hero">
    <div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
    <div class="wrap add-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Okres ${esc(okres)}${kraj?' · '+esc(dispK):''}</div>
      <h1>Pozemky v okrese ${esc(okres)}.</h1>
      <p class="sub">Aktuálně evidujeme <b>${count} ${pluralPozemek(count)}</b> v okrese ${esc(okres)} — ${esc(typeParts.join(', '))}. Vše z <b>veřejných zdrojů</b> na jedné mapě, s prokliky na ověření v katastru. ${minP?('Ceny od <b>'+fmt(minP)+' Kč</b>'+(maxP&&maxP!==minP?' do <b>'+fmt(maxP)+' Kč</b>':'')+'.'):''}</p>
    </div>
  </section>

  <section class="section" style="padding-top:20px;">
    <div class="wrap add-wrap">

      <div class="okr-stats">
        <div class="okr-stat"><b>${count}</b><span>${pluralPozemek(count)}</span></div>
        ${byType.sale?`<div class="okr-stat"><b>${byType.sale}</b><span>na prodej</span></div>`:''}
        ${byType.drazba?`<div class="okr-stat"><b>${byType.drazba}</b><span>dražby</span></div>`:''}
        ${byType.exekuce?`<div class="okr-stat"><b>${byType.exekuce}</b><span>exekuce</span></div>`:''}
        ${byType.obec?`<div class="okr-stat"><b>${byType.obec}</b><span>záměry obcí</span></div>`:''}
      </div>
${priceLine(priceStats(list)) ? `      <p class="okr-more" style="margin-top:2px;">${priceLine(priceStats(list))} — <a href="cena-pozemku.html">ceny pozemků v ČR</a></p>` : ''}

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Prohlédněte si okres ${esc(okres)} na mapě</h3>
          <p>Interaktivní mapa s filtrováním podle ceny, výměry i druhu pozemku — a odkazy do katastru na ověření.</p>
        </div>
        <a href="${krajLink}" class="btn-primary btn-glow">Otevřít na mapě →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Nabídky pozemků v okrese ${esc(okres)}</h2>
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejnižší ceny. Data pocházejí z veřejných zdrojů (inzertní portály, evidence dražeb, státní pozemkový úřad) a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

${sibLinks ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Pozemky v okolí</h2>
          <div class="okr-index-grid">
            ${sibLinks}
          </div>
          <p class="okr-more">${krajBack}</p>
        </div>
      </div>` : ''}

      <p class="okr-more" style="margin-top:22px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> a <a href="list-vlastnictvi-katastr.html">jak číst list vlastnictví</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(file, html);
  okresPages.push({okres,kraj,file,count});
}

// ---------- KRAJ ----------
for(const kraj of eligibleKraj){
  const meta = KRAJ_META[kraj];
  const list = byKraj[kraj].slice();
  const file = krajFile(kraj);
  const count = list.length;
  const byType={}; for(const o of list) byType[o.type]=(byType[o.type]||0)+1;
  const typeParts = Object.keys(byType).sort((a,b)=>byType[b]-byType[a]).map(t=>`${byType[t]}× ${(TYPE_LABEL[t]||t).toLowerCase()}`);
  const priced=list.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0], maxP=priced[priced.length-1];
  const okresList = Object.keys(byOkres).filter(ok=>OKRES_KRAJ[ok]===kraj).sort((a,b)=>byOkres[b].length-byOkres[a].length);
  const okresGrid = okresList.map(ok=>{
    const c=byOkres[ok].length;
    return hasOkresPage.has(ok)
      ? `<a href="${okresFile(ok)}">${esc(ok)} <span>${c} ${pluralPozemek(c)}</span></a>`
      : `<a href="index.html?kraj=${encodeURIComponent(meta.mapName)}#mapa">${esc(ok)} <span>${c} ${pluralPozemek(c)}</span></a>`;
  }).join('\n            ');
  list.sort((a,b)=>(a.price||1e15)-(b.price||1e15));
  const rows = list.slice(0,12).map(itemRow).join('\n');

  const title = `Pozemky ${meta.disp} — prodej, dražby, exekuce | Parcelka`;
  const desc = `Pozemky ${meta.loc} na jedné mapě — ${count} ${pluralPozemek(count)} z veřejných zdrojů: prodeje, dražby i exekuce. ${minP?('Ceny od '+fmt(minP)+' Kč. '):''}Vyberte okres a ověřte nabídku v katastru.`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":`Pozemky ${meta.disp}`,"inLanguage":"cs","description":`Nabídky pozemků ${meta.loc} — prodeje, dražby a exekuce z veřejných zdrojů.`,"mainEntityOfPage":`https://parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"}};
  const crumbs = [
    {name:'Mapa', href:'index.html', abs:SITE},
    {name:'Pozemky podle okresů', href:'pozemky-podle-okresu.html', abs:SITE+'pozemky-podle-okresu.html'},
    {name:meta.disp, abs:SITE+file},
  ];

  const html = head(title,desc,file,jsonld,crumbs) + `
<main id="obsah">

  <section class="add-hero">
    <div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
    <div class="wrap add-wrap">
      <div class="eyebrow"><span class="live-dot"></span>${esc(meta.disp)}</div>
      <h1>Pozemky ${esc(meta.loc)}.</h1>
      <p class="sub">Aktuálně evidujeme <b>${count} ${pluralPozemek(count)}</b> ${esc(meta.loc)} — ${esc(typeParts.join(', '))}. Vyberte okres, nebo si otevřete celý kraj na mapě. ${minP?('Ceny od <b>'+fmt(minP)+' Kč</b>'+(maxP&&maxP!==minP?' do <b>'+fmt(maxP)+' Kč</b>':'')+'.'):''}</p>
    </div>
  </section>

  <section class="section" style="padding-top:20px;">
    <div class="wrap add-wrap">

      <div class="okr-stats">
        <div class="okr-stat"><b>${count}</b><span>${pluralPozemek(count)}</span></div>
        <div class="okr-stat"><b>${okresList.length}</b><span>okresů</span></div>
        ${byType.drazba?`<div class="okr-stat"><b>${byType.drazba}</b><span>dražby</span></div>`:''}
        ${byType.exekuce?`<div class="okr-stat"><b>${byType.exekuce}</b><span>exekuce</span></div>`:''}
      </div>
${priceLine(priceByKraj[kraj]||{}) ? `      <p class="okr-more" style="margin-top:2px;">${priceLine(priceByKraj[kraj]||{})} — <a href="cena-pozemku.html">ceny pozemků v ČR</a></p>` : ''}

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Otevřít ${esc(meta.disp)} na mapě</h3>
          <p>Celý kraj na interaktivní mapě — filtrujte podle ceny, výměry i druhu pozemku a proklikněte se do katastru.</p>
        </div>
        <a href="index.html?kraj=${encodeURIComponent(meta.mapName)}#mapa" class="btn-primary btn-glow">Otevřít na mapě →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Vyberte okres</h2>
          <div class="okr-index-grid">
            ${okresGrid}
          </div>
        </div>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Nejlevnější pozemky ${esc(meta.loc)}</h2>
          <p class="rules-note" style="margin-top:0;">Ukázka nejnižších cen napříč krajem. Data z veřejných zdrojů se mohou měnit — aktuální stav ověřte u zdroje a v katastru.</p>
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

      <p class="okr-more" style="margin-top:22px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> nebo <a href="pozemky-podle-okresu.html">všechny kraje a okresy</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(file, html);
  krajPages.push({kraj,file,count});
}

// ---------- DRAŽBY (národní přehled) ----------
const drazby = all.filter(o=>o.type==='drazba').sort((a,b)=>(a.price||1e15)-(b.price||1e15));
{
  const count = drazby.length;
  const priced = drazby.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0];
  const file='drazby-pozemku-nabidky.html';
  const rows = drazby.map(itemRow).join('\n');
  const title = `Dražby pozemků — aktuální nabídky v ČR | Parcelka`;
  const desc = `${count} ${pluralPozemek(count)} v dražbě z celé ČR na jedné mapě — z veřejné evidence dražeb. ${minP?('Vyvolávací ceny od '+fmt(minP)+' Kč. '):''}Jak dražba funguje i na co si dát pozor.`;
  const items = drazby.slice(0,20).map((o,i)=>({"@type":"ListItem","position":i+1,"name":`${o.place} — dražba${o.area?', '+o.area+' m²':''}`}));
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":"Dražby pozemků v ČR","inLanguage":"cs","description":`Aktuální nabídky pozemků v dražbě z veřejné evidence dražeb.`,"mainEntityOfPage":`https://parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":{"@type":"ItemList","numberOfItems":count,"itemListElement":items}};
  const crumbs = [
    {name:'Mapa', href:'index.html', abs:SITE},
    {name:'Koupě v dražbě', href:'drazby-pozemku.html', abs:SITE+'drazby-pozemku.html'},
    {name:'Aktuální dražby', abs:SITE+file},
  ];
  const html = head(title,desc,file,jsonld,crumbs) + `
<main id="obsah">

  <section class="add-hero">
    <div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
    <div class="wrap add-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Dražby pozemků · celá ČR</div>
      <h1>Dražby pozemků — aktuální nabídky.</h1>
      <p class="sub">Evidujeme <b>${count} ${pluralPozemek(count)}</b> v dražbě z celé České republiky, z <b>veřejné evidence dražeb</b>. ${minP?('Vyvolávací ceny od <b>'+fmt(minP)+' Kč</b>. '):''}V dražbě jde často pořídit pozemek pod tržní cenou — ale je potřeba znát pravidla.</p>
    </div>
  </section>

  <section class="section" style="padding-top:20px;">
    <div class="wrap add-wrap">

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Nevíte, jak dražba funguje?</h3>
          <p>Dražební jistota, vyvolávací cena, příklep i lhůty — vysvětlujeme srozumitelně krok za krokem.</p>
        </div>
        <a href="drazby-pozemku.html" class="btn-primary btn-glow">Jak koupit v dražbě →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Pozemky v dražbě</h2>
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejnižší ceny. Údaje pocházejí z veřejné evidence dražeb a mohou se v čase měnit — konání, podmínky a aktuální stav vždy ověřte přímo v dražební vyhlášce a v katastru nemovitostí.</p>
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

      <p class="okr-more" style="margin-top:22px;">Návod krok za krokem: <a href="drazby-pozemku.html">Jak koupit pozemek v dražbě</a> · <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(file, html);
}

// ---------- CENOVÝ PŘEHLED (unikátní: kolik stojí m² podle druhu a kraje) ----------
{
  const file='cena-pozemku.html';
  // Národní karty podle druhu (jen skupiny s dost vzorky).
  const natGroups = DRUH_GROUPS.filter(g=>priceNational[g]);
  const natCards = natGroups.map(g=>{
    const s=priceNational[g];
    return `<div class="okr-stat" style="min-width:150px;"><b>${fmt(s.med)} Kč/m²</b><span>${esc(g)} · ${s.lo}–${s.hi} Kč/m² · ${s.n} nabídek</span></div>`;
  }).join('\n        ');

  // Kraje seřazené podle mediánu zemědělské půdy (nejvíc dat) – barevná „teplota".
  const key='Zemědělská půda';
  const rowsData = eligibleKraj
    .map(k=>({k, s:priceByKraj[k] && priceByKraj[k][key]}))
    .filter(x=>x.s)
    .sort((a,b)=>b.s.med-a.s.med);
  const meds = rowsData.map(x=>x.s.med);
  const minM=Math.min.apply(null,meds), maxM=Math.max.apply(null,meds);
  function heat(v){ // 0..1 → jemné copper pozadí
    const t = maxM>minM ? (v-minM)/(maxM-minM) : 0.5;
    return `background:rgba(91,184,214,${(0.06+t*0.20).toFixed(3)});`;
  }
  const krajRows = rowsData.map(x=>{
    const les = priceByKraj[x.k] && priceByKraj[x.k]['Lesní pozemek'];
    const disp = (KRAJ_META[x.k]||{}).disp || (x.k+' kraj');
    const link = hasKrajPage.has(x.k) ? krajFile(x.k) : ('index.html?kraj='+encodeURIComponent((KRAJ_META[x.k]||{}).mapName||x.k)+'#mapa');
    return `      <div class="okr-item" style="${heat(x.s.med)}">
        <a class="okr-place" href="${link}" style="text-decoration:none;">${esc(disp)}</a>
        <span class="okr-meta">Zemědělská půda <b>${fmt(x.s.med)} Kč/m²</b> · rozpětí ${x.s.lo}–${x.s.hi} · ${x.s.n} nab.${les?` &nbsp;·&nbsp; les <b>${fmt(les.med)} Kč/m²</b> (${les.n})`:''}</span>
      </div>`;
  }).join('\n');

  // Tabulka po okresech (zemědělská půda, jen kde dost vzorků), seřazeno od nejdražšího.
  const okrData = Object.keys(priceByOkres)
    .map(ok=>({ok, s:priceByOkres[ok] && priceByOkres[ok][key]}))
    .filter(x=>x.s)
    .sort((a,b)=>b.s.med-a.s.med);
  const okrMeds = okrData.map(x=>x.s.med);
  const okMin = okrMeds.length?Math.min.apply(null,okrMeds):0, okMax = okrMeds.length?Math.max.apply(null,okrMeds):1;
  function heatOk(v){ const t = okMax>okMin ? (v-okMin)/(okMax-okMin) : 0.5; return `background:rgba(91,184,214,${(0.06+t*0.20).toFixed(3)});`; }
  const okresRows = okrData.map(x=>{
    const link = hasOkresPage.has(x.ok) ? okresFile(x.ok) : ('index.html?kraj='+encodeURIComponent((KRAJ_META[OKRES_KRAJ[x.ok]]||{}).mapName||'')+'#mapa');
    return `      <div class="okr-item" style="${heatOk(x.s.med)}">
        <a class="okr-place" href="${link}" style="text-decoration:none;">${esc(x.ok)}</a>
        <span class="okr-meta">Zemědělská půda <b>${fmt(x.s.med)} Kč/m²</b> · rozpětí ${x.s.lo}–${x.s.hi} · ${x.s.n} nab.</span>
      </div>`;
  }).join('\n');

  // Výrazný souhrn: nejlevnější a nejdražší okresy (zemědělská půda).
  const cheapest = okrData.slice(-3).reverse();
  const dearest  = okrData.slice(0,3);
  const okrLink = ok => hasOkresPage.has(ok) ? okresFile(ok) : ('index.html?kraj='+encodeURIComponent((KRAJ_META[OKRES_KRAJ[ok]]||{}).mapName||'')+'#mapa');
  const chips = list => list.map(x=>`<a class="okr-place" href="${okrLink(x.ok)}" style="text-decoration:none;">${esc(x.ok)} <b>${fmt(x.s.med)} Kč/m²</b></a>`).join('<span class="crumb-sep" aria-hidden="true">·</span> ');
  const highlight = (cheapest.length && dearest.length) ? `
      <div class="okr-stats" style="gap:14px;">
        <div class="okr-stat" style="min-width:0;flex:1 1 240px;"><span style="color:var(--c-sale,#3E9B63);">Nejlevnější zemědělská půda</span><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:14px;">${chips(cheapest)}</div></div>
        <div class="okr-stat" style="min-width:0;flex:1 1 240px;"><span style="color:var(--c-exekuce,#C15B44);">Nejdražší zemědělská půda</span><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:14px;">${chips(dearest)}</div></div>
      </div>` : '';

  const natZ = priceNational[key];
  const title = 'Ceny pozemků v ČR — kolik stojí m² pole, lesa a zahrady | Parcelka';
  const desc = `Kolik stojí metr čtvereční pozemku v Česku? Orientační medián cen z aktuálních nabídek podle druhu (zemědělská půda, les, zahrada) a podle kraje.${natZ?' Zemědělská půda medián '+fmt(natZ.med)+' Kč/m².':''} Zdarma, z veřejných zdrojů.`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":"Ceny pozemků v ČR","inLanguage":"cs","description":"Orientační medián cen pozemků (Kč/m²) podle druhu a kraje z aktuálních nabídek.","mainEntityOfPage":`https://parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"}};
  const crumbs=[{name:'Mapa',href:'index.html',abs:SITE},{name:'Ceny pozemků',abs:SITE+file}];

  const html = head(title,desc,file,jsonld,crumbs) + `
<main id="obsah">

  <section class="add-hero">
    <div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
    <div class="wrap add-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Cenový přehled · celá ČR</div>
      <h1>Kolik stojí pozemek?</h1>
      <p class="sub">Jednoduchá odpověď na otázku, kterou si klade každý kupující: <b>kolik je metr čtvereční pozemku?</b> Spočítáme <b>orientační medián</b> z aktuálních nabídek na Parcelce — zvlášť pro pole, les i zahradu, protože cena za m² se u nich zásadně liší. Takový přehled zdarma nikde jinde nenajdete.</p>
    </div>
  </section>

  <section class="section" style="padding-top:20px;">
    <div class="wrap add-wrap">

      <div class="add-card">
        <div class="rules-sect">
          <h2>Medián ceny podle druhu (celá ČR)</h2>
          <div class="okr-stats" style="margin-bottom:0;">
        ${natCards || '<p class="rules-note" style="margin:0;">Zatím není dost dat pro spolehlivý výpočet.</p>'}
          </div>
          <p class="rules-note">Jde o <b>medián nabídkových cen</b> (ne realizovaných prodejů) z pozemků, u kterých známe cenu i výměru. Rozpětí ukazuje typické ceny (25.–75. percentil, tj. bez krajních výkyvů). Skutečná cena závisí na kvalitě půdy (BPEJ), přístupu, sítích i lokalitě — berte to jako orientaci, ne odhad konkrétního pozemku.</p>
        </div>
      </div>
${highlight ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Kde je půda nejlevnější a nejdražší</h2>
${highlight}
        </div>
      </div>` : ''}

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Zemědělská půda podle kraje</h2>
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejdražšího kraje. Klepnutím otevřete nabídky v kraji. Tmavší = dražší.</p>
          <div class="okr-list">
${krajRows || '      <p class="rules-note" style="margin:0;">Zatím není dost dat po krajích.</p>'}
          </div>
        </div>
      </div>
${okresRows ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Zemědělská půda podle okresu</h2>
          <p class="rules-note" style="margin-top:0;">Okresy s dostatkem nabídek, seřazeno od nejdražšího. Klepnutím otevřete okres.</p>
          <div class="okr-list">
${okresRows}
          </div>
        </div>
      </div>` : ''}

      <div class="add-cross" style="margin-top:22px;">
        <div class="acx-copy">
          <h3>Najděte konkrétní pozemek</h3>
          <p>Otevřete mapu a porovnejte ceny přímo v místě, které vás zajímá — s prokliky do katastru.</p>
        </div>
        <a href="index.html#mapa" class="btn-primary btn-glow">Otevřít mapu →</a>
      </div>

      <p class="okr-more" style="margin-top:22px;">Souvisí: <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> · <a href="stavebni-vs-zemedelsky-pozemek.html">stavební vs. zemědělský pozemek</a> · <a href="pozemky-podle-okresu.html">pozemky podle regionu</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(file, html);
}

// ---------- ROZCESTNÍK ----------
const totalListed = okresPages.reduce((s,p)=>s+p.count,0);
let krajGrid = '';
for(const k of eligibleKraj){
  const m=KRAJ_META[k];
  krajGrid += `            <a href="${krajFile(k)}">${esc(m.disp)} <span>${byKraj[k].length} ${pluralPozemek(byKraj[k].length)}</span></a>\n`;
}
okresPages.sort((a,b)=>KRAJ_ORDER.indexOf(a.kraj)-KRAJ_ORDER.indexOf(b.kraj) || b.count-a.count);
let okresBody='', lastKraj=null;
for(const p of okresPages){
  if(p.kraj!==lastKraj){
    if(lastKraj!==null) okresBody += `          </div>\n`;
    const kd = (KRAJ_META[p.kraj]||{}).disp || (p.kraj+' kraj');
    const kh = hasKrajPage.has(p.kraj) ? `<a href="${krajFile(p.kraj)}" style="color:inherit;">${esc(kd)}</a>` : esc(kd);
    okresBody += `          <h3 class="okr-kraj-h">${kh}</h3>\n          <div class="okr-index-grid">\n`;
    lastKraj=p.kraj;
  }
  okresBody += `            <a href="${p.file}">${esc(p.okres)} <span>${p.count} ${pluralPozemek(p.count)}</span></a>\n`;
}
if(lastKraj!==null) okresBody += `          </div>\n`;

const idxTitle='Pozemky podle krajů a okresů — prodej, dražby a exekuce | Parcelka';
const idxDesc=`Přehled pozemků v ${krajPages.length} krajích a ${okresPages.length} okresech Česka — prodeje, dražby a exekuce z veřejných zdrojů na jedné mapě. Vyberte region a prohlédněte si aktuální nabídky.`;
const idxJsonld={"@context":"https://schema.org","@type":"CollectionPage","name":"Pozemky podle krajů a okresů","inLanguage":"cs","description":idxDesc,"mainEntityOfPage":"https://parcelaka.cz/pozemky-podle-okresu.html","publisher":{"@type":"Organization","name":"Parcelka"}};
const idxCrumbs=[{name:'Mapa', href:'index.html', abs:SITE},{name:'Pozemky podle krajů a okresů', abs:SITE+'pozemky-podle-okresu.html'}];
const idxHtml = head(idxTitle,idxDesc,'pozemky-podle-okresu.html',idxJsonld,idxCrumbs) + `
<main id="obsah">

  <section class="add-hero">
    <div class="aurora" aria-hidden="true"><span class="a1"></span><span class="a2"></span><span class="a3"></span></div>
    <div class="wrap add-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Pozemky podle regionu</div>
      <h1>Pozemky podle krajů a okresů.</h1>
      <p class="sub">Vyberte kraj nebo okres a prohlédněte si aktuální nabídky pozemků — prodeje, dražby i exekuce z veřejných zdrojů. Pokryto <b>${krajPages.length} krajů</b> a <b>${okresPages.length} okresů</b>, přes <b>${fmt(totalListed)} ${pluralPozemek(totalListed)}</b> na jedné mapě.</p>
    </div>
  </section>

  <section class="section" style="padding-top:20px;">
    <div class="wrap add-wrap">

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Nechcete vybírat region?</h3>
          <p>Otevřete celou mapu Česka a filtrujte podle ceny, výměry i druhu pozemku.</p>
        </div>
        <a href="index.html#mapa" class="btn-primary btn-glow">Otevřít mapu →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Podle kraje</h2>
          <div class="okr-index-grid">
${krajGrid}          </div>
        </div>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Podle okresu</h2>
${okresBody}
        </div>
      </div>

    </div>
  </section>

</main>
` + footer();
write('pozemky-podle-okresu.html', idxHtml);

// ---------- SITEMAP ----------
const staticUrls=[
  {loc:'',cf:'daily',pr:'1.0'},
  {loc:'pridat.html',cf:'weekly',pr:'0.8'},
  {loc:'pozemky-podle-okresu.html',cf:'weekly',pr:'0.9'},
  {loc:'drazby-pozemku-nabidky.html',cf:'weekly',pr:'0.7'},
  {loc:'drazby-pozemku.html',cf:'monthly',pr:'0.7'},
  {loc:'exekuce-pozemku.html',cf:'monthly',pr:'0.7'},
  {loc:'kolik-stoji-koupe-pozemku.html',cf:'monthly',pr:'0.7'},
  {loc:'pozemek-od-obce.html',cf:'monthly',pr:'0.7'},
  {loc:'pristupova-cesta-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'stavebni-vs-zemedelsky-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'list-vlastnictvi-katastr.html',cf:'monthly',pr:'0.7'},
  {loc:'vecne-bremeno-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'hypoteka-na-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'uzemni-plan-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'cena-pozemku.html',cf:'weekly',pr:'0.8'},
  {loc:'pravidla-inzerce.html',cf:'monthly',pr:'0.4'},
  {loc:'podminky.html',cf:'yearly',pr:'0.3'},
  {loc:'ochrana-udaju.html',cf:'yearly',pr:'0.3'},
  {loc:'kontakt.html',cf:'yearly',pr:'0.3'},
];
let sm='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for(const u of staticUrls) sm+=`  <url>\n    <loc>https://parcelaka.cz/${u.loc}</loc>\n    <changefreq>${u.cf}</changefreq>\n    <priority>${u.pr}</priority>\n  </url>\n`;
for(const p of krajPages) sm+=`  <url>\n    <loc>https://parcelaka.cz/${p.file}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
for(const p of okresPages) sm+=`  <url>\n    <loc>https://parcelaka.cz/${p.file}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
sm+='</urlset>\n';
write('sitemap.xml', sm);

console.log(`Vygenerováno: ${okresPages.length} okresních + ${krajPages.length} krajských stránek + dražby (${drazby.length}) + rozcestník. Sitemap: ${staticUrls.length+krajPages.length+okresPages.length} URL.`);
