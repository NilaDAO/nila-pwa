// The move (M1): her nIN request to the node, and its status (oracle O10).
import { ethers } from 'ethers';

const API = process.env.REACT_APP_API_BASE_URL;

/** Must match nila-sensing stellar/move.py move_message. */
export const moveMessage = (network, stellar, polygon, amountWei, ts) =>
  `Nila: move my nIN to Stellar\nnetwork: ${network}\nstellar: ${stellar}\npolygon: ${polygon}\namount: ${amountWei}\nts: ${ts}`;

export async function requestMoveNin({ network, stellar, evmAddress, amountWei, signEvmMessage }) {
  const polygon = ethers.getAddress(evmAddress);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await signEvmMessage(moveMessage(network, stellar, polygon, amountWei.toString(), ts));
  const r = await fetch(`${API}/stellar/move/nin`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ polygon, stellar, amount_wei: amountWei.toString(), ts, sig }),
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.detail || `move request ${r.status}`);
  return body;
}

export async function getMoveStatus(evmAddress) {
  const r = await fetch(`${API}/stellar/move/${ethers.getAddress(evmAddress)}`);
  if (!r.ok) throw new Error(`move status ${r.status}`);
  return r.json();
}
