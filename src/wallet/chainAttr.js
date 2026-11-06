// Cognito's custom:chain is a Number attribute (0..1000000) and its type cannot change, so 'stellar' cannot be stored
// there. A Stellar wallet is stored as 148 (Stellar's SLIP-44 coin number) and is 'stellar' everywhere in the app: read
// it through chainFromCognito. No imports: keep it that way (tests load this file on its own).
export const STELLAR_CHAIN_ATTR = '148';

/** The app's chain ('stellar', '137', ...) from the value in Cognito's custom:chain. */
export const chainFromCognito = (value) => (String(value) === STELLAR_CHAIN_ATTR ? 'stellar' : value);
