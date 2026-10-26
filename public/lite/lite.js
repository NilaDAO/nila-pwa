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
  function keep(pair) {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var tx = db.transaction('keys', 'readwrite');
        tx.objectStore('keys').put({ pair: pair, at: Date.now() }, 'device');
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
  /** A new device key (not extractable), kept on this phone; its public key and its signature over the link. */
  function makeKey(code) {
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
        utf8('nila-keypad-register\n' + code + '\n' + spki));
    }).then(function (sig) {
      return keep(pair).then(function () { return { device_key: spki, sig: b64(sig) }; });
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
      return call('POST', '/keypad/l/' + code + '/finish', { device_key: k.device_key, sig: k.sig });
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
  function rows(f, colour) {
    return '<div class="rows"><div class="row"><span class="muted">Latitude</span><b>' + (f ? deg(f.lat) : '…') + '</b></div>' +
      '<div class="row"><span class="muted">Longitude</span><b>' + (f ? deg(f.lng) : '…') + '</b></div>' +
      '<div class="row"><span class="muted">Accuracy</span><b style="color:' + colour + '">' +
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
      ['Deny', function () { go('#/fields/denied'); }], ['Allow', function () { go('#/fields/search'); }], null, 'Your field');
  }

  function searching() {
    var f = fix;
    screen('<h1>Field ' + fieldNo() + ' · finding you…</h1>' + circle(f ? f.acc : 44, '#E69283') + rows(f, '#E69283') +
      '<p class="muted">Stay still in the open, away from trees.</p>',
      ['Cancel', function () { stopGps(); go('#/fields'); }], null, null, 'Your field');
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
    screen('<h1>Field ' + fieldNo() + ' · ready</h1>' + circle(fix.acc, '#D4CF5A') + rows(fix, '#D4CF5A') +
      '<p class="muted">Under 20 m: press OK to check it on the map.</p>',
      ['Cancel', function () { go('#/fields'); }], ['OK', function () { go('#/fields/check'); }], null, 'Your field');
  }

  function check() {
    if (!fix) { go('#/fields'); return; }
    var f = fix;
    screen('<h1 style="margin-bottom:4px">Is the dot in your field?</h1><div class="map"><p class="muted" id="mapmsg">…</p></div>' +
      '<p class="muted small">Satellite image · circle = ± ' + Math.round(f.acc) + ' m</p><p id="msg" class="err"></p>',
      ['No, again', function () { go('#/fields/search'); }], ['Send', function () { sendField(f); }], null, 'Your field');
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
    screen('<h1>Field ' + last.n + ' sent</h1><p>' + deg(last.lat) + ', ' + deg(last.lng) + ' · ± ' + Math.round(last.acc) + ' m</p>' +
      '<p class="muted">Another field? Walk to it and press Next. All fields now: the land title cannot change later.</p>',
      ['Done', function () { store('nila.lite.done', '1'); go('#/done'); }], null, ['Next', function () { go('#/fields'); }], 'Your field');
  }

  function denied() {
    stopGps();
    screen('<h1>No location</h1><p class="muted">Location is off or blocked. Turn it on in Settings, Location, then try again. ' +
      'Or your leader takes it on the leader phone.</p>',
      ['Later', function () { go('#/fields'); }], ['Retry', function () { go('#/fields/search'); }], null, 'Your field');
  }

  // After Done: F13 #pending (her land, once the leader has checked the borders) is not built yet.
  function done() {
    var n = parseInt(stored('nila.lite.fields'), 10) || 0;
    screen('<h1>Your fields are sent</h1><p>' + n + (n === 1 ? ' field' : ' fields') + '</p>' +
      '<p class="muted">Your union leader checks the borders. Nila sends you an SMS when your land title is ready.</p>',
      ['Help QR', function () { go('#/help'); }], null, ['Add a field', function () { store('nila.lite.done', ''); go('#/fields'); }], 'Your fields');
  }

  // ---- the help QR (A2): her leader acts for her for 5 minutes ----

  var helpTimer = null;
  function help() {
    var account = stored('nila.lite.account');
    if (helpTimer) { clearInterval(helpTimer); helpTimer = null; }
    var back = ['Back', function () { go(stored('nila.lite.done') ? '#/done' : '#/fields'); }];
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
    if (h === '#/fields' || h === '#/next') { fieldsStart(); return; }
    go(stored('nila.lite.done') ? '#/done' : '#/fields');
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
