import { useCallback, useRef } from "react";
import { runTx, RunTxOpts } from "../utils/runTx.ts";
import { useTxContext } from "../utils/NavigationContext"
import { Interface, isHexString } from "ethers";

// pull a hex revert blob from various provider shapes
function extractRevertData(e: any): string | null {
  const candidates = [
    e?.data?.data, e?.data, e?.error?.data, e?.error?.data?.data,
  ];
  for (const d of candidates) if (typeof d === "string" && d.startsWith("0x")) return d;

  // Some providers stick it in a JSON body
  if (typeof e?.error?.body === "string") {
    try {
      const body = JSON.parse(e.error.body);
      const d = body?.error?.data?.data ?? body?.error?.data;
      if (typeof d === "string" && d.startsWith("0x")) return d;
    } catch {}
  }
  return null;
}

// try multiple interfaces; don’t throw if none match
function tryParseError(data: string, ifaces: Interface[]): { name: string, args: any[] } | null {
  for (const iface of ifaces) {
    try {
      return iface.parseError(data);
    } catch {}
  }
  return null;
}

const erc20Err = new Interface([
  "error ERC20InsufficientBalance(address account, uint256 balance, uint256 needed)",
  "error ERC20InsufficientAllowance(address spender, uint256 allowance, uint256 needed)",
  "error ERC20InvalidSender(address sender)",
  "error ERC20InvalidReceiver(address receiver)",
  "error ERC20InvalidApprover(address approver)",
  "error ERC20InvalidSpender(address spender)",
  "error Error(string)",
  "error Panic(uint256)",
  // CORE ERRORS
  "error AddressEmptyCode(address target)",
  "error AmountZero()",
  "error BadArg()",
  "error BadKink()",
  "error BadMaturity()",
  "error BadShares()",
  "error BadState()",
  "error CapExceeded()",
  "error DateInFuture()",
  "error ERC1967InvalidImplementation(address implementation)",
  "error ERC1967NonPayable()",
  "error EnforcedPause()",
  "error ExpectedPause()",
  "error FailedCall()",
  "error InsufficientCash()",
  "error InterestNotSettled()",
  "error InvalidInitialization()",
  "error LoanClosed()",
  "error LoanExists()",
  "error LoanHasBeenAccepted()",
  "error LoanNotExist()",
  "error MaturityAlreadySet()",
  "error ModuleNotAuth()",
  "error NftForbidden()",
  "error NftRequired()",
  "error NoYield()",
  "error NotDefaulted()",
  "error NotEligibleMaturity()",
  "error NotExists()",
  "error NotInitializing()",
  "error NotOracleOrLeader()",
  "error NothingToClaim()",
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error RateBelowModel()",
  "error ReentrancyGuardReentrantCall()",
  "error ReserveStop()",
  "error SignatureInvalid()",
  "error UUPSUnauthorizedCallContext()",
  "error UUPSUnsupportedProxiableUUID(bytes32 slot)",
  "error VoucherAmountTooHigh()",
  "error BadNonce()",
  "error BadRatio()",
  "error MaxLoanAmount()",
  // ERC20Permit ERRORS (from NilaNINV2 — bubble up through drawLoanWithVoucher)
  "error ERC2612InvalidSigner(address signer, address owner)",
  "error ERC2612ExpiredSignature(uint256 deadline)",
  // VIEWER ERRORS
  "error AddressEmptyCode(address target)",
  "error ECDSAInvalidSignature()",
  "error ECDSAInvalidSignatureLength(uint256 length)",
  "error ECDSAInvalidSignatureS(bytes32 s)",
  "error ERC1967InvalidImplementation(address implementation)",
  "error ERC1967NonPayable()",
  "error FailedCall()",
  "error InvalidInitialization()",
  "error NotCore()",
  "error NotInitializing()",
  "error NotOracleOrLeader()",
  "error OwnableInvalidOwner(address owner)",
  "error OwnableUnauthorizedAccount(address account)",
  "error ReserveConfigSet()", // per your ABI (unusual name for an error, but included)
  "error UUPSUnauthorizedCallContext()",
  "error UUPSUnsupportedProxiableUUID(bytes32 slot)"
]);

const APPROVED_TO_PENDING_DELAY_MS = 8000;
const LONG_PENDING_DELAY_MS = 60000;
const VERY_LONG_PENDING_DELAY_MS = 120000;

function getPolygonscanBaseUrl(chainId?: number | bigint | null): string {
  const id = chainId == null ? null : Number(chainId);
  switch (id) {
    case 137:
      return "https://polygonscan.com";
    case 80002:
      return "https://amoy.polygonscan.com";
    case 80001:
      return "https://mumbai.polygonscan.com";
    default:
      return "https://polygonscan.com";
  }
}

function buildPolygonscanTxUrl(txHash?: string, chainId?: number | bigint | null): string | undefined {
  if (!txHash) return undefined;
  return `${getPolygonscanBaseUrl(chainId)}/tx/${txHash}`;
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes <= 0) return `${seconds}s`;
  return `${minutes}m ${String(seconds).padStart(2, "0")}s`;
}

export function useTx() {
  const {
    setStage,
    setTxMessage,
    setTxHash,
    setTxUrl,
    setTxSubmittedAt,
    txTimerRef,
  } = useTxContext();  // global spinner switch
  const pendingStageTimerRef = useRef(null);
  const longPendingTimerRef = useRef(null);
  const veryLongPendingTimerRef = useRef(null);
  const submittedAtRef = useRef(null);
  const lastTxHashRef = useRef();

  const clearPendingTimers = () => {
    if (pendingStageTimerRef.current) {
      clearTimeout(pendingStageTimerRef.current);
      pendingStageTimerRef.current = null;
    }
    if (longPendingTimerRef.current) {
      clearTimeout(longPendingTimerRef.current);
      longPendingTimerRef.current = null;
    }
    if (veryLongPendingTimerRef.current) {
      clearTimeout(veryLongPendingTimerRef.current);
      veryLongPendingTimerRef.current = null;
    }
  };

  return useCallback(
    (exec: Parameters<typeof runTx>[0], opts: RunTxOpts = {}) =>
      runTx(exec, {
        ...opts,
        onPending: () => {
          clearPendingTimers();
          submittedAtRef.current = null;
          lastTxHashRef.current = null;
          setTxHash(undefined);
          setTxUrl(undefined);
          setTxSubmittedAt(undefined);
          if (txTimerRef.current) {
            clearTimeout(txTimerRef.current);
            txTimerRef.current = null;
          }
          setStage("approval");
          setTxMessage("Confirming this transaction");
          opts.onPending?.();
        },
        onSubmitted: (tx) => {
          const txHash = tx?.hash;
          lastTxHashRef.current = txHash ?? null;
          const txUrl = buildPolygonscanTxUrl(txHash, tx?.chainId);
          const submittedAt = Date.now();
          submittedAtRef.current = submittedAt;
          setTxHash(txHash);
          setTxUrl(txUrl);
          setTxSubmittedAt(submittedAt);
          setStage("approved");
          setTxMessage("Approved. Transaction submitted to Polygon.");

          pendingStageTimerRef.current = setTimeout(() => {
            setStage("pending");
            setTxMessage("Pending confirmation. This can take a few minutes.");
          }, APPROVED_TO_PENDING_DELAY_MS);

          longPendingTimerRef.current = setTimeout(() => {
            setStage("pending");
            setTxMessage("Your request is still pending. Please check Polygonscan for the status.");
          }, LONG_PENDING_DELAY_MS);

          veryLongPendingTimerRef.current = setTimeout(() => {
            setStage("pending");
            setTxMessage("All good — still pending on Polygon. It can take 10-20 minutes during congestion.");
          }, VERY_LONG_PENDING_DELAY_MS);

          opts.onSubmitted?.(tx);
        },
        onSuccess: (r) => {
          clearPendingTimers();
          const elapsed = submittedAtRef.current
            ? ` Confirmed in ${formatElapsed(Date.now() - submittedAtRef.current)}.`
            : "";
          opts.onSuccess?.(r);
          setTxMessage(`Success. Transaction confirmed.${elapsed}`);
          console.log("RECEIPT", r);
          setStage("success");
          txTimerRef.current && clearTimeout(txTimerRef.current);
          txTimerRef.current = setTimeout(() => setStage(false), 10_000);
        },
        onError: (e: any) => {
          clearPendingTimers();
          // Special-cases first (user rejected, gas issues, etc.)
          if (e?.code === "ACTION_REJECTED") {
            setTxMessage("Transaction rejected by user.");
          } else if (e?.code === "INSUFFICIENT_FUNDS") {
            setTxMessage("Request gas subsidy from Nila.");
          } else if (e?.code === "UNPREDICTABLE_GAS_LIMIT") {
            setTxMessage("Unable to estimate gas. The transaction may fail or require a manual gas limit.");
          } else {
            const data = extractRevertData(e);
            let parsed: { name: string; args: any[] } | null = null;

            if (data && isHexString(data) && data.length >= 10) {
              parsed = tryParseError(data, [erc20Err]); // you can add more interfaces here
            }

            if (parsed?.name) {
              console.error("Parsed revert error:", parsed.name, parsed.args);
              setTxMessage(`Sorry, the transaction failed because of ${parsed.name}.`);
            } else if (e?.reason) {
              setTxMessage(`Sorry, the transaction failed: ${e.reason}`);
            } else if (e?.shortMessage) {
              setTxMessage(`Sorry, the transaction failed: ${e.shortMessage}`);
            } else if (e?.message) {
              setTxMessage(`Sorry, the transaction failed: ${e.message}`);
            } else {
              setTxMessage("Sorry, the transaction failed with an unknown error.");
            }
          }

          if (lastTxHashRef.current) {
            setTxMessage((prev : any) =>
              prev ? `${prev} Check Polygonscan for status.` : "Check Polygonscan for status."
            );
          }

          setStage("error");
          txTimerRef.current && clearTimeout(txTimerRef.current);
          txTimerRef.current = setTimeout(() => setStage(false), 10_000);
          opts.onError?.(e);
        },
      }),
    [setStage, setTxMessage, setTxHash, setTxUrl, setTxSubmittedAt, txTimerRef]
  );
}
