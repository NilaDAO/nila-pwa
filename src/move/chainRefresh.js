// A member moved by the operator (console Move tab: custom:chain = 148) while she is logged in on this phone: the app
// stores the chain at login only, so while it still says Polygon it reads Cognito once at each start. No polling.
import { chainFromCognito } from '../wallet/chainAttr';

/** 'stellar' when Cognito now keeps a Stellar chain for a wallet stored as Polygon ('137'); else null.
 *  read: async () => Cognito's UserAttributes ([{ Name, Value }]). */
export async function movedToStellar(stored, read) {
  if (stored !== '137') return null;
  const attrs = await read();
  const chain = chainFromCognito((attrs || []).find((a) => a.Name === 'custom:chain')?.Value);
  return chain === 'stellar' ? chain : null;
}
