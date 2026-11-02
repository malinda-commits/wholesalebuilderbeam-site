(function () {
  var S = window.STORE, C = window.Calc, f = document.getElementById('f');
  var $ = function (id) { return document.getElementById(id); };
  var money = function (n) { return '$' + Math.round(n).toLocaleString('en-US'); };
  document.querySelectorAll('[data-brand]').forEach(function (el) { el.textContent = S.BRAND; });
  var mail = $('mail'); mail.textContent = S.EMAIL; mail.href = 'mailto:' + S.EMAIL;

  // ---- length lines ----
  function addLine(len, qty) {
    var d = document.createElement('div'); d.className = 'line';
    d.innerHTML = '<label>Length (ft)<input class="len" type="number" inputmode="decimal" min="1" max="24" step="0.5" value="' + (len || '') + '"></label>' +
      '<label>Quantity<input class="qty" type="number" inputmode="numeric" min="1" step="1" value="' + (qty || '') + '"></label>' +
      '<button type="button" aria-label="Remove length">&times;</button>';
    d.querySelector('button').onclick = function () { if ($('lines').children.length > 1) { d.remove(); update(); } };
    $('lines').appendChild(d);
  }
  addLine(16, 4); addLine(12, 2);
  $('addLine').onclick = function () { addLine(); update(); };

  // ---- ZIP lookup: full 5-digit centroids (lazy), fallback to 3-digit prefix ----
  var zipMap = null, zipLoading = null;
  function loadZips() {
    if (zipLoading) return zipLoading;
    zipLoading = fetch('zips.csv').then(function (r) { return r.text(); }).then(function (t) {
      zipMap = {}; t.split('\n').forEach(function (l) { var p = l.split(','); zipMap[p[0]] = [p[1] / 100, p[2] / 100]; });
    }).catch(function () { zipMap = {}; });
    return zipLoading;
  }
  function geo(zip) {
    if (!/^\d{5}$/.test(zip)) return null;
    if (zipMap && zipMap[zip]) return { lat: zipMap[zip][0], lon: zipMap[zip][1], exact: true };
    var p = window.ZIP3[zip.slice(0, 3)]; return p ? { lat: p[0], lon: p[1], exact: false } : null;
  }

  function readOrder() {
    var lines = [].map.call(document.querySelectorAll('.line'), function (d) { return { len: d.querySelector('.len').value, qty: d.querySelector('.qty').value }; });
    return { h: +$('h').value, w: +$('w').value, finish: f.finish.value, jobsite: $('jobsite').checked, lines: lines, method: f.method.value, zip: $('zip').value.trim() };
  }
  var last = null;
  function update() {
    var o = readOrder(), p = C.price(o), rows = [];
    $('stain').style.display = o.finish === 'prestained' ? '' : 'none';
    $('jobsiteRow').style.display = o.method === 'freight' ? '' : 'none';
    $('lfOut').textContent = p.lf.toLocaleString('en-US'); $('pcOut').textContent = p.pieces;
    var sh = null, dest = geo(o.zip);
    if (p.quoteOnly) rows.push(['Beams', 'Custom quote']);
    else {
      rows.push([p.lf + ' LF &times; ' + money(p.rate) + '/LF' + (p.volumeDiscount ? ' (volume rate)' : ''), money(p.subtotal)]);
      if (o.method === 'pickup') sh = C.ship(o, S.ORIGIN, S.ORIGIN, 'pickup');
      else if (dest) sh = C.ship(o, S.ORIGIN, dest, o.method);
      if (!sh) rows.push(['Shipping', o.method === 'pickup' ? '$0' : 'Enter ZIP']);
      else if (sh.quoteOnly) rows.push(['Shipping', 'Custom quote']);
      else if (sh.unavailable) rows.push(['Local delivery', 'Too far (' + sh.miles + ' mi): choose freight']);
      else if (sh.method === 'pickup') rows.push(['Pickup near Norman, OK', '$0']);
      else if (sh.method === 'local') rows.push(['Local delivery, ~' + sh.miles + ' road mi', money(sh.total)]);
      else rows.push(['Freight estimate, ~' + sh.miles + ' mi, ~' + sh.weight.toLocaleString() + ' lb', money(sh.total)],
                     ['<small>Likely range</small>', '<small>' + money(sh.low) + '&ndash;' + money(sh.high) + '</small>']);
      var shipAmt = sh && !sh.quoteOnly && !sh.unavailable ? sh.total : null;
      rows.push(['Estimated total' + (shipAmt === null ? ' (beams only)' : ''), money(p.subtotal + (shipAmt || 0))]);
    }
    var html = '<table>' + rows.map(function (r, i) { return '<tr' + (i === rows.length - 1 && !p.quoteOnly ? ' class="grand"' : '') + '><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'; }).join('') + '</table>';
    if (p.belowMin && p.lf > 0) html += '<p class="hint" style="margin:8px 0 0;color:#b42318">Minimum order is ' + C.PRICING.minLF + ' linear ft.</p>';
    if (S.DRAFT_PRICING) html += '<p class="draft">DRAFT pricing: not final</p>';
    html += '<p class="hint" style="margin:8px 0 0">Estimate. Sales tax is handled on the final invoice. Final freight confirmed before payment.</p>';
    $('summary').innerHTML = html;
    last = { order: o, price: p, ship: sh };
  }
  f.addEventListener('input', update); f.addEventListener('change', update);
  $('zip').addEventListener('focus', loadZips);
  $('zip').addEventListener('input', function () { if ($('zip').value.length === 5) loadZips().then(update); });

  // ---- submit -> quote flow (Stripe hook) ----
  f.addEventListener('submit', function (e) {
    e.preventDefault(); update();
    var err = [], o = last.order;
    ['contact', 'company', 'email', 'phone'].forEach(function (n) { if (!f[n].value.trim()) err.push(n); });
    if (!/^\S+@\S+\.\S+$/.test(f.email.value)) err.push('valid email');
    if (!last.price.lf) err.push('at least one beam length');
    if (last.price.belowMin) err.push('minimum ' + C.PRICING.minLF + ' linear ft');
    if ([].some.call(document.querySelectorAll('.len'), function (i) { return +i.value > C.FREIGHT.maxLengthFt; })) err.push('lengths 24 ft or less (note longer ones)');
    if (o.method !== 'pickup' && !/^\d{5}$/.test(o.zip)) err.push('delivery ZIP');
    if (o.method !== 'pickup' && !f.street.value.trim()) err.push('delivery street address');
    if (o.finish === 'prestained' && !(f.stainBrand.value && f.stainType.value && f.stainColor.value)) err.push('stain brand, type and color');
    if (err.length) { $('err').textContent = 'Please add: ' + err.join(', ') + '.'; return; }
    $('err').textContent = '';
    var data = Object.fromEntries(new FormData(f).entries());
    if (data.website) return; // spam trap
    data.resaleCertToSend = f.resaleCertToSend.checked ? 'yes' : 'no'; data.brand = S.BRAND; data.draftPricing = !!S.DRAFT_PRICING;
    data.lines = o.lines; data.estimate = { beams: last.price.subtotal, ratePerLF: last.price.rate, totalLF: last.price.lf, shipping: last.ship };
    placeOrder(data);
  });

  // HOOK: Stripe. With CHECKOUT_MODE "stripe", POST the order to a small server function that creates a
  // Stripe Checkout Session (server re-computes price; secret key lives only on the server) and returns {url}.
  function placeOrder(data) {
    if (S.CHECKOUT_MODE === 'stripe' && S.STRIPE_CHECKOUT_ENDPOINT) {
      return fetch(S.STRIPE_CHECKOUT_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
        .then(function (r) { return r.json(); }).then(function (j) { location.href = j.url; })
        .catch(function () { $('err').textContent = 'Checkout is unavailable right now. Please try again.'; });
    }
    if (S.ORDER_ENDPOINT) {
      // text/plain keeps this a "simple" request (no CORS preflight), which Apps Script web apps accept.
      $('place').disabled = true; $('place').textContent = 'Sending...';
      return fetch(S.ORDER_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data), redirect: 'follow' })
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) done(j.id); else throw new Error('bad'); })
        .catch(function () { $('place').disabled = false; $('place').textContent = 'Place order'; mailtoFallback(data); });
    }
    mailtoFallback(data);
  }
  function mailtoFallback(data) {
    var body = Object.keys(data).filter(function (k) { return typeof data[k] !== 'object' && k !== 'website'; }).map(function (k) { return k + ': ' + data[k]; }).join('\n') +
      '\nLengths: ' + data.lines.filter(function (l) { return l.len && l.qty; }).map(function (l) { return l.qty + ' x ' + l.len + ' ft'; }).join(', ') +
      '\nTotal LF: ' + data.estimate.totalLF + '\nBeams: $' + data.estimate.beams + ' ($' + data.estimate.ratePerLF + '/LF)' +
      '\nShipping estimate: ' + (data.estimate.shipping && data.estimate.shipping.total != null ? '$' + data.estimate.shipping.total : 'quote');
    location.href = 'mailto:' + S.EMAIL + '?subject=' + encodeURIComponent(S.BRAND + ' order') + '&body=' + encodeURIComponent(body);
    $('place').textContent = 'Your email app opened with the order. Press send there.';
  }
  function done(id) { $('place').textContent = 'Order sent' + (id ? ' (#' + id + ')' : '') + '. We will confirm freight and send a payment link.'; $('place').disabled = true; }
  update();
})();
