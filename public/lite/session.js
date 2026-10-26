/* Nila lite: the help QR (A2, executive decision 26 Oct). Plain ES5 (KaiOS 2.5 / Gecko 48: no BigInt, no async).
 * The member's device key (ECDSA P-256) signs the authorization of `start_session(not_after)` on the member's own
 * smart account; the leader's app sends it, then acts for the member for 5 minutes. Same QR as the app's
 * src/stellar/session.js:
 *   NILA:S:<base32: kind 1 (1 Ed25519, 2 P-256) | account 32 | not_after 8 | nonce 8 | expiry ledger 4 | signature 64>
 * The Soroban payload is built by hand: sha256 of the XDR HashIdPreimage ENVELOPE_TYPE_SOROBAN_AUTHORIZATION
 * { networkId, nonce, signatureExpirationLedger, invocation: account.start_session(u64) }. WebCrypto's ECDSA signs
 * SHA-256 of that payload, which is what the account checks (secp256r1 over sha256(payload)); s is made low. */
(function () {
  'use strict';
  var B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  var N = hexBytes('FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551');   // the P-256 order
  var HALF = hexBytes('7FFFFFFF800000007FFFFFFFFFFFFFFFDE737D56D38BCF4279DCE5617E3192A8');

  function hexBytes(h) { var a = new Uint8Array(h.length / 2); for (var i = 0; i < a.length; i++) a[i] = parseInt(h.substr(i * 2, 2), 16); return a; }
  function concat(parts) {
    var n = 0, i, o = 0;
    for (i = 0; i < parts.length; i++) n += parts[i].length;
    var out = new Uint8Array(n);
    for (i = 0; i < parts.length; i++) { out.set(parts[i], o); o += parts[i].length; }
    return out;
  }
  function u32(v) { return new Uint8Array([(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255]); }
  function u64(v) { return concat([u32(Math.floor(v / 4294967296)), u32(v % 4294967296)]); }   // 0 ≤ v < 2^53
  function ascii(s) { var a = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return a; }
  function toB32(bytes) {
    var bits = 0, val = 0, out = '';
    for (var i = 0; i < bytes.length; i++) {
      val = ((val << 8) | bytes[i]) & 0xffff; bits += 8;
      while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; }
    }
    if (bits > 0) out += B32[(val << (5 - bits)) & 31];
    return out;
  }
  function fromB32(str) {
    var bits = 0, val = 0, out = [];
    for (var i = 0; i < str.length; i++) {
      val = ((val << 5) | B32.indexOf(str[i])) & 0xffff; bits += 5;
      if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
    }
    return new Uint8Array(out);
  }
  /** The 32-byte id of a contract address (C…). */
  function contractBytes(c) { return fromB32(c).subarray(1, 33); }
  function sha256(bytes) { return window.crypto.subtle.digest('SHA-256', bytes).then(function (h) { return new Uint8Array(h); }); }
  function gt(a, b) { for (var i = 0; i < a.length; i++) { if (a[i] !== b[i]) return a[i] > b[i]; } return false; }
  function sub(a, b) {   // a - b, both 32 bytes, a ≥ b
    var out = new Uint8Array(32), borrow = 0;
    for (var i = 31; i >= 0; i--) { var d = a[i] - b[i] - borrow; borrow = d < 0 ? 1 : 0; out[i] = (d + 256) & 255; }
    return out;
  }
  /** r | s with s in the lower half (the account accepts only that form). */
  function lowS(sig) {
    var s = sig.subarray(32, 64);
    return gt(s, HALF) ? concat([sig.subarray(0, 32), sub(N, s)]) : sig;
  }

  /** The XDR preimage of the start_session authorization. */
  function preimage(networkId, account, notAfter, nonce, exp) {
    var fn = ascii('start_session');
    return concat([
      u32(9), networkId, nonce, u32(exp),
      u32(0),                                   // SOROBAN_AUTHORIZED_FUNCTION_TYPE_CONTRACT_FN
      u32(1), contractBytes(account),           // SC_ADDRESS_TYPE_CONTRACT
      u32(fn.length), fn, new Uint8Array((4 - (fn.length % 4)) % 4),
      u32(1), u32(5), u64(notAfter),            // args: [SCV_U64]
      u32(0),                                   // no sub-invocations
    ]);
  }

  /** The help QR text. cfg: { passphrase, account, ledger (latest), now (unix s) }; sign(payload) → Promise<64 bytes>. */
  function make(cfg, sign) {
    var notAfter = cfg.now + 300, exp = cfg.ledger + 120;
    var nonce = window.crypto.getRandomValues(new Uint8Array(8));
    return sha256(ascii(cfg.passphrase)).then(function (networkId) {
      return sha256(preimage(networkId, cfg.account, notAfter, nonce, exp));
    }).then(function (payload) { return sign(payload); }).then(function (sig) {
      var b = concat([new Uint8Array([2]), contractBytes(cfg.account), u64(notAfter), nonce, u32(exp), lowS(new Uint8Array(sig))]);
      return { qr: 'NILA:S:' + toB32(b), until: notAfter };
    });
  }

  window.NilaSession = { make: make, preimage: preimage, lowS: lowS };
})();
