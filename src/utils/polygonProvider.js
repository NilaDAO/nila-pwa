// The Polygon provider with a fixed network (SCF T2 row 26, 19 Nov). ethers' JsonRpcProvider without one checks the
// network before every call and retries that check for good while the RPC is unreachable, so no call ever fails and
// the app waited forever (the boot's Polygon reads in App.js). With the network fixed, an unreachable RPC fails the call.
// The chain follows App.js: an RPC on this machine is the demo's Hardhat fork (31337), else the app's chain.
import { ethers } from 'ethers';

export function polygonChainId(rpcUrl) {
  return /127\.0\.0\.1|localhost/.test(rpcUrl || '') ? 31337 : Number(process.env.REACT_APP_CHAIN_ID) || 137;
}

export function polygonProvider(rpcUrl) {
  const network = ethers.Network.from(polygonChainId(rpcUrl));
  return new ethers.JsonRpcProvider(rpcUrl, network, { staticNetwork: network });
}
