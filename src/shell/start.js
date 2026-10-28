// Which app and which screen open at start (28 Oct): the one place that decides, as plain functions of what is known,
// so the rules can be tested without the app (nila-integrations tests/demo/start.test.mjs). StellarGate and Shell
// only read what they need and render the answer. No imports, no React: keep it that way (the test loads this file
// on its own).

/**
 * Which app opens (StellarGate). chain: the Init record's chain ('stellar', '137' or none); signer: whether the
 * signer is ready; leader: the Init union record says leader; mode: this start's choice ('old' | 'new' | null).
 * → 'app' (the Stellar app, Shell) | 'holding' (waits for the signer) | 'old' (today's Polygon app)
 *   | 'leaderStart' (a Polygon leader picks the app) | 'move' (a Polygon member moves to Stellar).
 */
export function appToOpen({ chain, signer, leader, mode }) {
  if (chain === 'stellar') return signer ? 'app' : 'holding';
  if (!signer || chain !== '137') return 'old';
  if (mode === 'old') return 'old';
  if (leader) return mode === 'new' ? 'app' : 'leaderStart';
  return 'move';
}

/**
 * Which screen opens inside the Stellar app (Shell).
 *  titles: { loading, count } of land titles (Polygon or Stellar); onboarded: the start steps (R9, R10) are done on
 *  this phone; demoNew: a demo number just made a new wallet; privyNew: Privy made the user at this login;
 *  tab / arg: from the hash (#/<tab>/<arg>); leader: the leader app.
 * → 'titleWait' (titles still loading) | 'start' (R9 union, R10 updates) | 'fields' (a member's R5–R8, full screen)
 *   | 'tab' (the app with its tab bar; a leader's own field points are a screen inside it).
 * Rule (LOAN_RULES "Start after the code and land titles", 28 Oct): after the code, R9 and R10 once, then the app.
 */
export function screenToOpen({ titles, onboarded, demoNew, privyNew, tab, arg, leader }) {
  if (titles.loading) return 'titleWait';
  if (!onboarded && (demoNew || (titles.count === 0 && privyNew === true))) return 'start';
  if (tab === 'crop' && arg === 'register' && !leader) return 'fields';
  return 'tab';
}

/** The tab when the hash names none: the Crop plan without a land title (it holds Mint a new land title), else Assets. */
export function firstTab({ titles }) {
  return !titles.loading && titles.count === 0 ? 'crop' : 'assets';
}
