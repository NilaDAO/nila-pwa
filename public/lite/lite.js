/* Nila lite (P8): the keypad (KaiOS 2.5, Gecko 48) app. Plain ES5 + Promises: no async/await, no arrow functions,
 * no spread, no build step. Screens are #hash routes (nila-design "Keypad phones"):
 *   #/l/<code>        F9 #welcome: her name, union, leader; OK = consent to SMS, then the phone
 *                     makes its device key and registers it (no PIN, executive decision 22 Oct: the device key's
 *                     signature is her consent)
 *   #/expired         F9 #expired: the link was used, voided or is older than 30 minutes
 *   (any other route) once set up but opened in the browser: "Add Nila to your apps" (27 Oct, mandatory; ?app=1 = pinned)
 *   (F14 is gone, 26 Oct: the leader takes her field points on the leader's phone; after F9 the phone opens F1)
 *   #/home            (26 Oct, simplified) no land title yet: the pending screen; the title ready and not seen yet:
 *                     #/property; then the asset list (26 Oct): F1/F11/F12 as rows (the QR is the right softkey on every screen): invested, crop
 *                     shares, machine work, crop plan, land, messages (read only; no nIN rows: members hold no nIN)
 *   #/help            the help QR as large as the screen allows (A2: a leader acts for her for 5 minutes, session.js)
 *   #/property        the land title is ready: one image of the screen's exact size showing the property; OK → home
 *   #/share/<token>   F7: one crop share (lent, repay, repaid, by when; or ready to use, with the help QR)
 *   #/plan, #/plan/<i>  F12: the crop plan's seasons per area, and one season
 *   #/land, #/land/<n>  F13: her land title's areas (a picture per area), an area's earlier crops; #pending before the title
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
  // The help QR on the right softkey of every screen once the phone is set up (26 Oct), so the member can show it to
  // a leader from anywhere; the route turns it off for F9, the property image and the QR itself.
  var qrKey = false;
  function screen(html, l, c, r, title) {
    if (qrKey) r = ['QR', function () { go('#/help'); }];
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
    var c = window.crypto && window.crypto.subtle;
    if (!c) return Promise.reject(new Error('This phone cannot make a key (no secure connection).'));
    // A re-sent link opened on the phone that already holds this member's key (26 Oct): the same key and Polygon
    // address again, so the account stays the same and needs no recovery. Another member on this phone: a new key.
    if (invite && invite.member && stored('nila.lite.member') === invite.member) {
      return loadDevice().then(function (rec) { return rec && rec.pair ? reuseKey(code, rec) : newDeviceKey(code); });
    }
    return newDeviceKey(code);
  }
  function hexBytes(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function reuseKey(code, rec) {
    var c = window.crypto.subtle, address = window.NilaPolygon.addressOf(hexBytes(rec.polygon)), spki;
    return c.exportKey('spki', rec.pair.publicKey).then(function (der) {
      spki = b64(der);
      return c.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, rec.pair.privateKey,
        utf8('nila-keypad-register\n' + code + '\n' + spki + '\n' + address));
    }).then(function (sig) { return { device_key: spki, sig: b64(sig), polygon: address }; });
  }
  function newDeviceKey(code) {
    var poly = window.NilaPolygon.newKey();
    var c = window.crypto.subtle;
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

  function loadDevice() {
    return idb().then(function (db) {
      return new Promise(function (ok, fail) {
        var req = db.transaction('keys', 'readonly').objectStore('keys').get('device');
        req.onsuccess = function () { ok(req.result || null); };
        req.onerror = function () { fail(req.error); };
      });
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
      } catch (e) { /* no storage */ }
      go('#/home');
    }, fail);
  }

  function fail(e) {
    busy = false;
    if (e && e.status === 410) { go('#/expired'); return; }
    var msg = document.getElementById('msg');
    if (msg) msg.textContent = (e && e.message) || 'Something went wrong. Try again.';
  }

  // F14 is gone (26 Oct, executive decision): the leader takes her field points on the leader's phone (L14).
  function stored(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function store(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* no storage */ } }

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

  /** #/home: pending until the land title exists, the property once, then the assets screen. */
  function home() {
    withData('Nila', function (d) {
      if (!d.me.title) { pending(d); return; }
      if (!stored('nila.lite.seen.' + d.me.title.title_id)) { go('#/property'); return; }
      assetsHome(d);
    });
  }

  function pending(d) {
    var f = (d.me.pending && d.me.pending.fields) || [];
    screen('<h1>Waiting for your land title</h1>' +
      (f.length ? '<p>' + f.length + (f.length === 1 ? ' field' : ' fields') + ' with your union leader</p>' : '') +
      '<p class="muted">Your union leader maps your fields and makes your land title. You get an SMS when it is ready.</p>',
      ['Refresh', function () { data = null; home(); }], null, null, 'Nila');
  }

  /** #/property: the land title is ready; the property on one image of this screen's exact size. */
  function property() {
    withData('Nila', function (d) {
      if (!d.me.title) { go('#/home'); return; }
      var w = window.innerWidth || 240, h = window.innerHeight || 320;
      document.body.className = 'full';
      var ok = function () {
        document.body.className = '';
        store('nila.lite.seen.' + d.me.title.title_id, '1');
        go('#/home');
      };
      screen('<div class="full-img"><p class="muted" id="mapmsg">Your land title is ready</p></div>', null, ['OK', ok], null, 'Your land');
      signed('land', { w: w, h: h }).then(function (q) {
        var box = main.querySelector('.full-img'); if (!box) return;
        var img = new Image(); img.width = w; img.height = h; img.alt = 'Your land';
        img.onload = function () { box.innerHTML = ''; box.appendChild(img); };
        img.onerror = function () { var m = document.getElementById('mapmsg'); if (m) m.textContent = 'Your land title is ready. No map image right now.'; };
        // The hosted static demo (static.js): the picture is a file of the site.
        img.src = window.NILA_LITE_STATIC ? '/lite/demo-land.jpg' : API + '/keypad/land?p=' + encodeURIComponent(q.p) + '&s=' + encodeURIComponent(q.s);
      });
    });
  }

  /** The asset list: F1/F11/F12 as rows (the QR is the right softkey). */
  function assetsHome(d) {
    var me = d.me, shares = me.shares || [];
    var rows = [{ t: 'Invested', s: 'Invest or withdraw', v: inr(d.invested), go: function () { go('#/invested'); } }];
    var hours = 0, owed = 0;
    shares.forEach(function (x) {
      var i = shareInfo(d, x);
      hours += i.hours;
      if (i.m) owed += i.m.left;
      if (i.m && i.m.left > 0) rows.push({ t: 'Crop share', s: (x.name || x.crop) + ' \u00b7 repay by ' + part(i.due), v: inr(i.m.atDue), go: function () { go('#/share/' + hexKey(x.token)); } });
      else if (x.state === 'ready') rows.push({ t: 'Crop share', s: (x.name || x.crop) + ' \u00b7 ready to use', v: inr(x.cash), go: function () { go('#/share/' + hexKey(x.token)); } });
    });
    if (hours > 0) rows.push({ t: 'Machine work', s: 'Pay a machine owner', v: (Math.round(hours * 10) / 10) + ' ac', go: function () { go('#/hours'); } });
    var next = shares.filter(function (x) { return x.state === 'ready' || x.state === 'early'; })
      .sort(function (a, b) { return tsOf(a.sow) - tsOf(b.sow); })[0];
    rows.push({ t: 'My crop plan', s: next ? 'Next: sow ' + (next.name || next.crop) + ' by ' + part(tsOf(next.sow)) : (shares.length ? 'All seasons' : 'No plan yet'), go: function () { go('#/plan'); } });
    var t = me.title, acres = t.areas.reduce(function (a, z) { return a + z.acres; }, 0);
    rows.push({ t: 'My land', s: t.areas.length + (t.areas.length === 1 ? ' area' : ' areas') + ' \u00b7 ' + (Math.round(acres * 10) / 10) + ' acres', go: function () { go('#/land'); } });
    rows.push({ t: 'Messages', s: (me.messages || []).length + ' from Nila', go: function () { go('#/messages'); } });
    // The total at the top (26 Oct): what is invested less what is owed on crop shares now.
    var head = '<div class="total"><small class="muted">Total balance</small><div class="big">' + esc(inr(d.invested - owed)) + '</div>' +
      (owed > 0 ? '<small class="muted">Invested ' + esc(inr(d.invested)) + ' \u00b7 owed ' + esc(inr(owed)) + '</small>' : '') + '</div>';
    if (me.title) setTimeout(function () { keepAreas(d); }, 500);
    menu('home', 'Nila', head, rows, ['Refresh', function () { data = null; home(); }], undefined, null);
  }

  function share(token) {
    withData('My crop share', function (d) {
      var x = (d.me.shares || []).filter(function (y) { return hexKey(y.token) === token; })[0];
      var back = ['Back', function () { go('#/home'); }];
      if (!x) { screen('<p class="muted">This crop share is not in your plan.</p>', back, null, null, 'My crop share'); return; }
      // Under the area picture (27 Oct): what to do with it, as the crop plan's explainer, in a lighter grey.
      var i = shareInfo(d, x), what = i.m ? 'Repay at the union office, in cash.' : 'To use it, go to your union office and show your QR to your leader.';
      var h = '<h1>' + esc(x.name || x.crop) + ' \u00b7 Area ' + esc(x.area) + '</h1>' +
        (x.area ? '<div class="map" id="areamap"><p class="muted">\u2026</p></div>' : '') + '<p class="small hint">' + what + '</p><div class="rows">';
      if (i.m) {
        h += row('Lent', inr(i.m.lent)) + (i.hours ? row('Machine work', (Math.round(i.hours * 10) / 10) + ' tractor acres') : '') + row('You repay', inr(i.m.atDue)) +
          row('Repaid', inr(i.m.repaid)) + row('Repay by', part(i.due)) + '</div>';
      } else {
        h += row('Cash up to', inr(x.cash)) + row(x.state === 'early' ? 'From' : 'Use by', part(x.state === 'early' ? x.open : x.final)) +
          '</div>';
      }
      screen(h, back, null, null, 'My crop share');
      if (x.area) areaImage(d, x.area).then(function (url) {
        var box = document.getElementById('areamap'); if (!box) return;
        box.innerHTML = '<img width="220" height="150" alt="Area ' + esc(x.area) + '" src="' + url + '">';
      }, function () { var box = document.getElementById('areamap'); if (box) box.innerHTML = '<p class="muted small">No picture right now.</p>'; });
    });
  }
  // ---- machine work (27 Oct, in acres): she picks the crop share and the job, her phone shows a QR the owner scans ----
  // Nothing is typed: the job's acres are the crop share's area × its passes (the plan's jobs, /keypad/me). The QR is her
  // own signed authorization of machinery.claim for this voucher, up to that job's units, once, for 2 days (session.js
  // voucher): the owner gets no session and cannot act for her account; the owner may lower the acres for a part done.
  var VOUCHER_LEDGERS = 34560;   // 48 hours of 5-second ledgers
  var JOB_NAMES = { 1: 'Tractor + rotavator', 2: 'Seed drill / planter', 3: 'Power weeder', 4: 'Tractor + cultivator', 5: 'Tractor + plough',
    6: 'Tractor + disc harrow', 7: 'Tractor + ridger', 8: 'Tractor + puddler', 9: 'Tractor + trailer', 10: 'Tractor + cane trailer',
    11: 'Power tiller', 12: 'Paddy transplanter', 13: 'Sugarcane sett planter' };
  function voucherList(d) {
    var out = [];
    (d.me.shares || []).forEach(function (x) {
      var left = d.vouchers[hexKey(x.token)] || 0;
      if (left > 0) out.push({ x: x, left: left });
    });
    return out;
  }
  function tAcres(units) { return Math.round(units / 10) / 10; }
  /** #/hours: her crop shares with machine work left; one goes straight to its jobs. */
  function machineHours() {
    withData('Machine work', function (d) {
      var list = voucherList(d);
      if (list.length === 1) { go('#/hours/' + hexKey(list[0].x.token)); return; }
      menu('hours', 'Machine work', '<p class="small">Pay a machine owner for work on your crop share. Choose the crop share.</p>',
        list.map(function (v) {
          return { t: (v.x.name || v.x.crop || 'Crop share') + (v.x.area ? ' \u00b7 Area ' + v.x.area : ''), s: tAcres(v.left) + ' tractor acres left',
            go: function () { go('#/hours/' + hexKey(v.x.token)); } };
        }), ['Back', function () { go('#/home'); }], list.length ? undefined : null, null);
      if (!list.length) main.innerHTML += '<p class="muted">No machine work left.</p>';
    });
  }
  /** #/hours/<token>: the share's jobs (the plan's machines, each its acres); OK on one shows its QR. */
  function hoursEntry(tok) {
    withData('Machine work', function (d) {
      var left = d.vouchers[tok] || 0;
      var x = (d.me.shares || []).filter(function (y) { return hexKey(y.token) === tok; })[0] || {};
      var back = ['Back', function () { go('#/home'); }];
      if (left <= 0) { screen('<p class="muted">No machine work left on this crop share.</p>', back, null, null, 'Machine work'); return; }
      var jobs = (x.jobs || []).filter(function (j) { return j.units > 0; });
      var make = function (units, label) {
        busy = true;
        screen('<div class="qr qr-big" id="qr"><p class="muted" style="color:#121212">Making your QR\u2026</p></div>', null, null, null, 'Machine work');
        var cfg = d.cfg;
        fetch(cfg.rpc_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }) }).then(function (r) { return r.json(); }).then(function (l) {
          return loadKey().then(function (pair) {
            if (!pair) throw new Error('This phone has no key. Ask your union leader for a new link.');
            return window.NilaSession.voucher({ passphrase: cfg.passphrase, machinery: cfg.contracts.machinery, union: cfg.union,
              account: d.me.account, token: hexBytes(tok), units: units, ledger: l.result.sequence, ledgers: VOUCHER_LEDGERS },
            function (payload) { return window.crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, payload); });
          });
        }).then(function (q) {
          return window.NilaQR.svg(q.qr, { margin: 1, errorCorrectionLevel: 'L' });
        }).then(function (svg) {
          busy = false;
          screen('<div class="qr qr-big">' + svg + '</div><p class="small hint" style="text-align:center">' + esc(label) + ' \u00b7 valid 2 days. Show this to the machine owner.</p>',
            ['Back', function () { go('#/home'); }], ['Done', function () { go('#/home'); }], null, 'Machine work');
        }, function (e) {
          busy = false;
          screen('<p class="err">' + esc((e && e.message) || 'Could not make the QR. Try again.') + '</p>', back, null, null, 'Machine work');
        });
      };
      // No jobs in the plan (an older share): one QR for what is left, any machine; the owner's app caps it at the area.
      if (!jobs.length) {
        screen('<p class="small">Show a QR for the machine work left on this crop share (' + tAcres(left) + ' tractor acres).</p>',
          back, ['Show QR', function () { make(left, 'Machine work up to ' + tAcres(left) + ' tractor acres'); }], null, 'Machine work');
        return;
      }
      menu('jobs', 'Machine work', '<p class="small">Choose the job. The QR covers the area of this crop share.</p>',
        jobs.map(function (j) {
          var units = Math.min(j.units, left), part = units < j.units;
          var name = JOB_NAMES[j.type] || 'Machine';
          var acres = part ? Math.floor(j.acres * units / j.units * 100) / 100 : j.acres;
          return { t: name, s: acres + ' acres' + (part ? ' (what is left)' : ''), go: function () { make(units, name + ' \u00b7 ' + acres + ' acres'); } };
        }), back, undefined, null);
    });
  }

  /** #/invested: invest or withdraw, each a list of steps (both at the union office, with the QR). */
  function invested() {
    withData('Invested', function (d) {
      menu('invested', 'Invested', '<p class="small">Invested: <b>' + esc(inr(d.invested)) + '</b></p>', [
        { t: 'Invest', s: 'Add cash to your investment', go: function () { go('#/invested/in'); } },
        { t: 'Withdraw', s: 'Take cash out', go: function () { go('#/invested/out'); } },
      ], ['Back', function () { go('#/home'); }], undefined, null);
    });
  }
  var STEPS = {
    'in': ['Invest', ['Take the cash to your union office.', 'Press QR and show it to your leader.',
      'Your leader counts the cash and scans your QR.', 'Your investment shows here after Refresh.']],
    out: ['Withdraw', ['Go to your union office.', 'Press QR and show it to your leader. Your leader starts the withdrawal.',
      'After 14 days, go to the office again and show your QR.', 'Your leader pays you the cash.']],
  };
  function steps(k) {
    var st = STEPS[k];
    screen('<h1>' + esc(st[0]) + '</h1><ol class="steps">' + st[1].map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ol>',
      ['Back', function () { go('#/invested'); }], null, null, st[0]);
  }
  // ---- area pictures (26 Oct): one per crop share's area, kept on the phone; made again when the plan or its areas
  // change (the key holds the record and the plan ids), older ones removed ----
  var AREA = 'nila.lite.area.';
  function areaVersion(d) {
    var t = d.me.title || {}, ids = {};
    (d.me.shares || []).forEach(function (x) { if (x.plan_id) ids[String(x.plan_id).slice(0, 8)] = 1; });
    return 'e' + String(t.record_hash || '').slice(2, 12) + '.' + Object.keys(ids).sort().join('-');   // e: Esri pictures (27 Oct)
  }
  function areaKey(d, a) { return AREA + areaVersion(d) + '.' + String(a).replace(/\s/g, ''); }
  function dropOldAreas(d) {
    var keep = AREA + areaVersion(d) + '.', gone = [];
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (k && k.indexOf(AREA) === 0 && k.indexOf(keep) !== 0) gone.push(k);
      }
      gone.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* no storage */ }
  }
  /** The picture of area(s) `a` ("1 + 2") as a data URL: kept, else fetched once (220 × 150) and kept. */
  function areaImage(d, a) {
    var k = areaKey(d, a), had = stored(k);
    if (had) return Promise.resolve(had);
    return signed('land', { w: 220, h: 150, a: String(a) }).then(function (q) {
      return fetch(API + '/keypad/land?p=' + encodeURIComponent(q.p) + '&s=' + encodeURIComponent(q.s));
    }).then(function (r) {
      if (!r.ok) throw new Error('no picture');
      return r.blob();
    }).then(function (b) {
      return new Promise(function (ok, fail) {
        var fr = new FileReader();
        fr.onload = function () { store(k, fr.result); ok(fr.result); };
        fr.onerror = fail;
        fr.readAsDataURL(b);
      });
    });
  }
  /** After the asset list: every crop share's area picture, one after the other (so they are there offline). */
  function keepAreas(d) {
    dropOldAreas(d);
    var seen = {}, list = [];
    (d.me.shares || []).forEach(function (x) { if (x.area && !seen[x.area]) { seen[x.area] = 1; list.push(x.area); } });
    list.reduce(function (p, a) { return p.then(function () { return areaImage(d, a).catch(function () {}); }); }, Promise.resolve());
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
      var head = '';
      // One sentence on what a crop plan is (26 Oct); without a plan, the member opens the QR for the leader to make it.
      head = '<p class="small">Your crop plan says what to grow on each area for the coming year, and the cash and machine work for it.</p>' + head +
        (list.length ? '' : d.me.plan === 'waiting' ? '<p>Your crop plan is made. It waits for your union leader to approve it.</p>' :
          d.me.plan === 'approved' ? '<p>Your crop plan is approved. Your union is making your crop shares.</p>' :
          d.me.plan === 'denied' ? '<p>Your union leader did not approve the plan. Open your QR and show it to your union leader to make a new one.</p>' :
          '<p>No crop plan yet. Open your QR and show it to your union leader to make it with you.</p>');
      menu('plan', 'My crop plan', head, list.map(function (x, k) {
        var i = shareInfo(d, x);
        return { t: (months(x.slot) ? months(x.slot) + ' \u00b7 ' : '') + (x.name || x.crop), s: 'Area ' + x.area + acresOf(x) + (i.m ? ' \u00b7 financed' : ''),
          v: i.m ? inr(i.m.lent) : '\u2014', go: function () { go('#/plan/' + k); } };
      }), ['Back', function () { go('#/home'); }], list.length || d.me.plan === 'waiting' || d.me.plan === 'approved' ? undefined : ['Open QR', function () { go('#/help'); }], null);
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
        (i.hours ? row('Machine work', (Math.round(i.hours * 10) / 10) + ' tractor acres') : '') +
        (x.sow ? row('Sow', part(tsOf(x.sow))) : '') + (x.harvest ? row('Harvest', part(tsOf(x.harvest))) : '') +
        (i.m ? row('Repay by', part(i.due)) : '') + '</div>', back, null, ['Map', function () { go('#/land'); }], 'My crop plan');
    });
  }

  function land() {
    withData('My land', function (d) {
      var t = d.me.title, back = ['Back', function () { go('#/home'); }];
      if (!t) {
        var f = (d.me.pending && d.me.pending.fields) || [], h = '<h1>Waiting for your land title</h1>';
        if (f.length) h += '<p class="muted small">' + f.length + (f.length === 1 ? ' field' : ' fields') + ' with your union leader</p>';
        screen(h + '<p class="muted small">Your union leader draws the borders of each field. You get an SMS when your land title is ready; then the map shows here.</p>',
          back, null, null, 'My land');
        return;
      }
      var now = {};
      (d.me.shares || []).forEach(function (x) {
        var a = tsOf(x.sow) * 1000, b = tsOf(x.harvest) * 1000;
        if (a && a <= Date.now() && (!b || b >= Date.now())) String(x.area || '').split(' + ').forEach(function (n) { now[n] = x.name || x.crop; });
      });
      // The picture follows the focused row (27 Oct): an area's own picture (that area outlined, the rest dimmed; kept on
      // the phone), the whole property on the other rows. The menu redraws the screen on every move, so the picture is
      // put back after each redraw. An area opens its last crops (from the node: the keypad never loads the record).
      var rows = t.areas.map(function (z) {
        var has = z.history && z.history.length;
        return { t: 'Area ' + z.n + ' \u00b7 ' + z.acres + ' acres', s: now[z.n] ? now[z.n] + ' now' : (has ? 'Earlier crops' : ''), area: z.n,
          go: has ? function () { go('#/land/' + z.n); } : null };
      });
      rows.push({ t: 'Trees', s: (d.me.trees || []).length ? d.me.trees.length + ' registered' : 'None registered yet', go: null });
      rows.push({ t: 'Water', s: (d.me.water || []).length ? d.me.water.length + ' sources' : 'No water source registered yet', go: null });
      var fill = function () {
        var r = rows[Math.min(focus.land || 0, rows.length - 1)], a = r && r.area ? String(r.area) : '';
        picture(d, a, a ? 'Satellite image of area ' + a : 'Satellite image of your land');
      };
      var wrap = function () {
        var dn = keys.ArrowDown, up = keys.ArrowUp;
        keys.ArrowDown = function () { dn(); wrap(); fill(); };
        keys.ArrowUp = function () { up(); wrap(); fill(); };
      };
      menu('land', 'My land', '<div class="map"><p class="muted" id="mapmsg">\u2026</p></div>', rows, back,
        ['Open', function () { var r2 = rows[focus.land || 0]; if (r2 && r2.go) r2.go(); }]);
      wrap(); fill();
    });
  }
  /** Puts area `a`'s picture ('' = the property) into the screen's .map box, from the phone's copy when it has one. */
  function picture(d, a, alt) {
    areaImage(d, a).then(function (url) {
      var box = main.querySelector('.map'); if (!box) return;
      box.innerHTML = '<img width="220" height="150" alt="' + esc(alt) + '" src="' + url + '">';
    }, function () { var m = document.getElementById('mapmsg'); if (m) m.textContent = 'No map image right now.'; });
  }
  /** #/land/<n>: the area's picture and its last crops (newest first), from the field record on the node. */
  function area(n) {
    withData('My land', function (d) {
      var t = d.me.title, z = t && t.areas.filter(function (a) { return a.n === n; })[0];
      if (!z) { go('#/land'); return; }
      var others = t.areas.filter(function (a) { return a.n !== n && a.history && a.history.length; });
      var month = function (ym) { var p = String(ym || '').split('-'); return p.length === 2 ? MON[parseInt(p[1], 10) - 1] + ' ' + p[0] : ''; };
      var h = '<h1>Area ' + z.n + ' \u00b7 ' + z.acres + ' acres</h1><div class="map"><p class="muted" id="mapmsg">\u2026</p></div>' +
        '<p class="small hint">Earlier crops on this area</p><div class="rows">';
      (z.history || []).forEach(function (c) {
        h += row(c.crop.charAt(0).toUpperCase() + c.crop.slice(1), month(c.sos) + ' \u2013 ' + (c.eos ? month(c.eos) : 'now'));
      });
      h += '</div><p class="muted small">From your field record</p>';
      screen(h, ['Back', function () { go('#/land'); }], null, others.length ? ['Area ' + others[0].n, function () { go('#/land/' + others[0].n); }] : null, 'My land');
      picture(d, String(z.n), 'Satellite image of area ' + z.n);
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

  var helpTimer = null, helpCache = null;   // the QR stays on screen while the rows move (5 minutes)
  /** #/help: the help QR as large as the screen allows. */
  function help() {
    screen('<div class="qr qr-big" id="qr"><p class="muted" style="color:#121212">Making your QR\u2026</p></div>' +
      '<p class="muted small" id="left" style="text-align:center">Show this to your leader</p>',
      ['Back', function () { go('#/home'); }], ['New', function () { helpCache = null; help(); }], null, 'QR');
    helpQr();
  }

  /** Fills #qr and #left with a fresh help QR (made once per 5 minutes; the list redraws keep it). */
  function helpQr() {
    var box = document.getElementById('qr');
    var show = function (q) {
      var b2 = document.getElementById('qr'); if (!b2) return;
      b2.innerHTML = q.svg;
      var left = function () { return Math.max(0, q.until - Math.floor(Date.now() / 1000)); };
      var tick = function () {
        var el = document.getElementById('left');
        if (!el) { clearInterval(helpTimer); helpTimer = null; return; }
        el.textContent = left() > 0 ? 'Show this to your leader \u00b7 ' + left() + ' s' : 'Expired: press New QR';
      };
      if (helpTimer) clearInterval(helpTimer);
      tick(); helpTimer = setInterval(tick, 1000);
    };
    if (helpCache && helpCache.until - Math.floor(Date.now() / 1000) > 20) { show(helpCache); return; }
    var account = stored('nila.lite.account');
    var fail = function (msg) { var el = document.getElementById('left'); if (el) { el.className = 'err small'; el.textContent = msg; } };
    if (!box) return;
    if (!account) { fail('Your account is not set up on this phone. Ask your union leader to send a new link.'); return; }
    var cfg;
    call('GET', '/stellar/config').then(function (c) {
      cfg = c;
      // The latest ledger, for the signature's expiry (the phone's own clock ends the QR after 5 minutes).
      return fetch(c.rpc_url, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestLedger' }) }).then(function (res) { return res.json(); });
    }).then(function (l) {
      return loadKey().then(function (pair) {
        if (!pair) throw new Error('This phone has no key. Ask your union leader for a new link.');
        return window.NilaSession.make({ passphrase: cfg.passphrase, account: account, ledger: l.result.sequence, now: Math.floor(Date.now() / 1000) },
          function (payload) { return window.crypto.subtle.sign({ name: 'ECDSA', hash: { name: 'SHA-256' } }, pair.privateKey, payload); });
      });
    }).then(function (q) {
      return window.NilaQR.svg(q.qr, { margin: 1, errorCorrectionLevel: 'L' }).then(function (svg) {
        helpCache = { svg: svg, until: q.until };
        show(helpCache);
      });
    }, function (e) { fail((e && e.message) || 'Could not make the QR. Try again.'); });
  }

  function open(code, then) {
    if (invite && invite.code === code) { then(); return; }
    loading();
    call('GET', '/keypad/l/' + code).then(function (i) {
      i.code = code; invite = i; then();
    }, fail);
  }

  // ---- Add to your apps (27 Oct, executive decision: mandatory, keypad only) ----
  // Nila must be opened from the phone's Apps menu, not from the browser: the manifests' start page carries `?app=1`
  // (manifest.webapp launch_path, manifest.json start_url), so a start from the pinned icon is known and remembered.
  // The SMS link and #/expired still open in the browser (the link opens there first). Desktop tests on a local host
  // may skip it; never elsewhere.
  if (/[?&]app=1(&|$)/.test(location.search)) store('nila.lite.pinned', '1');
  function devHost() {
    var h = location.hostname;
    return h === 'localhost' || h === '127.0.0.1' || /\.localhost$/.test(h) || location.port === '5175';
  }
  function pinned() {
    if (stored('nila.lite.pinned')) return true;
    try { if (devHost() && sessionStorage.getItem('nila.lite.pinskip')) return true; } catch (e) { /* no storage */ }
    return false;
  }
  function pinScreen(msg) {
    var steps = '<h1>Add Nila to your apps</h1><p class="small">Do this once. Then always open Nila from your Apps menu.</p>' +
      '<ol class="steps"><li>Press <b>Options</b> (the right key) in the browser.</li><li>Choose <b>Pin to Apps menu</b>.</li>' +
      '<li>Close the browser and open <b>Nila</b> from your Apps menu.</li></ol>' + (msg ? '<p class="small hint">' + esc(msg) + '</p>' : '');
    var add = null;
    if (navigator.mozApps && navigator.mozApps.install) {
      add = ['Add', function () {
        try {
          var req = navigator.mozApps.install(location.protocol + '//' + location.host + '/lite/manifest.webapp');
          req.onsuccess = function () { pinScreen('Added. Now open Nila from your Apps menu.'); };
          req.onerror = function () { pinScreen('Could not add it here: use the steps above.'); };
        } catch (e) { pinScreen('Could not add it here: use the steps above.'); }
      }];
    }
    screen(steps, devHost() ? ['Skip', function () { try { sessionStorage.setItem('nila.lite.pinskip', '1'); } catch (e) { /* no storage */ } go('#/home'); }] : null,
      add, null, 'Nila');
  }

  function route() {
    var h = location.hash, m;
    if (h !== '#/property') document.body.className = '';
    qrKey = false;
    if ((m = /^#\/l\/([0-9A-Z]+)$/.exec(h))) { open(m[1], function () { welcome(m[1]); }); return; }
    if (h === '#/expired') { expired(); return; }
    var member = stored('nila.lite.member');
    if (!member) { qrKey = false; expired(); return; }
    // Set up, but opened in the browser: add Nila to the apps first (no other screen until it is opened from there).
    if (!pinned()) { pinScreen(); return; }
    qrKey = h !== '#/property' && h !== '#/help';
    if (h === '#/property') { property(); return; }
    if (h === '#/help') { help(); return; }
    if (h === '#/home') { home(); return; }
    if ((m = /^#\/share\/([0-9a-f]+)$/.exec(h))) { share(m[1]); return; }
    if (h === '#/invested') { invested(); return; }
    if (h === '#/hours') { machineHours(); return; }
    if ((m = /^#\/hours\/([0-9a-f]{64})$/.exec(h))) { hoursEntry(m[1]); return; }
    if ((m = /^#\/invested\/(in|out)$/.exec(h))) { steps(m[1]); return; }
    if (h === '#/plan') { plan(); return; }
    if ((m = /^#\/plan\/(\d+)$/.exec(h))) { season(parseInt(m[1], 10)); return; }
    if (h === '#/land') { land(); return; }
    if ((m = /^#\/land\/(\d+)$/.exec(h))) { area(parseInt(m[1], 10)); return; }
    if (h === '#/messages') { messages(); return; }
    if ((m = /^#\/messages\/(\d+)$/.exec(h))) { message(parseInt(m[1], 10)); return; }
    go('#/home');
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
