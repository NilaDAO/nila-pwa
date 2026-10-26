/* Nila lite (P8): the keypad (KaiOS 2.5, Gecko 48) app. Plain ES5 + Promises: no async/await, no arrow functions,
 * no spread, no build step. Screens are #hash routes (nila-design "Keypad phones"):
 *   #/l/<code>        F9 #welcome: her name, union, leader; OK = consent to SMS, then the phone
 *                     makes its device key and registers it (no PIN, executive decision 22 Oct: the device key's
 *                     signature is her consent)
 *   #/expired         F9 #expired: the link was used, voided or is older than 30 minutes
 *   #/fields          F14: each field's location — allow, #search, #ready (± 20 m or better), #check (the dot on a
 *                     satellite image the node renders), SEND, #sent (Next = another field), #denied; Done ends it
 *                     (F13 #pending is not built: a plain "done" screen stands in)
 *   #/help            the help QR (A2, 26 Oct): lets a leader of the union act for her for 5 minutes (session.js)
 *   #/home            F1: value invested, then Help QR, My assets, My crop plan, My land, Messages (26 Oct; read only)
 *   #/assets          F11: invested, crop shares, machine hours, land title (no nIN rows: members hold no nIN)
 *   #/share/<token>   F7: one crop share (lent, repay, repaid, by when; or ready to use, with the help QR)
 *   #/plan, #/plan/<i>  F12: the crop plan's seasons per area, and one season
 *   #/land, #/land/<n>  F13: her land title's areas (map image, corners); #pending before the title
 *   #/messages(/<i>)  F8: the SMS Nila sent her
 * Reads (26 Oct): her investment, loans and vouchers on-chain from the phone (chain.js, the public Stellar RPC); her
 * plan, title areas, pending fields and SMS from the node (/keypad/me, signed), as the app reads its plan and record.
 * The node: keypad endpoints of nila-sensing O17 (docs/stellar/O17.md). The device key: ECDSA P-256 made with
 * WebCrypto, not extractable, kept in this origin's IndexedDB (spec Keypad_Reverse_QR_Consent.md, step 0). */
(function () {
  'use strict';

  // The node: pwa.nila.land → node.nila.land; a local origin → the local node; ?api=… (kept) for a test host.
  function apiBase() {
    var m = /[?&]api=([^&#]+)/.exec(location.search);
    try {
      if (m) localStorage.setItem('nila.lite.api', decodeURIComponent(m[1]));
      var kept = localStorage.getItem('nila.lite.api');
      if (kept) return kept;
    } catch (e) { /* no storage */ }
    if (location.hostname === 'pwa.nila.land') return 'https://node.nila.land';
    return location.protocol + '//' + location.hostname + ':8000';
  }
  var API = apiBase();

  var main = document.getElementById('main');
  var hd = document.getElementById('hd');
  var sk = { l: document.getElementById('sk-l'), c: document.getElementById('sk-c'), r: document.getElementById('sk-r') };
  var keys = {};          // the screen's key handlers: SoftLeft, Enter, SoftRight, digits, Backspace
  var invite = null;      // the opened link: { code, name, phone, union_name, leader_name }
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  // A softkey: a label and an action, also a link (href) for a screen without keys.
  function soft(el, label, fn) {
    el.textContent = label || '';
    el.onclick = function (e) { e.preventDefault(); if (fn && !busy) fn(); };
    el.setAttribute('href', '#');
    el.style.visibility = label ? 'visible' : 'hidden';
  }
  function screen(html, l, c, r, title) {
    hd.textContent = title || 'Nila';
    main.innerHTML = html;
    keys = { SoftLeft: l && l[1], Enter: c && c[1], SoftRight: r && r[1] };
    soft(sk.l, l && l[0], l && l[1]);
    soft(sk.c, c && c[0], c && c[1]);
    soft(sk.r, r && r[0], r && r[1]);
    main.focus();
  }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }

  function call(method, path, body) {
    return fetch(API + path, {
      method: method,
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (out) {
        if (!r.ok) { var e = new Error(out.detail || ('error ' + r.status)); e.status = r.status; throw e; }
        return out;
      });
    });
  }

  // ---- the device key (IndexedDB 'nila-lite' / 'keys' / 'device') ----

  function idb() {
    return new Promise(function (ok, fail) {
      var req = indexedDB.open('nila-lite', 1);
      req.onupgradeneeded = function () { req.result.createObjectStore('keys'); };
      req.onsuccess = function () { ok(req.result); };
      req.onerror = function () { fail(req.error); };
    });
  }
  function keep(pair, polygonKey) {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').put({ pair: pair, polygon: polygonKey, at: Date.now() }, 'device');
        tx.oncomplete = function () { ok(); };
        tx.onerror = function () { fail(tx.error); };
        tx.onabort = function () { fail(tx.error); };
      });
    });
  }
  function b64(buf) {
    var s = '', a = new Uint8Array(buf);
    for (var i = 0; i < a.length; i++) s += String.fromCharCode(a[i]);
    return btoa(s);
  }
  function utf8(s) {
    if (window.TextEncoder) return new TextEncoder().encode(s);
    var e = unescape(encodeURIComponent(s)), a = new Uint8Array(e.length);
    for (var i = 0; i < e.length; i++) a[i] = e.charCodeAt(i);
    return a;
  }
  /** A new device key (not extractable), kept on this phone; its public key and its signature over the link, with the
   *  Polygon address the phone makes for her crop shares (26 Oct, option C: the key stays on this phone, only the
   *  address is used: L12 mints her FoodTokens to it). */
  function makeKey(code) {
    var poly = window.NilaPolygon.newKey();
    var c = window.crypto && window.crypto.subtle;
    if (!c) return Promise.reject(new Error('This phone cannot make a key (no secure connection).'));
    var algo = { name: 'ECDSA', namedCurve: 'P-256' };
    var pair, spki;
    return c.generateKey(algo, false, ['sign', 'verify']).then(function (p) {
      pair = p;
      return c.exportKey('spki', p.publicKey);
    }).then(function (der) {
      spki = b64(der);
      return c.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey,
        utf8('nila-keypad-register\n' + code + '\n' + spki + '\n' + poly.address));
    }).then(function (sig) {
      return keep(pair, poly.priv).then(function () { return { device_key: spki, sig: b64(sig), polygon: poly.address }; });
    });
  }

  function loadKey() {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var req = db.transaction('keys', 'readonly').objectStore('keys').get('device');
        req.onsuccess = function () { ok(req.result && req.result.pair); };
        req.onerror = function () { fail(req.error); };
      });
    });
  }
  /** A request signed by her device key (F14 on): the JSON text and its signature; the node checks both. */
  function signed(kind, fields) {
    var member = null;
    try { member = localStorage.getItem('nila.lite.member'); } catch (e) { /* no storage */ }
    var body = { k: kind, m: member, ts: Date.now() };
    for (var k in fields) if (fields.hasOwnProperty(k)) body[k] = fields[k];
    var p = JSON.stringify(body);
    return loadKey().then(function (pair) {
      if (!pair || !member) throw new Error('This phone is not set up for Nila. Ask your union leader for a new link.');
      return window.crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, utf8('nila-keypad\n' + p));
    }).then(function (sig) { return { p: p, s: b64(sig) }; });
  }

  // ---- screens ----

  function loading() { screen('<p class="muted">…</p>'); }

  function expired() {
    screen('<h1>This link no longer works</h1><p class="muted">It was used already, or it is older than 30 minutes. ' +
      'Ask your union leader to send a new one.</p>', null, ['OK', function () { window.close(); }]);
  }

  function welcome(code) {
    var i = invite;
    var rows = [['Union', i.union_name], ['Leader', i.leader_name]];
    var html = '<h1>Welcome, ' + esc(i.name) + '</h1><div class="line"></div>';
    for (var k = 0; k < rows.length; k++) {
      if (rows[k][1]) html += '<div class="row"><span class="muted">' + rows[k][0] + '</span><b>' + esc(rows[k][1]) + '</b></div>';
    }
    html += '<p class="muted" style="margin-top:8px">Nila sends you SMS about your vouchers and farm plan. OK means you agree.</p><p id="msg" class="err"></p>';
    screen(html, null, ['OK', function () {
      busy = true;
      call('POST', '/keypad/l/' + code + '/consent').then(function () { finish(code); }, fail);
    }]);
  }

  function finish(code) {
    busy = true;
    var msg = document.getElementById('msg');
    if (msg) msg.textContent = '';
    makeKey(code).then(function (k) {
      return call('POST', '/keypad/l/' + code + '/finish', { device_key: k.device_key, sig: k.sig, polygon: k.polygon });
    }).then(function (out) {
      busy = false;
      try {
        localStorage.setItem('nila.lite.member', out.member);
        // Her smart account (26 Oct), from her device key; the leader's app creates it at L14.
        if (out.account) localStorage.setItem('nila.lite.account', out.account);
        // A new phone goes on from the fields her open job already has (a lost phone, L14 again).
        localStorage.setItem('nila.lite.fields', String(out.fields || 0));
        localStorage.removeItem('nila.lite.done');
      } catch (e) { /* no storage */ }
      go('#/fields');
    }, fail);
  }

  function fail(e) {
    busy = false;
    if (e && e.status === 410) { go('#/expired'); return; }
    var msg = document.getElementById('msg');
    if (msg) msg.textContent = (e && e.message) || 'Something went wrong. Try again.';
  }

  // ---- F14: each field's location (board KeypadLocation) ----

  var fix = null;         // the latest GPS fix: { lat, lng, acc }
  var watch = null;
  var GOOD = 20;          // metres: under this she checks the dot on the map

  function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* no storage */ } }
  function fieldNo() { return (parseInt(stored('nila.lite.fields'), 10) || 0) + 1; }
  function deg(v) { return v.toFixed(5); }
  function stopGps() {
    if (watch && watch.stop) watch.stop();
    else if (watch !== null && navigator.geolocation) navigator.geolocation.clearWatch(watch);
    watch = null;
  }
  // Accuracy only (26 Oct): latitude and longitude mean nothing to her.
  function rows(f, colour) {
    return '<div class="rows"><div class="row"><span class="muted">Accuracy</span><b style="color:' + colour + '">' +
      (f ? '± ' + Math.round(f.acc) + ' m' : '…') + '</b></div></div>';
  }
  // The accuracy circle (board: wide and coral while finding her, small and yellow when ready).
  function circle(acc, colour) {
    var r = Math.max(8, Math.min(44, Math.round(acc || 44)));
    return '<svg width="220" height="96" viewBox="0 0 220 96" class="pic" aria-hidden="true">' +
      '<circle cx="110" cy="48" r="' + r + '" fill="' + colour + '" fill-opacity="0.18" stroke="' + colour + '" stroke-width="2"/>' +
      '<circle cx="110" cy="48" r="5" fill="' + colour + '"/></svg>';
  }

  function fieldsStart() {
    stopGps(); fix = null;
    screen('<p class="muted" style="margin:0">Field ' + fieldNo() + '</p><h1>Stand in the middle of your field.</h1>' +
      '<div class="card"><b>nila.land wants to know your location</b><p class="muted" style="margin:0">The phone asks this once. Press Allow.</p></div>',
      ['Deny', function () { go('#/fields/denied'); }], ['Allow', function () { go('#/fields/search'); }], null, 'Register your land');
  }

  function searching() {
    var f = fix;
    screen('<h1>Field ' + fieldNo() + ' · finding you…</h1>' + circle(f ? f.acc : 44, '#E69283') + rows(f, '#E69283') +
      '<p class="muted">Stay still in the open, away from trees.</p>',
      ['Cancel', function () { stopGps(); go('#/fields'); }], null, null, 'Register your land');
  }

  function onFix(lat, lng, acc) {
    fix = { lat: lat, lng: lng, acc: acc };
    if (location.hash !== '#/fields/search') return;
    if (acc <= GOOD) { stopGps(); go('#/fields/ready'); return; }
    searching();
  }

  function startGps() {
    if (watch !== null) return;
    demoGps().then(function (pts) {
      if (location.hash !== '#/fields/search' || watch !== null) return;
      if (pts) { watch = demoWatch(pts[(fieldNo() - 1) % pts.length]); return; }
      if (!navigator.geolocation) { go('#/fields/denied'); return; }
      watch = navigator.geolocation.watchPosition(function (pos) {
        onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
      }, function (err) {
        if (err && err.code === 1) { stopGps(); go('#/fields/denied'); }   // PERMISSION_DENIED; else keep waiting
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 60000 });
    });
  }

  // The demo has no GPS: off pwa.nila.land the demo phone server may offer points inside a demo parcel
  // (/__demo/gps.json, made at run time from a demo record); without it the browser's location is used (Chrome
  // DevTools → Sensors → Location). Never asked on pwa.nila.land.
  var demoPts;
  function demoGps() {
    if (demoPts !== undefined || location.hostname === 'pwa.nila.land') return Promise.resolve(demoPts || null);
    return fetch('/__demo/gps.json').then(function (r) { return r.ok ? r.json() : null; })
      .then(function (j) { demoPts = (j && j.points && j.points.length) ? j.points : null; return demoPts; },
        function () { demoPts = null; return null; });
  }
  function demoWatch(pt) {
    var steps = [85, 40, 12], i = 0, t;
    function tick() {
      var a = steps[i], j = a / 111320 / 3;
      onFix(pt.lat + (i < 2 ? j : 0), pt.lng + (i < 2 ? -j : 0), a);
      i += 1;
      if (i < steps.length) t = setTimeout(tick, 1200);
    }
    t = setTimeout(tick, 600);
    return { stop: function () { clearTimeout(t); } };
  }

  function ready() {
    if (!fix) { go('#/fields'); return; }
    screen('<h1>Field ' + fieldNo() + ' · location found</h1>' + circle(fix.acc, '#D4CF5A') + rows(fix, '#D4CF5A') +
      '<p class="muted">Good enough (under 20 m). Press OK to see the spot on the map.</p>',
      ['Cancel', function () { go('#/fields'); }], ['OK', function () { go('#/fields/check'); }], null, 'Register your land');
  }

  function check() {
    if (!fix) { go('#/fields'); return; }
    var f = fix;
    screen('<h1 style="margin-bottom:4px">Is the dot in your field?</h1><div class="map"><p class="muted" id="mapmsg">…</p></div>' +
      '<p class="muted small">Satellite image · circle = ± ' + Math.round(f.acc) + ' m</p><p id="msg" class="err"></p>',
      ['No, again', function () { go('#/fields/search'); }], ['Send', function () { sendField(f); }], null, 'Register your land');
    signed('map', { lat: f.lat, lng: f.lng, acc: f.acc }).then(function (q) {
      var box = main.querySelector('.map');
      if (!box || fix !== f) return;
      var img = new Image();
      img.width = 220; img.height = 150; img.alt = 'Satellite image of your field';
      img.onload = function () { box.innerHTML = ''; box.appendChild(img); };
      img.onerror = function () { var m = document.getElementById('mapmsg'); if (m) m.textContent = 'No map image right now. Check the place yourself, then SEND.'; };
      img.src = API + '/keypad/map?p=' + encodeURIComponent(q.p) + '&s=' + encodeURIComponent(q.s);
    }, function (e) { var m = document.getElementById('mapmsg'); if (m) m.textContent = e.message; });
  }

  function sendField(f) {
    busy = true;
    var msg = document.getElementById('msg');
    if (msg) msg.textContent = '';
    signed('field', { lat: f.lat, lng: f.lng, acc: Math.round(f.acc * 10) / 10 }).then(function (q) {
      return call('POST', '/keypad/fields', q);
    }).then(function (out) {
      busy = false;
      store('nila.lite.fields', String(out.field));
      store('nila.lite.last', JSON.stringify({ n: out.field, lat: f.lat, lng: f.lng, acc: f.acc }));
      fix = null;
      go('#/fields/sent');
    }, function (e) {
      busy = false;
      var m = document.getElementById('msg');
      if (m) m.textContent = (e && e.message) || 'Not sent. Try again.';
    });
  }

  function sent() {
    var last = null;
    try { last = JSON.parse(stored('nila.lite.last') || 'null'); } catch (e) { last = null; }
    if (!last) { go('#/fields'); return; }
    screen('<h1>Field ' + last.n + ' sent</h1><p class="muted">Accuracy ± ' + Math.round(last.acc) + ' m</p>' +
      '<p class="muted">Another field? Walk to it and press Next field. Send every field now: the land title cannot change later. ' +
      'No more fields? Press All sent.</p><p id="msg" class="err"></p>',
      ['All sent', allSent], null, ['Next field', function () { go('#/fields'); }], 'Register your land');
  }

  // "All sent" (26 Oct): tells the node, so the leader's border screens say no more fields are coming.
  function allSent() {
    if (busy) return;
    busy = true;
    signed('fields_done', {}).then(function (q) { return call('POST', '/keypad/fields/done', q); }).then(function () {
      busy = false;
      store('nila.lite.done', '1');
      go('#/done');
    }, function (e) {
      busy = false;
      var m = document.getElementById('msg');
      if (m) m.textContent = (e && e.message) || 'Not sent. Try again.';
    });
  }

  function denied() {
    stopGps();
    screen('<h1>No location</h1><p class="muted">Location is off or blocked. Turn it on in Settings, Location, then try again. ' +
      'Or your leader takes it on the leader phone.</p>',
      ['Later', function () { go('#/fields'); }], ['Retry', function () { go('#/fields/search'); }], null, 'Register your land');
  }

  // After Done: F13 #pending (her land, once the leader has checked the borders) is not built yet.
  function done() {
    var n = parseInt(stored('nila.lite.fields'), 10) || 0;
    screen('<h1>Your fields are sent</h1><p>' + n + (n === 1 ? ' field' : ' fields') + '</p>' +
      '<p class="muted">Your union leader checks the borders. Nila sends you an SMS when your land title is ready.</p>',
      ['Home', function () { go('#/home'); }], null, ['Add a field', function () { store('nila.lite.done', ''); go('#/fields'); }], 'Register your land');
  }

  // ---- F1–F13: her own things, read only (26 Oct) ----

  var data = null;       // { at, me, cfg, invested, loans: { token: loan }, vouchers: { token: units left } }
  var focus = {};        // the focused row per screen
  var DAY = 86400, YEAR = 365 * DAY, U = 1e7;
  function hexKey(t) { return String(t || '').replace(/^0x/, '').toLowerCase(); }
  function inr(n) { return '\u20b9' + Math.round(n).toLocaleString('en-IN'); }
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function part(ts) { var d = new Date(ts * 1000), n = d.getUTCDate(); return (n <= 10 ? 'early ' : n <= 20 ? 'mid ' : 'late ') + MON[d.getUTCMonth()]; }
  function tsOf(iso) { return iso ? Date.parse(String(iso).slice(0, 10) + 'T00:00:00Z') / 1000 : 0; }
  function months(slot) { return { S1: 'Oct \u2013 Feb', S2: 'Mar \u2013 May', S3: 'Jun \u2013 Aug' }[slot] || ''; }

  function load(force) {
    if (data && !force && Date.now() - data.at < 60000) return Promise.resolve(data);
    var me, cfg, C = window.NilaChain;
    return signed('me', {}).then(function (q) { return call('POST', '/keypad/me', q); }).then(function (m) {
      me = m;
      return call('GET', '/stellar/config');
    }).then(function (c) {
      cfg = c;
      if (!me.account || !c.rpc_url) return [null, []];
      var f = c.contracts.fund_core, u = C.addr(c.union), a = C.addr(me.account);
      return Promise.all([
        C.read(c.rpc_url, c.sponsor, f, 'position', [u, a]).catch(function () { return null; }),
        C.read(c.rpc_url, c.sponsor, f, 'loans_of', [u, a]).catch(function () { return []; }),
      ]);
    }).then(function (r) {
      var ids = r[1] || [], loans = {}, vouchers = {};
      return Promise.all(ids.map(function (id) {
        return Promise.all([
          C.read(cfg.rpc_url, cfg.sponsor, cfg.contracts.fund_core, 'food_token', [C.addr(cfg.union), C.bytes(id)]).catch(function () { return null; }),
          cfg.contracts.machinery ? C.read(cfg.rpc_url, cfg.sponsor, cfg.contracts.machinery, 'voucher', [C.addr(cfg.union), C.bytes(id)]).catch(function () { return null; }) : null,
        ]).then(function (x) {
          if (x[0] && x[0].loan) loans[hexKey(id)] = x[0].loan;
          if (x[1] && !x[1].void) vouchers[hexKey(id)] = Math.max(0, x[1].hours - x[1].used);
        });
      })).then(function () {
        data = { at: Date.now(), me: me, cfg: cfg, invested: r[0] ? r[0].invested / U : 0, loans: loans, vouchers: vouchers };
        return data;
      });
    });
  }

  /** A loan's numbers in rupees: lent, repaid, left now, to repay by `due` (simple interest, as the app shows it). */
  function money(l, due) {
    var now = Date.now() / 1000, out = Math.max(0, (l.principal - l.principal_paid) / U);
    var rate = l.rate_bp / 10000;
    return { lent: l.principal / U, repaid: (l.principal_paid + l.interest_paid) / U,
      left: Math.max(0, out + out * rate * Math.max(0, now - l.drawdown_ts) / YEAR - l.interest_paid / U),
      atDue: Math.max(0, out + out * rate * Math.max(0, due - l.drawdown_ts) / YEAR - l.interest_paid / U) };
  }
  function shareInfo(d, x) {
    var l = d.loans[hexKey(x.token)], due = (tsOf(x.harvest) || 0) + 21 * DAY;
    return { x: x, loan: l, due: due, m: l ? money(l, due) : null, hours: (d.vouchers[hexKey(x.token)] || 0) / 100 };
  }

  /** A list screen: rows { t, s, v, go } with the focused one yellow; up/down move, the centre key opens. */
  function menu(id, title, head, rows, left, centre, right) {
    var f = Math.min(focus[id] || 0, Math.max(0, rows.length - 1));
    var html = head || '';
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      html += '<div class="item' + (i === f ? ' focus' : '') + '"><span><b>' + esc(r.t) + '</b>' + (r.s ? '<br><small>' + esc(r.s) + '</small>' : '') +
        '</span>' + (r.v != null ? '<b>' + esc(r.v) + '</b>' : '') + '</div>';
    }
    var open = function () { var r = rows[f]; if (r && r.go) r.go(); };
    screen(html, left, centre === undefined ? (rows.length ? ['Select', open] : null) : centre, right, title);
    keys.ArrowDown = function () { if (f < rows.length - 1) { focus[id] = f + 1; menu(id, title, head, rows, left, centre, right); } };
    keys.ArrowUp = function () { if (f > 0) { focus[id] = f - 1; menu(id, title, head, rows, left, centre, right); } };
    var el = main.querySelector('.focus');
    if (el && el.scrollIntoView) el.scrollIntoView(false);
  }

  function withData(title, draw) {
    if (data) { draw(data); return; }
    screen('<p class="muted">\u2026</p><p id="msg" class="err"></p>', ['Back', function () { go('#/home'); }], null, null, title);
    load().then(draw, function (e) { var m = document.getElementById('msg'); if (m) m.textContent = (e && e.message) || 'No connection. Try again.'; });
  }

  function home() {
    var draw = function (d) {
      var me = d.me, shares = me.shares || [];
      var owed = 0, firstDue = 0;
      shares.forEach(function (x) { var i = shareInfo(d, x); if (i.m && i.m.left > 0) { owed += i.m.atDue; firstDue = firstDue ? Math.min(firstDue, i.due) : i.due; } });
      var next = shares.filter(function (x) { return x.state === 'ready' || x.state === 'early'; })
        .sort(function (a, b) { return tsOf(a.sow) - tsOf(b.sow); })[0];
      var t = me.title;
      menu('home', 'Nila', '<p class="muted small" style="margin:0">Invested</p><h1 style="font-size:20px;margin:0 0 6px">' + inr(d.invested) + '</h1>', [
        { t: 'Help QR', s: 'Your leader acts for you', go: function () { go('#/help'); } },
        { t: 'My assets', s: owed ? 'Repay ' + inr(owed) + ' by ' + part(firstDue) : 'Investment, crop shares', go: function () { go('#/assets'); } },
        { t: 'My crop plan', s: next ? 'Next: sow ' + (next.name || next.crop) + ' by ' + part(tsOf(next.sow)) : (shares.length ? 'All seasons' : 'No plan yet'), go: function () { go('#/plan'); } },
        { t: 'My land', s: t ? t.areas.length + (t.areas.length === 1 ? ' area' : ' areas') : 'Waiting for your land title', go: function () { go('#/land'); } },
        { t: 'Messages', s: (me.messages || []).length + ' from Nila', go: function () { go('#/messages'); } },
      ], null, undefined, ['Refresh', function () { data = null; home(); }]);
    };
    if (data) draw(data); else withData('Nila', draw);
  }

  function assets() {
    withData('My assets', function (d) {
      var rows = [{ t: 'Invested', s: 'Union investment', v: inr(d.invested), go: null }];
      var hours = 0;
      (d.me.shares || []).forEach(function (x) {
        var i = shareInfo(d, x);
        hours += i.hours;
        if (i.m && i.m.left > 0) rows.push({ t: 'Crop share', s: (x.name || x.crop) + ' \u00b7 repay by ' + part(i.due), v: inr(i.m.atDue), go: function () { go('#/share/' + hexKey(x.token)); } });
        else if (x.state === 'ready') rows.push({ t: 'Crop share', s: (x.name || x.crop) + ' \u00b7 ready to use', v: inr(x.cash), go: function () { go('#/share/' + hexKey(x.token)); } });
      });
      if (hours > 0) rows.push({ t: 'Machine hours', s: 'Voucher \u00b7 any machine', v: (Math.round(hours * 10) / 10) + ' h', go: null });
      var t = d.me.title;
      var acres = t ? t.areas.reduce(function (a, z) { return a + z.acres; }, 0) : 0;
      rows.push({ t: 'Land title', s: t ? t.areas.length + ' areas \u00b7 ' + (Math.round(acres * 10) / 10) + ' acres \u00b7 map' : 'Not ready yet', v: t ? '1' : '', go: function () { go('#/land'); } });
      menu('assets', 'My assets', '', rows, ['Back', function () { go('#/home'); }], ['Open', function () { var r = rows[focus.assets || 0]; if (r && r.go) r.go(); }]);
    });
  }

  function share(token) {
    withData('My crop share', function (d) {
      var x = (d.me.shares || []).filter(function (y) { return hexKey(y.token) === token; })[0];
      var back = ['Back', function () { go('#/assets'); }];
      if (!x) { screen('<p class="muted">This crop share is not in your plan.</p>', back, null, null, 'My crop share'); return; }
      var i = shareInfo(d, x), h = '<h1>' + esc(x.name || x.crop) + ' \u00b7 Area ' + esc(x.area) + '</h1><div class="rows">';
      if (i.m) {
        h += row('Lent', inr(i.m.lent)) + (i.hours ? row('Machine hours', (Math.round(i.hours * 10) / 10) + ' h') : '') + row('You repay', inr(i.m.atDue)) +
          row('Repaid', inr(i.m.repaid)) + row('Repay by', part(i.due)) + '</div><p class="muted small">Repay at the union office, in cash.</p>';
      } else {
        h += row('Cash up to', inr(x.cash)) + row(x.state === 'early' ? 'From' : 'Use by', part(x.state === 'early' ? x.open : x.final)) +
          '</div><p class="muted small">To use it, go to your union office and show your help QR to your leader.</p>';
      }
      screen(h, back, i.m ? null : ['Help QR', function () { go('#/help'); }], null, 'My crop share');
    });
  }
  function row(k, v) { return '<div class="row"><span class="muted">' + esc(k) + '</span><b>' + esc(v) + '</b></div>'; }

  function sortedShares(d) { return (d.me.shares || []).slice().sort(function (a, b) { return tsOf(a.sow) - tsOf(b.sow); }); }
  function plan() {
    withData('My crop plan', function (d) {
      var list = sortedShares(d);
      var acresOf = function (x) {
        var t = d.me.title; if (!t) return '';
        var n = String(x.area || '').split(' + ').map(Number);
        var a = t.areas.filter(function (z) { return n.indexOf(z.n) >= 0; }).reduce(function (s2, z) { return s2 + z.acres; }, 0);
        return a ? ' \u00b7 ' + (Math.round(a * 10) / 10) + ' acres' : '';
      };
      var first = list[0], last = list[list.length - 1];
      var next = list.filter(function (x) { return tsOf(x.sow) * 1000 > Date.now(); })[0];
      var head = list.length ? '<p class="muted small" style="margin:0">' + (first ? MON[new Date(tsOf(first.sow) * 1000).getUTCMonth()] + ' ' + new Date(tsOf(first.sow) * 1000).getUTCFullYear() : '') +
        ' \u2013 ' + (last && last.harvest ? MON[new Date(tsOf(last.harvest) * 1000).getUTCMonth()] + ' ' + new Date(tsOf(last.harvest) * 1000).getUTCFullYear() : '') + ' \u00b7 approved</p>' +
        (next ? '<p class="small">Next: sow ' + esc(next.name || next.crop) + ' by ' + part(tsOf(next.sow)) + '</p>' : '') : '<p class="muted">No approved crop plan yet. Your union leader makes it with you.</p>';
      menu('plan', 'My crop plan', head, list.map(function (x, k) {
        var i = shareInfo(d, x);
        return { t: (months(x.slot) ? months(x.slot) + ' \u00b7 ' : '') + (x.name || x.crop), s: 'Area ' + x.area + acresOf(x) + (i.m ? ' \u00b7 financed' : ''),
          v: i.m ? inr(i.m.lent) : '\u2014', go: function () { go('#/plan/' + k); } };
      }), ['Back', function () { go('#/home'); }], undefined, ['Map', function () { go('#/land'); }]);
    });
  }
  function season(k) {
    withData('My crop plan', function (d) {
      var x = sortedShares(d)[k];
      var back = ['Back', function () { go('#/plan'); }];
      if (!x) { go('#/plan'); return; }
      var i = shareInfo(d, x);
      screen('<h1>' + esc(x.name || x.crop) + ' \u00b7 Area ' + esc(x.area) + '</h1><div class="rows">' +
        (x.kg ? row('Expected', 'about ' + Math.round(x.kg) + ' kg') : '') + row('Cash', inr(i.m ? i.m.lent : x.cash)) +
        (i.hours ? row('Machine hours', (Math.round(i.hours * 10) / 10) + ' h') : '') +
        (x.sow ? row('Sow', part(tsOf(x.sow))) : '') + (x.harvest ? row('Harvest', part(tsOf(x.harvest))) : '') +
        (i.m ? row('Repay by', part(i.due)) : '') + '</div>', back, null, ['Map', function () { go('#/land'); }], 'My crop plan');
    });
  }

  function land() {
    withData('My land', function (d) {
      var t = d.me.title, back = ['Back', function () { go('#/home'); }];
      if (!t) {
        var f = (d.me.pending && d.me.pending.fields) || [], h = '<h1>Waiting for your land title</h1>';
        if (f.length) { h += '<p class="muted small">Fields you sent</p><div class="rows">'; f.forEach(function (p) { h += row('Field ' + p.n, p.lat.toFixed(5) + ', ' + p.lng.toFixed(5)); }); h += '</div>'; }
        screen(h + '<p class="muted small">Your union leader draws the borders of each field. You get an SMS when your land title is ready; then the map shows here.</p>',
          back, null, null, 'My land');
        return;
      }
      var now = {};
      (d.me.shares || []).forEach(function (x) {
        var a = tsOf(x.sow) * 1000, b = tsOf(x.harvest) * 1000;
        if (a && a <= Date.now() && (!b || b >= Date.now())) String(x.area || '').split(' + ').forEach(function (n) { now[n] = x.name || x.crop; });
      });
      var centre = t.areas[0] && t.areas[0].centre;
      menu('land', 'My land', '<div class="map"><p class="muted" id="mapmsg">\u2026</p></div>', t.areas.map(function (z) {
        return { t: 'Area ' + z.n + ' \u00b7 ' + z.acres + ' acres', s: now[z.n] ? now[z.n] + ' now' : '', go: function () { go('#/land/' + z.n); } };
      }), back, ['Open', function () { var z = t.areas[focus.land || 0]; if (z) go('#/land/' + z.n); }]);
      if (centre) {
        signed('map', { lat: centre[0], lng: centre[1], acc: 60 }).then(function (q) {
          var box = main.querySelector('.map'); if (!box) return;
          var img = new Image(); img.width = 220; img.height = 150; img.alt = 'Satellite image of your land';
          img.onload = function () { box.innerHTML = ''; box.appendChild(img); };
          img.onerror = function () { var m = document.getElementById('mapmsg'); if (m) m.textContent = 'No map image right now.'; };
          img.src = API + '/keypad/map?p=' + encodeURIComponent(q.p) + '&s=' + encodeURIComponent(q.s);
        });
      }
    });
  }
  function area(n) {
    withData('My land', function (d) {
      var t = d.me.title, z = t && t.areas.filter(function (a) { return a.n === n; })[0];
      if (!z) { go('#/land'); return; }
      var other = t.areas.filter(function (a) { return a.n !== n; })[0];
      var h = '<h1>Area ' + z.n + ' \u00b7 ' + z.acres + ' acres</h1><p class="muted small" style="margin:0">Corners (latitude, longitude)</p><div class="rows">';
      z.corners.forEach(function (c, k) { h += row(String(k + 1), c[0].toFixed(5) + ', ' + c[1].toFixed(5)); });
      h += '</div>' + (z.centre ? '<p class="small">Centre ' + z.centre[0].toFixed(5) + ', ' + z.centre[1].toFixed(5) + '</p>' : '') + '<p class="muted small">From the land title</p>';
      screen(h, ['Back', function () { go('#/land'); }], null, other ? ['Area ' + other.n, function () { go('#/land/' + other.n); }] : null, 'My land');
    });
  }

  function messages() {
    withData('Messages', function (d) {
      var list = d.me.messages || [];
      if (!list.length) { screen('<p class="muted">No messages yet.</p>', ['Back', function () { go('#/home'); }], null, null, 'Messages'); return; }
      menu('messages', 'Messages', '', list.map(function (m, k) {
        var dt = new Date(m.at * 1000);
        return { t: m.text.replace(/^Nila:\s*/, '').slice(0, 40), s: dt.getUTCDate() + ' ' + MON[dt.getUTCMonth()], go: function () { go('#/messages/' + k); } };
      }), ['Back', function () { go('#/home'); }], ['Open', function () { go('#/messages/' + (focus.messages || 0)); }]);
    });
  }
  function message(k) {
    withData('Messages', function (d) {
      var m = (d.me.messages || [])[k];
      if (!m) { go('#/messages'); return; }
      screen('<p>' + esc(m.text) + '</p><p class="muted small">' + new Date(m.at * 1000).toUTCString().slice(5, 16) + '</p>',
        ['Back', function () { go('#/messages'); }], null, null, 'Message');
    });
  }

  // ---- the help QR (A2): her leader acts for her for 5 minutes ----

  var helpTimer = null;
  function help() {
    var account = stored('nila.lite.account');
    if (helpTimer) { clearInterval(helpTimer); helpTimer = null; }
    var back = ['Back', function () { go(stored('nila.lite.done') ? '#/home' : '#/fields'); }];
    if (!account) {
      screen('<h1>Not ready yet</h1><p class="muted">Your account is not set up on this phone. Ask your union leader to send a new link.</p>',
        back, null, null, 'Help QR');
      return;
    }
    screen('<p class="muted">Making your QR…</p><p id="msg" class="err"></p>', back, null, null, 'Help QR');
    var cfg;
    call('GET', '/stellar/config').then(function (c) {
      cfg = c;
      // The latest ledger, for the signature's expiry (the phone's own clock ends the QR after 5 minutes).
      return fetch(c.rpc_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }) }).then(function (r) { return r.json(); });
    }).then(function (l) {
      return loadKey().then(function (pair) {
        if (!pair) throw new Error('This phone has no key. Ask your union leader for a new link.');
        return window.NilaSession.make({ passphrase: cfg.passphrase, account: account, ledger: l.result.sequence, now: Math.floor(Date.now() / 1000) },
          function (payload) { return window.crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, payload); });
      });
    }).then(function (q) {
      return window.NilaQR.svg(q.qr, { margin: 1, errorCorrectionLevel: 'L' }).then(function (svg) {
        var left = function () { return Math.max(0, q.until - Math.floor(Date.now() / 1000)); };
        screen('<div class="qr">' + svg + '</div><p class="muted" id="left">Show this to your leader · ' + left() + ' s</p>',
          back, ['New', help], null, 'Help QR');
        helpTimer = setInterval(function () {
          var el = document.getElementById('left');
          if (!el) { clearInterval(helpTimer); helpTimer = null; return; }
          el.textContent = left() > 0 ? 'Show this to your leader · ' + left() + ' s' : 'Expired: press New';
        }, 1000);
      });
    }, function (e) {
      var msg = document.getElementById('msg');
      if (msg) msg.textContent = (e && e.message) || 'Could not make the QR. Try again.';
    });
  }

  function open(code, then) {
    if (invite && invite.code === code) { then(); return; }
    loading();
    call('GET', '/keypad/l/' + code).then(function (i) {
      i.code = code; invite = i; then();
    }, fail);
  }

  function route() {
    var h = location.hash, m;
    if (h !== '#/fields/search') stopGps();
    if ((m = /^#\/l\/([0-9A-Z]+)$/.exec(h))) { open(m[1], function () { welcome(m[1]); }); return; }
    if (h === '#/expired') { expired(); return; }
    var member = stored('nila.lite.member');
    if (!member) { expired(); return; }
    if (h === '#/fields/search') { searching(); startGps(); return; }
    if (h === '#/fields/ready') { ready(); return; }
    if (h === '#/fields/check') { check(); return; }
    if (h === '#/fields/sent') { sent(); return; }
    if (h === '#/fields/denied') { denied(); return; }
    if (h === '#/done') { done(); return; }
    if (h === '#/help') { help(); return; }
    if (h === '#/home') { home(); return; }
    if (h === '#/assets') { assets(); return; }
    if ((m = /^#\/share\/([0-9a-f]+)$/.exec(h))) { share(m[1]); return; }
    if (h === '#/plan') { plan(); return; }
    if ((m = /^#\/plan\/(\d+)$/.exec(h))) { season(parseInt(m[1], 10)); return; }
    if (h === '#/land') { land(); return; }
    if ((m = /^#\/land\/(\d+)$/.exec(h))) { area(parseInt(m[1], 10)); return; }
    if (h === '#/messages') { messages(); return; }
    if ((m = /^#\/messages\/(\d+)$/.exec(h))) { message(parseInt(m[1], 10)); return; }
    if (h === '#/fields' || h === '#/next') { fieldsStart(); return; }
    go(stored('nila.lite.done') ? '#/home' : '#/fields');
  }

  // KaiOS keys: SoftLeft / Enter / SoftRight, digits, Backspace (the hardware back key). On a computer the same keys.
  document.addEventListener('keydown', function (e) {
    if (busy) return;
    var k = e.key;
    if (/^[0-9]$/.test(k) && keys.digit) { keys.digit(k); e.preventDefault(); return; }
    if (k === 'Backspace' && keys.Backspace) { keys.Backspace(); e.preventDefault(); return; }
    if (keys[k]) { keys[k](); e.preventDefault(); }
  });
  window.addEventListener('hashchange', route);
  route();
})();
