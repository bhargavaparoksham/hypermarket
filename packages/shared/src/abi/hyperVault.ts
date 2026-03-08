export const hyperVaultAbi = [
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: []
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "user", type: "address" },
      { name: "pnl", type: "int256" }
    ],
    outputs: []
  },
  {
    type: "function",
    name: "settledBalance",
    stateMutability: "view",
    inputs: [{ name: "user", type: "address" }],
    outputs: [{ name: "", type: "uint256" }]
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { indexed: true, name: "user", type: "address" },
      { indexed: false, name: "pnl", type: "int256" },
      { indexed: false, name: "currentBalance", type: "uint256" },
      { indexed: false, name: "finalBalance", type: "uint256" }
    ],
    anonymous: false
  }
] as const;
