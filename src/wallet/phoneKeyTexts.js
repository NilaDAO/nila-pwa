// Plan 053: every new text of the phone-key member path, in one place.
// TEXTS: for approval (Carst)
export const PHONE_KEY_TEXTS = {
  noKey: 'No key made. Open Nila in Chrome.',
  // Settings, a phone-key member: assist mode for good (26 Nov), no switch.
  assistForGood: 'Your union leader helps you.',
  // Settings, a self-mode user (Privy) switching to "Union leader helps me" (26 Nov): one way only.
  toAssistTitle: 'Leader helps you, for good?',
  toAssistWarn: 'You cannot switch back.',
  toAssistOk: 'Switch',
  // Settings, a self-mode user whose account has not joined a union yet: the switch is off (plan 054 §4).
  joinFirst: 'Join your union first.',
  // Settings › Reset, a phone-key member (Reset now deletes the key on this phone, plan 054 §5).
  resetJoined: 'Remove your key? Your leader can recover your account.',
  resetNotJoined: 'Remove your key? Not joined yet: nobody can recover it.',
  // G2, the leader: a phone-key member's new phone (plan 054 §5).
  recoverHere: 'Recover on this phone',
  recoverHereWarn: 'Send the member a link by SMS? Then scan the new phone\'s QR.',
  recoverHereScan: "Scan the new phone's QR",
  recoverHereWrong: 'Not the phone that opened the link.',
};
