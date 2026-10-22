/* Nila lite (P8): the keypad (KaiOS 2.5, Gecko 48) app. Plain ES5 + Promises: no async/await, no arrow functions,
 * no spread, no build step. Screens are #hash routes (nila-design "Keypad phones"):
 *   #/l/<code>        F9 #welcome: her name, union, leader, phone; OK = consent to SMS and calls, then the phone
 *                     makes its device key and registers it (no PIN, executive decision 22 Oct: the device key's
 *                     signature is her consent)
 *   #/expired         F9 #expired: the link was used, voided or is older than 30 minutes
 *   #/next            F14 (send each field's location) is the next step and not built yet
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
  var sk = { l: document.getElementById('sk-l'), c: document.getElementById('sk-c'), r: document.getElementById('sk-r') };
  var keys = {};          // the screen's key handlers: SoftLeft, Enter, SoftRight, digits, Backspace
  var invite = null;      // the opened link: { code, name, phone, union_name, leader_name }
  var busy = false;

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
    });
  }
  function phoneText(p) {   // +91 90000 00000
    var d = String(p || '').replace(/\D/g, '').slice(-10);
    return d.length === 10 ? '+91 ' + d.slice(0, 5) + ' ' + d.slice(5) : String(p || '');
  }
  // A softkey: a label and an action, also a link (href) for a screen without keys.
  function soft(el, label, fn) {
    el.textContent = label || '';
    el.onclick = function (e) { e.preventDefault(); if (fn && !busy) fn(); };
    el.setAttribute('href', '#');
    el.style.visibility = label ? 'visible' : 'hidden';
  }
  function screen(html, l, c, r) {
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

  // ---- screens ----

  function loading() { screen('<p class="muted">…</p>'); }

  function expired() {
    screen('<h1>This link no longer works</h1><p class="muted">It was used already, or it is older than 30 minutes. ' +
      'Ask your union leader to send a new one.</p>', null, ['OK', function () { window.close(); }]);
  }

  function welcome(code) {
    var i = invite;
    var rows = [['Union', i.union_name], ['Leader', i.leader_name], ['Phone', phoneText(i.phone)]];
    var html = '<h1>Welcome, ' + esc(i.name) + '</h1><div class="line"></div>';
    for (var k = 0; k < rows.length; k++) {
      if (rows[k][1]) html += '<div class="row"><span class="muted">' + rows[k][0] + '</span><b>' + esc(rows[k][1]) + '</b></div>';
    }
    html += '<p class="muted" style="margin-top:8px">Nila sends you SMS and calls about your money. OK means you agree.</p><p id="msg" class="err"></p>';
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
      try { localStorage.setItem('nila.lite.member', out.member); } catch (e) { /* no storage */ }
      go('#/next');
    }, fail);
  }

  function fail(e) {
    busy = false;
    if (e && e.status === 410) { go('#/expired'); return; }
    var msg = document.getElementById('msg');
    if (msg) msg.textContent = (e && e.message) || 'Something went wrong. Try again.';
  }

  function next() {
    // F14 (each field's location, then F13 #pending) is the next build step.
    screen('<h1>Send your fields</h1><p class="muted">Your phone is set up. Next you send the location of each field, ' +
      'with your union leader.</p><p class="muted">Not built yet (F14).</p>');
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
    if ((m = /^#\/l\/([0-9A-Z]+)$/.exec(h))) { open(m[1], function () { welcome(m[1]); }); return; }
    if (h === '#/expired') { expired(); return; }
    var member = null;
    try { member = localStorage.getItem('nila.lite.member'); } catch (e) { /* no storage */ }
    if (h === '#/next' || member) { next(); return; }
    expired();
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
