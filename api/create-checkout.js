// Pozemkomat — vytvoření platby za zvýraznění inzerátu (299 Kč) přes Stripe.
//
// Web sem pošle POST { listingRef, email }. Funkce založí Stripe Checkout
// a vrátí { url } — na tu adresu web zákazníka přesměruje. Po zaplacení
// Stripe zavolá webhook (api/stripe-webhook.js), který zvýraznění zapne.
//
// Poběží na Vercelu. Potřebuje proměnnou STRIPE_SECRET_KEY (viz .env.example).

const Stripe = require('stripe');

module.exports = async (req, res) => {
  // CORS — web může běžet na jiné adrese (github.io) než tato funkce (vercel.app)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(204).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Jen POST' }); return; }

  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) { res.status(500).json({ error: 'Chybí STRIPE_SECRET_KEY' }); return; }

  try {
    const stripe = new Stripe(key);
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const listingRef = String(body.listingRef || '').slice(0, 120);
    const email = String(body.email || '').slice(0, 200);
    const site = process.env.SITE_URL || 'https://pozemkomat.vercel.app';

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        quantity: 1,
        price_data: {
          currency: 'czk',
          unit_amount: 29900, // 299 Kč v haléřích
          product_data: {
            name: 'Zvýraznění inzerátu — Pozemkomat',
            description: 'Inzerát se drží výš v seznamu, má výraznější bod na mapě a odznak „Zvýrazněno".'
          }
        }
      }],
      customer_email: email || undefined,
      metadata: { listingRef: listingRef },
      success_url: site + '/pridat.html?platba=ok',
      cancel_url: site + '/pridat.html?platba=zruseno'
    });

    res.status(200).json({ url: session.url });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
