/* ===== Store settings: edit here, nothing else needs to change ===== */
window.STORE = {
  BRAND: "Wholesale Builder Beam",          // swap brand name here (also run ../swap-brand.sh for page text)
  EMAIL: "wholesalebuilderbeam@agentmail.to",         // store inbox
  ORDER_ENDPOINT: "",                       // Paste the Google Apps Script web app URL (.../exec) here after deploying. Empty = opens the email app instead.
  CHECKOUT_MODE: "quote",                   // "quote" = submit order -> freight confirmed -> payment link sent. "stripe" = live checkout (needs backend, see STATUS.md)
  STRIPE_CHECKOUT_ENDPOINT: "",             // PLACEHOLDER: serverless URL that creates a Stripe Checkout Session. NO KEYS IN THIS FILE.
  ORIGIN: { zip: "73069", lat: 35.2204, lon: -97.4577, label: "Norman, OK" },
  DRAFT_PRICING: true                       // DRAFT prices pending owner approval. Set false only after approval.
};
