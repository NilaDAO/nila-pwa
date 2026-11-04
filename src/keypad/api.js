// The node's keypad members (oracle O17, nila-sensing docs/stellar/O17.md): L14 adds her and Nila texts her the app
// link; her progress for L14 #sent. Signed by the leader's Stellar wallet like /plan (SEP-53).
import { signedCall } from '../plan/api';

export function keypadClient(signer) {
  const call = signedCall(signer);
  return {
    // account (2 Nov): a smartphone member's existing account moving to a keypad phone.
    add: ({ name, phone, phoneType, unionName, leaderName, account }) => call('POST', '/keypad/members',
      { name, phone, phone_type: phoneType, union_name: unionName || '', leader_name: leaderName || '', ...(account ? { account } : {}) }),
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
  };
}
