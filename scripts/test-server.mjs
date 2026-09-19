// Zkušební server pro test scripts/test-kontrola-e2e.mjs.
//
// Předstírá Supabase i cizí weby, na které inzeráty odkazují — a hlavně
// umí chyby, které se v testu jinak nedají vyvolat: jeden odkaz DVAKRÁT
// po sobě shodí spojení a teprve potřetí odpoví (tím se ověří, že
// opakování pokusů skutečně funguje a nezpůsobí planý poplach).
//
// Sám od sebe se nespouští — startuje ho test.
import http from 'node:http';
import jpeg from 'jpeg-js';

const PORT = 8200;
let pokusuNaVypadek = 0;
export const zapsano = [];

function obrazek(odstin) {
  const N = 64, data = Buffer.alloc(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    data[i] = (x * 4 + odstin) % 256; data[i + 1] = (y * 4 + odstin) % 256; data[i + 2] = 128; data[i + 3] = 255;
  }
  return jpeg.encode({ data, width: N, height: N }, 80).data;
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const posli = (kod, telo, typ) => { res.writeHead(kod, { 'content-type': typ || 'application/json' }); res.end(telo); };

  // --- falešná Supabase ---
  if (u.pathname === '/rest/v1/listings') {
    return posli(200, JSON.stringify([
      { id: 'a1', place: 'Kolín', okres: 'Kolín', url: `http://localhost:${PORT}/odkaz-ok`,
        photos: [`http://localhost:${PORT}/foto1.jpg`], status: 'approved' },
      { id: 'a2', place: 'Písek', okres: 'Písek', url: `http://localhost:${PORT}/odkaz-vypadek`,
        photos: [`http://localhost:${PORT}/foto-chybi.jpg`], status: 'approved' },
      { id: 'a3', place: 'Tábor', okres: 'Tábor', url: `http://localhost:${PORT}/odkaz-mrtvy`,
        photos: [`http://localhost:${PORT}/foto-html.jpg`], status: 'approved' },
      { id: 'a4', place: 'Beroun', okres: 'Beroun', url: `http://localhost:${PORT}/odkaz-jinam`,
        photos: [`http://localhost:${PORT}/foto1.jpg`], status: 'approved' },   // stejná fotka jako a1
    ]));
  }
  if (u.pathname === '/rest/v1/listing_checks' && req.method === 'GET') return posli(200, '[]');
  if (u.pathname === '/rest/v1/listing_checks' && req.method === 'POST') {
    let telo = '';
    req.on('data', (c) => (telo += c));
    return req.on('end', () => { zapsano.push(JSON.parse(telo)); posli(201, ''); });
  }

  // --- falešné cizí weby ---
  if (u.pathname === '/odkaz-ok') return posli(200, 'ok', 'text/html');
  if (u.pathname === '/odkaz-mrtvy') return posli(404, 'nenalezeno', 'text/html');
  if (u.pathname === '/odkaz-vypadek') {
    pokusuNaVypadek++;
    if (pokusuNaVypadek < 3) { res.socket.destroy(); return; }    // dvakrát shodíme spojení
    return posli(200, 'uz to jde', 'text/html');
  }
  if (u.pathname === '/odkaz-jinam') {
    res.writeHead(302, { location: `http://127.0.0.1:${PORT}/parkovaci` });   // jiná doména
    return res.end();
  }
  if (u.pathname === '/parkovaci') return posli(200, 'reklama', 'text/html');

  if (u.pathname === '/foto1.jpg') return posli(200, obrazek(10), 'image/jpeg');
  if (u.pathname === '/foto-chybi.jpg') return posli(404, 'neni', 'text/plain');
  if (u.pathname === '/foto-html.jpg') return posli(200, '<html>chyba</html>', 'text/html; charset=utf-8');

  posli(404, 'nenalezeno', 'text/plain');
});

server.listen(PORT, () => console.log('falešný server běží na ' + PORT));
process.on('SIGTERM', () => server.close());
