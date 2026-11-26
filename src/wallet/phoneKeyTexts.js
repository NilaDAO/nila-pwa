// Plan 053: every new text of the phone-key member path, in one place.
// TEXTS: for approval (Carst)
export const PHONE_KEY_TEXTS = {
  noKey: 'This phone could not make a key. Open Nila in Chrome and try again.',
  // Settings, a phone-key member: assist mode for good (26 Nov), no switch.
  assistForGood: 'Your union leader helps you. This cannot be changed.',
  // Settings, a self-mode user (Privy) switching to "Union leader helps me" (26 Nov): one way only.
  toAssistTitle: 'Let your union leader help you?',
  toAssistWarn: 'This cannot be undone. Your key moves to this phone and you cannot use Nila on your own again.',
  toAssistOk: 'Switch for good',
  // Settings, a self-mode user whose account has not joined a union yet: the switch is off (plan 054 §4).
  joinFirst: 'Join your union first.',
  // Settings › Reset, a phone-key member (Reset now deletes the key on this phone, plan 054 §5).
  resetJoined: 'Remove your key from this phone? Your assets stay in your account. Your union leader can recover the account on this phone.',
  resetNotJoined: 'Remove your key from this phone? Your account has not joined your union yet, so nobody can recover it.',
  // G2, the leader: a phone-key member's new phone (plan 054 §5).
  recoverHere: 'Recover on this phone',
  recoverHereWarn: "Send a link by SMS to the member's number on record? The member opens it on the new phone and shows the QR there. Scan it, and the account is recovered to that phone after the union's wait.",
  recoverHereScan: "Scan the new phone's QR",
  recoverHereWrong: 'This QR is not from the phone that opened the link.',
};
