// Plan 054 (Join: one SMS for every member): every new text of Add a member and Join the union, in one place.
// TEXTS: for approval (Carst)
export const JOIN_TEXTS = {
  // Add a member and G2 Join the union: the button that sends the one SMS (link and code).
  send: 'Send SMS',
  // The progress screen (26 Nov, simplified): next to the time the SMS went; and once the member has joined.
  again: 'Send again',
  joined: 'Joined ✓',
  // Add a member, #sent: the first progress step.
  sent: 'SMS sent',
  // The join card after the SMS.
  title: 'Join the union',
  how: 'Smartphone: scan the QR. Other phone: enter the code.',
  scan: "Scan the member's QR",
  // 26 Nov: the code is behind a tappable line under the QR button; with it open, the info bar says what it means.
  scanQr: 'Scan QR code',
  noInternet: 'No phone with internet',
  cancel: 'Cancel',
  codeNote: 'With the code the member has no app. To use the app later: Recover on this phone (4 hours wait).',
  code: 'Code from the SMS',
  check: 'Check the code',
  // G2, a member whose title sits on a placeholder: the number the SMS goes to.
  number: "Member's phone number",
};
