// Průzkum: jaké TYPY dražeb má okdrazby u pozemků? (rozlišit dobrovolná vs exekuce/insolvence)
const API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)', accept: 'application/json' };
const get = async (u) => { const r = await fetch(u, { headers: UA, signal: AbortSignal.timeout(20000) }); return r.status === 200 ? r.json() : null; };
// najdi maxId z homepage
let maxId = 27100;
try { const h = await (await fetch('https://www.okdrazby.cz/', { headers: UA })).text(); const ids = [...h.matchAll(/\/drazba\/(\d+)-/g)].map(m => +m[1]); if (ids.length) maxId = Math.max(...ids); } catch {}
const types = {}, prep = {}, examples = [];
let checked = 0, land = 0;
for (let id = maxId + 10; id >= maxId - 800 && checked < 800; id--) {
  checked++;
  let j; try { j = await get(`${API}/auctions/${id}`); } catch { continue; }
  if (!j) continue;
  const cats = j.categoriesLocalized || [];
  if (!cats.includes('Land')) continue;
  if (!/Prepared|Ongoing|Running|Published/i.test(j.statusLocalized || '')) continue;
  land++;
  const t = j.typeLocalized || ('typeId=' + j.typeId);
  types[t] = (types[t] || 0) + 1;
  const p = j.preparationTypeLocalized || '(none)';
  prep[p] = (prep[p] || 0) + 1;
  if (examples.length < 8) examples.push(`${t} | prep:${p} | typeId:${j.typeId} | ${(j.name || '').slice(0, 45)}`);
}
console.log('\n===== okdrazby typy pozemkových dražeb =====');
console.log('prověřeno ID:', checked, '| pozemků aktivních:', land);
console.log('\ntypeLocalized:', JSON.stringify(types, null, 0));
console.log('preparationTypeLocalized:', JSON.stringify(prep, null, 0));
console.log('\npříklady:'); for (const e of examples) console.log('  ' + e);
console.log('--- hotovo ---');
