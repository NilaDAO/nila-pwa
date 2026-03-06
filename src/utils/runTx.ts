
import { TransactionResponse, TransactionReceipt } from "ethers";

export interface RunTxOpts {
  /** called *before* the tx is sent – good to `setPending(true)` */
  onPending?: () => void;
  /** called after the tx is sent (hash is available) */
  onSubmitted?: (tx: TransactionResponse) => void;
  /** called after `tx.wait()` succeeds */
  onSuccess?: (receipt: TransactionReceipt | null) => void | Promise<void> | string;
  /** called if anything (send or wait) throws */
  onError?: (err: unknown) => void;
  /** always called at the very end */
  onSettled?: () => void;
}

/**
 * Wrap any async transaction call in a single helper so every component / hook
 * doesn’t duplicate the boiler‑plate.
 *
 * ```ts
 * await runTx(() => contract.transfer(addr, amount), {
 *   onPending: () => inc(),
 *   onSuccess: () => toast.success("Done"),
 *   onError: (e) => toast.error(parseEvmError(e)),
 *   onSettled: () => dec(),
 * });
 * ```
 */

export async function runTx(
    exec: () => Promise<TransactionResponse>,
    { onPending, onSubmitted, onSuccess, onError, onSettled }: RunTxOpts = {}
  ): Promise<TransactionReceipt | null | undefined> {
    try {
      onPending?.();
      const tx = await exec();
      onSubmitted?.(tx);
      const receipt = await tx.wait(); // `null` if tx dropped/replaced
      onSuccess?.(receipt);
      return receipt;
    } catch (err) {
      onError?.(err);
      console.error("runTx error", err);
    } finally {
      onSettled?.();
    }
  }
  
