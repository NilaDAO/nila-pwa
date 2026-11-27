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
  // Plan 054 (26 Nov): the recovery SMS carries the link and a code.
  recoverHereWarn: 'Send the member a link and a code by SMS? Then scan the new phone\'s QR, or enter the code.',
  recoverHereNumber: "The member's number is not on record. Type it:",
  recoverHereScan: "Scan the new phone's QR",
  recoverHereWrong: 'Not the phone that opened the link.',
  // Registration, after R9 (26 Nov): her QR while her account has not joined the union yet; skipped once joined.
  joinStepNote: 'Show this QR to your union leader to join.',
  joinStepLater: 'Later',
};
