// Pozemkomat — Stripe webhook. Stripe sem pošle zprávu po zaplacení.
// Ověříme podpis a při úspěšné platbě zapneme inzerátu zvýraznění.
//
// Poběží na Vercelu. Potřebuje STRIPE_SECRET_KEY a STRIPE_WEBHOOK_SECRET.
// Adresu této funkce (…/api/stripe-webhook) zadáte ve Stripe:
//   Developers → Webhooks → Add endpoint → událost checkout.session.completed

const Stripe = require('stripe');

// Stripe podpis se ověřuje nad SUROVÝM tělem požadavku — vypneme parsování.
module.exports.config = { api: { bodyParser: false } };

function rawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.status(405).end(); return; }

  const key = process.env.STRIPE_SECRET_KEY;
  const whSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!key || !whSecret) { res.status(500).send('Chybí Stripe klíče'); return; }

  const stripe = new Stripe(key);
  let event;
  try {
    const buf = await rawBody(req);
    event = stripe.webhooks.constructEvent(buf, req.headers['stripe-signature'], whSecret);
  } catch (e) {
    res.status(400).send('Neplatný podpis webhooku: ' + e.message);
    return;
  }

  if (event.type === 'checkout.session.completed') {
    const s = event.data.object;
    const listingRef = (s.metadata && s.metadata.listingRef) || '';
    // Fáze 3 (až bude databáze): podle listingRef nastavit v tabulce listings
    // featured=true a odeslat potvrzovací e-mail přes Resend.
    console.log('Zaplaceno zvýraznění:', { listingRef: listingRef, email: s.customer_email, amount: s.amount_total });
  }

  res.status(200).json({ received: true });
};
