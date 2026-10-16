# P0 — Privy spike (Nov 7 release plan §4, PWA lane)

Question: can Privy be her only wallet on both chains?
1. Does Privy's **Stellar** wallet sign Soroban auth entries and the SEP-10 challenge? (design open item 43)
2. Does Privy's **EVM** wallet sign `mintForBatchMember` (N1)?
3. Bonus, open item 13: can her existing Polygon key be **imported** so the address stays the same (M1)?

Lives outside `src/`, so the CRA build and the live app are untouched.

## How Privy signs on Stellar

Stellar is a Privy "extended chain" (`chainType: 'stellar'`, ed25519). Privy offers one primitive:
`useSignRawHash` → a 64-byte signature over a 32-byte hash. `src/checks.js` runs every Stellar
check with only that primitive (`signHash(hash32)`):

| Check | What the 32-byte hash is | Proof of success |
|---|---|---|
| Soroban auth entry | `sha256(HashIdPreimage)` from `authorizeEntry`'s callback; a separate sponsor key is the tx source (fee-bump / sponsored model) | native XLM SAC `transfer` from her, **SUCCESS on testnet** |
| SEP-10 (local) | the challenge tx hash | `WebAuth.verifyChallengeTxSigners` accepts her signature |
| SEP-10 (SDF test anchor) | the challenge tx hash | `testanchor.stellar.org` issues a JWT |

## Results

### Part 1 — raw-hash proof, no Privy (`npm run proof`) — 16 Oct 2026: **3/3 PASS**

- Soroban auth entry: PASS, testnet tx `405ab3788803a7ffb8aeca27fdc7316108db92c385a87575ae12a6185ec1e1a4` (ledger 5223016)
- SEP-10 local: PASS
- SEP-10 SDF test anchor: PASS (JWT issued)

So **a raw-hash signer covers both Soroban auth entries and SEP-10**, not only envelopes.
What part 1 cannot show is that Privy itself returns that signature; part 2 does.

### Part 2 — the real Privy wallets (`npm run dev`) — pending

Needs a Privy app (dashboard.privy.io): SMS login on, `http://localhost:5173` in allowed origins,
and the app id in `.env.local` (`VITE_PRIVY_APP_ID=…`). Then log in with a test phone number and
press S0 → S1 → S2 → S3, E1 → E2, and E3 last (it adds a throwaway imported wallet to that test
user). Paste the log block into this README.

| # | Check | Result |
|---|---|---|
| S0 | Stellar wallet created (G… address) | |
| S1 | Soroban auth entry via `signRawHash`, testnet SUCCESS | |
| S2 | SEP-10 local | |
| S3 | SEP-10 SDF test anchor | |
| E1 | Polygon wallet made at login | |
| E2 | `mintForBatchMember` signed without a wallet pop-up (`showWalletUIs: false`), decoded, **not broadcast** | |
| E3 | Imported key keeps its address | |

Also to note during part 2: WhatsApp OTP (design R2) is a Privy dashboard switch (`whatsAppEnabled`),
not code; whether it is available on the plan.

## Run

```
npm install
npm run proof          # part 1, Stellar testnet, ~20 s
cp .env.example .env.local && npm run dev   # part 2
```

Pinned: `@privy-io/react-auth` 3.46.0, `@stellar/stellar-sdk` 17.2.0, `ethers` 6.13.2, `viem` 2.56.0, `vite` 8.3.1.
