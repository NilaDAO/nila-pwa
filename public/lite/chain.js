/* Nila lite: chain reads without the Stellar SDK (KaiOS 2.5 / Gecko 48 has no BigInt, which the SDK needs). Plain
 * ES5. A read is a simulated contract call on the public Stellar RPC (simulateTransaction), as the app's readContract:
 * the transaction XDR is written by hand and the returned ScVal is decoded to plain values. 64- and 128-bit integers
 * become Numbers (exact up to 2^53: rupee amounts in 7-decimal units are far below it). Addresses read as G… / C….
 *   NilaChain.read(rpcUrl, passphrase, source G…, contract C…, fn, [args]) -> Promise<value>
 *   args: NilaChain.addr('G…'|'C…'), NilaChain.bytes(hex), NilaChain.u32(n), NilaChain.u64(n) */
(function () {
  'use strict';
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var TWO32 = 4294967296;

  // ---- strkeys ----
  function crc16(bytes) {
    var crc = 0;
    for (var i = 0; i < bytes.length; i++) {
      crc ^= bytes[i] << 8;
      for (var j = 0; j < 8; j++) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc;
  }
  function b32enc(bytes) {
    var bits = 0, val = 0, out = '';
    for (var i = 0; i < bytes.length; i++) { val = ((val << 8) | bytes[i]) & 0xffff; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function b32dec(str) {
    var bits = 0, val = 0, out = [];
    for (var i = 0; i < str.length; i++) { val = ((val << 5) | B32.indexOf(str[i])) & 0xffff; bits += 5; if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; } }
    return new Uint8Array(out);
  }
  function strkey(version, raw) {
    var p = new Uint8Array(33); p[0] = version; p.set(raw, 1);
    var c = crc16(p), all = new Uint8Array(35); all.set(p); all[33] = c & 255; all[34] = c >> 8;
    return b32enc(all);
  }
  function rawOf(key) { return b32dec(key).subarray(1, 33); }

  // ---- XDR writer ----
  function W() { this.a = []; }
  W.prototype.u32 = function (v) { this.a.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255); return this; };
  W.prototype.u64 = function (v) { this.u32(Math.floor(v / TWO32)); return this.u32(v % TWO32); };
  W.prototype.raw = function (b) { for (var i = 0; i < b.length; i++) this.a.push(b[i]); return this; };
  W.prototype.opaque = function (b) { this.u32(b.length).raw(b); for (var i = b.length % 4; i && i < 4; i++) this.a.push(0); return this; };
  W.prototype.str = function (s) { var b = []; for (var i = 0; i < s.length; i++) b.push(s.charCodeAt(i)); return this.opaque(b); };
  function scAddress(w, key) {
    if (key[0] === 'G') w.u32(0).u32(0).raw(rawOf(key));       // SC_ADDRESS_TYPE_ACCOUNT, PUBLIC_KEY_TYPE_ED25519
    else w.u32(1).raw(rawOf(key));                             // SC_ADDRESS_TYPE_CONTRACT
  }
  var arg = {
    addr: function (k) { return function (w) { w.u32(18); scAddress(w, k); }; },
    bytes: function (hex) { var b = []; for (var i = 0; i < hex.length; i += 2) b.push(parseInt(hex.substr(i, 2), 16)); return function (w) { w.u32(13).opaque(b); }; },
    u32: function (n) { return function (w) { w.u32(3).u32(n); }; },
    u64: function (n) { return function (w) { w.u32(5).u64(n); }; },
  };
  function txXdr(source, contract, fn, args) {
    var w = new W();
    w.u32(2);                                  // ENVELOPE_TYPE_TX
    w.u32(0).raw(rawOf(source));               // source: MuxedAccount ed25519
    w.u32(100).u64(0);                         // fee, seqNum
    w.u32(0).u32(0);                           // PRECOND_NONE, MEMO_NONE
    w.u32(1);                                  // one operation
    w.u32(0);                                  // no op source
    w.u32(24);                                 // INVOKE_HOST_FUNCTION
    w.u32(0);                                  // HOST_FUNCTION_TYPE_INVOKE_CONTRACT
    scAddress(w, contract); w.str(fn);
    w.u32(args.length); for (var i = 0; i < args.length; i++) args[i](w);
    w.u32(0);                                  // no auth
    w.u32(0);                                  // tx ext v0
    w.u32(0);                                  // no signatures
    return btoa(String.fromCharCode.apply(null, w.a));
  }

  // ---- XDR reader (ScVal) ----
  function R(b64) { var s = atob(b64); this.b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) this.b[i] = s.charCodeAt(i); this.i = 0; }
  R.prototype.u32 = function () { var b = this.b, i = this.i; this.i += 4; return ((b[i] << 24) >>> 0) + (b[i + 1] << 16) + (b[i + 2] << 8) + b[i + 3]; };
  R.prototype.i32 = function () { var v = this.u32(); return v >= 2147483648 ? v - TWO32 : v; };
  R.prototype.u64 = function () { return this.u32() * TWO32 + this.u32(); };
  R.prototype.i64 = function () { var hi = this.i32(); return hi * TWO32 + this.u32(); };
  R.prototype.raw = function (n) { var o = this.b.subarray(this.i, this.i + n); this.i += n; return o; };
  R.prototype.opaque = function () { var n = this.u32(), o = this.raw(n); this.i += (4 - (n % 4)) % 4; return o; };
  R.prototype.str = function () { var o = this.opaque(), s = ''; for (var i = 0; i < o.length; i++) s += String.fromCharCode(o[i]); return s; };
  function hex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += (b[i] < 16 ? '0' : '') + b[i].toString(16); return s; }
  function readAddress(r) {
    var t = r.u32();
    if (t === 0) { r.u32(); return strkey(6 << 3, r.raw(32)); }   // G…
    if (t === 1) return strkey(2 << 3, r.raw(32));                 // C…
    throw new Error('address type ' + t);
  }
  function scVal(r) {
    var t = r.u32(), n, out, i;
    switch (t) {
      case 0: return r.u32() !== 0;                        // bool
      case 1: return null;                                 // void
      case 3: return r.u32();
      case 4: return r.i32();
      case 5: case 7: case 8: return r.u64();              // u64, timepoint, duration
      case 6: return r.i64();
      case 9: return r.u64() * TWO32 * TWO32 + r.u64();    // u128
      case 10: return r.i64() * TWO32 * TWO32 + r.u64();   // i128
      case 13: return hex(r.opaque());                     // bytes: hex
      case 14: case 15: return r.str();                    // string, symbol
      case 16:                                             // vec (optional)
        if (!r.u32()) return null;
        n = r.u32(); out = []; for (i = 0; i < n; i++) out.push(scVal(r)); return out;
      case 17:                                             // map (optional): symbol keys -> object
        if (!r.u32()) return null;
        n = r.u32(); out = {}; for (i = 0; i < n; i++) { var k = scVal(r); out[k] = scVal(r); } return out;
      case 18: return readAddress(r);
      default: throw new Error('value type ' + t);
    }
  }

  function read(rpc, source, contract, fn, args) {
    return fetch(rpc, { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'simulateTransaction', params: { transaction: txXdr(source, contract, fn, args || []) } }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var res = j.result;
        if (!res || res.error || !res.results || !res.results[0]) throw new Error((res && res.error) || (j.error && j.error.message) || 'no answer');
        return scVal(new R(res.results[0].xdr));
      });
  }

  window.NilaChain = { read: read, addr: arg.addr, bytes: arg.bytes, u32: arg.u32, u64: arg.u64 };
})();
