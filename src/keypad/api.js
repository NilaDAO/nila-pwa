// The node's keypad members (oracle O17, nila-sensing docs/stellar/O17.md): L14 adds her and Nila texts her the app
// link; her progress for L14 #sent. Signed by the leader's Stellar wallet like /plan (SEP-53).
import { signedCall } from '../plan/api';

export function keypadClient(signer) {
  const call = signedCall(signer);
  return {
    add: ({ name, phone, phoneType, unionName, leaderName }) => call('POST', '/keypad/members',
      { name, phone, phone_type: phoneType, union_name: unionName || '', leader_name: leaderName || '' }),
    sendAgain: (id) => call('POST', `/keypad/members/${id}/link`, {}),
    member: (id) => call('GET', `/keypad/members/${id}`),
  };
}
