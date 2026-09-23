// Parcelka — Stripe webhook. Stripe sem pošle zprávu po zaplacení.
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

  const key = (process.env.STRIPE_SECRET_KEY || '').trim();
  const whSecret = (process.env.STRIPE_WEBHOOK_SECRET || '').trim();
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
    /* NEDORUČENO. Tady se má podle listingRef nastavit v tabulce listings
       featured = true (sloupec i index už existují, viz supabase/00-vse.sql)
       a odeslat potvrzení. Nic z toho se neděje — platba se jen zapíše.
       Komentář tu dřív říkal „až bude databáze"; databáze mezitím je,
       takže ta výmluva neplatí a stav je prostě nedodělaný.
       Aby mezitím nikdo nezaplatil nadarmo, je api/create-checkout.js
       zavřený (viz ZVYRAZNENI_ZAPNUTO tam). Kdyby se sem přesto platba
       dostala, musí to být vidět jako CHYBA, ne jako běžný záznam. */
    console.error('POZOR: zaplaceno zvýraznění, ale doručení není hotové — peníze bez protihodnoty.',
      { listingRef: listingRef, email: s.customer_email, amount: s.amount_total });
  }

  res.status(200).json({ received: true });
};
