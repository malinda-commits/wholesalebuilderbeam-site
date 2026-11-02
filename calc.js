/* Pricing + freight estimate engine. Works in the browser and in Node (for tests). DRAFT numbers. */
(function (root) {
  var PRICING = {
    // $/linear ft, by the larger of height or width (inches)
    tiers: [ { max: 6, unfinished: 125 }, { max: 8, unfinished: 130 }, { max: 10, unfinished: 150 }, { max: 12, unfinished: 170 } ],
    prestainAdd: 15,          // $/LF added for prestained
    volumeBreakLF: 200,       // at or above this many LF...
    volumeDiscount: 5,        // ...take $5/LF off
    minLF: 40                 // minimum order (linear ft)
  };
  var FREIGHT = {
    circuity: 1.18,           // straight-line miles x 1.18 = rough road miles
    base: 150,                // terminal/handling base per shipment
    perMile: 0.45,            // $/road mile for first 500 lb
    perMilePer500lb: 0.12,    // extra $/mile for each additional 500 lb
    crateBase: 60, cratePerLF: 1.5,
    lbPerBoardFt: 3.5, crateWeightFactor: 1.15,
    overlength: [ { under: 8, fee: 0 }, { under: 12, fee: 350 }, { under: 16, fee: 650 }, { under: 20, fee: 900 }, { under: 24.01, fee: 1300 } ],
    jobsiteFee: 175,          // residential / jobsite / no-dock (liftgate or limited access)
    localMaxMiles: 100,       // road miles from Norman for our own truck
    localBase: 75, localPerMile: 2.0,
    maxLengthFt: 24
  };
  function tierFor(h, w) { var m = Math.max(h, w); for (var i = 0; i < PRICING.tiers.length; i++) if (m <= PRICING.tiers[i].max) return PRICING.tiers[i]; return null; }
  function price(o) { // o: {h,w,finish,lines:[{len,qty}]}
    var lf = 0, longest = 0, pieces = 0;
    (o.lines || []).forEach(function (l) { var len = +l.len || 0, q = +l.qty || 0; if (len > 0 && q > 0) { lf += len * q; pieces += q; longest = Math.max(longest, len); } });
    var t = tierFor(+o.h, +o.w);
    if (!t) return { lf: lf, pieces: pieces, longest: longest, quoteOnly: true };
    var rate = t.unfinished + (o.finish === "prestained" ? PRICING.prestainAdd : 0);
    var disc = lf >= PRICING.volumeBreakLF ? PRICING.volumeDiscount : 0;
    rate -= disc;
    return { lf: lf, pieces: pieces, longest: longest, rate: rate, volumeDiscount: disc, subtotal: Math.round(lf * rate * 100) / 100, belowMin: lf < PRICING.minLF };
  }
  function haversine(a, b) { var R = 3958.8, r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLon = (b.lon - a.lon) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return 2 * R * Math.asin(Math.sqrt(x)); }
  function weightLb(h, w, lf) { var bfPerFt = (2 * h + w) / 12; return Math.round(bfPerFt * FREIGHT.lbPerBoardFt * lf * FREIGHT.crateWeightFactor); }
  function overlengthFee(longest) { for (var i = 0; i < FREIGHT.overlength.length; i++) if (longest < FREIGHT.overlength[i].under) return FREIGHT.overlength[i].fee; return null; }
  function ship(o, origin, dest, method) { // method: "freight" | "local" | "pickup"
    var p = price(o), F = FREIGHT;
    if (method === "pickup") return { method: "pickup", total: 0 };
    var miles = Math.round(haversine(origin, dest) * F.circuity);
    var wt = weightLb(+o.h, +o.w, p.lf);
    if (p.longest > F.maxLengthFt) return { method: method, miles: miles, weight: wt, quoteOnly: true, reason: "Beams over " + F.maxLengthFt + " ft ship by custom quote." };
    if (method === "local") {
      if (miles > F.localMaxMiles) return { method: "local", miles: miles, unavailable: true };
      return { method: "local", miles: miles, weight: wt, total: Math.round(F.localBase + F.localPerMile * miles) };
    }
    var extra500 = Math.max(0, Math.ceil(wt / 500) - 1);
    var linehaul = F.base + miles * (F.perMile + F.perMilePer500lb * extra500);
    var crate = F.crateBase + F.cratePerLF * p.lf;
    var over = overlengthFee(p.longest);
    var jobsite = o.jobsite ? F.jobsiteFee : 0;
    var total = Math.round(linehaul + crate + over + jobsite);
    return { method: "freight", miles: miles, weight: wt, linehaul: Math.round(linehaul), crate: Math.round(crate), overlength: over, jobsite: jobsite, total: total,
             low: Math.round(total * 0.85 / 5) * 5, high: Math.round(total * 1.2 / 5) * 5 };
  }
  var api = { PRICING: PRICING, FREIGHT: FREIGHT, price: price, ship: ship, haversine: haversine, weightLb: weightLb };
  if (typeof module !== "undefined") module.exports = api; else root.Calc = api;
})(this);
