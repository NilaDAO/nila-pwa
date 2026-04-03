import { useQuery } from '@tanstack/react-query';
import { ethers } from 'ethers';
import { useContract, useWallet } from './useWallet.ts';
import nilaFxPoolArtifact from '../components/ABI/NilaFxPool.json';
import nilaTokenArtifact from '../components/ABI/NilaToken.json';

const nilaFxPoolAbi = (nilaFxPoolArtifact as any).abi ?? nilaFxPoolArtifact;

export interface PermitSig {
  ninAmount: bigint;
  inrValue: bigint;
  feeBP: number;
  permitDeadline: bigint;
  v: number;
  r: string;
  s: string;
}

/** Sign an EIP-2612 permit for the FX pool to spend member's nIN. */
export async function signRedeemPermit(
  wallet: ethers.Wallet,
  ninAddress: string,
  fxPoolAddress: string,
  ninAmount: bigint,
  inrValue: bigint,
  feeBP: number,
  deadlineSeconds = 7 * 24 * 3600,
): Promise<PermitSig> {
  const nin = new ethers.Contract(ninAddress, (nilaTokenArtifact as any).abi ?? nilaTokenArtifact, wallet);
  const [name, version, chainId, nonce] = await Promise.all([
    nin.name(),
    nin.version().catch(() => '1'),
    wallet.provider!.getNetwork().then((n) => n.chainId),
    nin.nonces(wallet.address),
  ]);
  const deadline = BigInt(Math.floor(Date.now() / 1000) + deadlineSeconds);
  const domain = { name, version, chainId: Number(chainId), verifyingContract: ninAddress };
  const types = {
    Permit: [
      { name: 'owner',    type: 'address' },
      { name: 'spender',  type: 'address' },
      { name: 'value',    type: 'uint256' },
      { name: 'nonce',    type: 'uint256' },
      { name: 'deadline', type: 'uint256' },
    ],
  };
  const values = { owner: wallet.address, spender: fxPoolAddress, value: ninAmount, nonce, deadline };
  const sig = await wallet.signTypedData(domain, types, values);
  const { v, r, s } = ethers.Signature.from(sig);
  return { ninAmount, inrValue, feeBP, permitDeadline: deadline, v, r, s };
}

export function useRedeemOrder(orderId?: bigint) {
  const { wallet } = useWallet();
  const fxAddress  = process.env.REACT_APP_FX_POOL_MAIN;
  const fxPool     = useContract(fxAddress, nilaFxPoolAbi, wallet);

  return useQuery({
    queryKey: ['redeemOrder', orderId?.toString()],
    enabled: orderId !== undefined && !!fxPool,
    refetchInterval: 5_000,
    queryFn: async () => {
      const o = await fxPool!.redeemOrders(orderId!);
      return {
        union:      o.union      as string,
        farmer:     o.farmer     as string,
        inrValue:   o.inrValue   as bigint,
        usdtLocked: o.usdtLocked as bigint,
        deadline:   Number(o.deadline),
        feeBP:      Number(o.feeBP),
        lp:         o.lp         as string,
        status:     Number(o.status), // 0=Open, 1=LP Committed, 2=Confirmed, 3=Cancelled
      };
    },
  });
}
