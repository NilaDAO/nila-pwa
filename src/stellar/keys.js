// Query keys for the Stellar hooks (design data/DataHooksRead.md: qk.stellar.*). `config` is not in the
// design: the node's /stellar/config replaces Stellar build settings (oracle O1b).
export const qk = {
  stellar: {
    config: () => ['stellar', 'config'],
    account: (a) => ['stellar', 'account', a],
  },
};
