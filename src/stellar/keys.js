// Query keys for the Stellar hooks (design data/DataHooksRead.md: qk.stellar.*).
export const qk = {
  stellar: {
    config: () => ['stellar', 'config'],
    account: (a) => ['stellar', 'account', a],
    tx: (h) => ['stellar', 'tx', h],
  },
};
