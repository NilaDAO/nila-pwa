// The node's keypad members (oracle O17, nila-sensing docs/stellar/O17.md): L14 adds her and Nila texts her the app
// link; her progress for L14 #sent. Signed by the leader's Stellar wallet like /plan (SEP-53).
import { signedCall } from '../plan/api';

export function keypadClient(signer) {
  const call = signedCall(signer);
  return {
    // account (2 Nov): a smartphone member's existing account moving to a keypad phone.
    // Plan 054: no phoneType (the node's default: the one SMS with link and code); placeholder: Join the union on G2 for
    // a member whose title sits on a placeholder.
    add: ({ name, phone, phoneType, unionName, leaderName, account, placeholder }) => call('POST', '/keypad/members',
      { name, phone, ...(phoneType ? { phone_type: phoneType } : {}), union_name: unionName || '', leader_name: leaderName || '',
        ...(account ? { account } : {}), ...(placeholder ? { placeholder } : {}) }),
    // phone (4 Nov, G2 Recover on another number): the link goes to a new number (409: another member's number).
    sendAgain: (id, phone) => call('POST', `/keypad/members/${id}/link`, phone ? { phone } : {}),
    // 4 Nov: a smartphone member's account recovered to a new number; returns the member row (its id for /recover).
    recoverTo: ({ account, phone, name, unionName, leaderName }) => call('POST', '/keypad/recoveries',
      { account, phone, name: name || '', union_name: unionName || '', leader_name: leaderName || '' }),
    member: (id) => call('GET', `/keypad/members/${id}`),
    list: () => call('GET', '/keypad/members'),
    // 26 Oct: the leader's phone takes the keypad member's field points; they start the member's border job.
    // 2 Nov: a lost phone. The node returns the leader's payload hash for recover_by_sms; the leader signs it.
    recoverAsk: (id) => call('POST', `/keypad/members/${id}/recover`, {}),
    recoverSign: (id, signature) => call('POST', `/keypad/members/${id}/recover/sign`, { signature }),
    points: (id, points) => call('POST', `/keypad/members/${id}/points`, { points }),
    // Leader OTP (24 Nov): a code to her number on record opens the help QR's session (start_session_by_sms).
    // SMS-only members (25 Nov): the number check's code, its resend, and the account the leader's app made.
    smsConfirm: (id, code) => call('POST', `/keypad/members/${id}/sms/confirm`, { code }),
    smsResend: (id, leaderName) => call('POST', `/keypad/members/${id}/sms/resend`, { leader_name: leaderName || '' }),
    smsAccount: (id, account) => call('POST', `/keypad/members/${id}/sms/account`, { account }),
    otpTarget: (id) => call('GET', `/keypad/members/${id}/otp`),
    // A smartphone member's own login number (24 Nov): the member's Cognito access token, this request signed by the member.
    myNumber: (accessToken) => call('POST', '/keypad/my-number', { access_token: accessToken }),
    otpSend: (id, leaderName) => call('POST', `/keypad/members/${id}/otp`, { leader_name: leaderName || '' }),
    otpCheck: (id, code) => call('POST', `/keypad/members/${id}/otp/check`, { code }),
    otpSign: (id, signature) => call('POST', `/keypad/members/${id}/otp/sign`, { signature }),
    // 13 Nov: G2's bin for a member without a land title: deleted for good (409 while she holds one).
    remove: (id) => call('DELETE', `/keypad/members/${id}`),
  };
}
