export const demoRouterAbi = [
  {
    type: 'function',
    name: 'faucet',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [],
  },
  {
    type: 'function',
    name: 'swapExactInput',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'demoNormalSwap',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'demoLargeSwap',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'demoStressSwap',
    stateMutability: 'nonpayable',
    inputs: [],
    outputs: [{ name: 'totalAmountOut', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'faucetClaimed',
    stateMutability: 'view',
    inputs: [{ name: 'user', type: 'address' }],
    outputs: [{ name: 'claimed', type: 'bool' }],
  },
  {
    type: 'event',
    name: 'FaucetClaimed',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'amountA', type: 'uint256' },
      { indexed: false, name: 'amountB', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'DemoSwap',
    inputs: [
      { indexed: true, name: 'user', type: 'address' },
      { indexed: false, name: 'zeroForOne', type: 'bool' },
      { indexed: false, name: 'amountIn', type: 'uint256' },
      { indexed: false, name: 'amountOut', type: 'uint256' },
    ],
  },
] as const;

export const xguardHookAbi = [
  {
    type: 'function',
    name: 'getPoolRisk',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [
      { name: 'state', type: 'uint8' },
      { name: 'score', type: 'uint256' },
      { name: 'currentFee', type: 'uint24' },
      { name: 'lastUpdatedBlock', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getReferenceLiquidity',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'referenceLiquidity', type: 'uint128' }],
  },
  {
    type: 'function',
    name: 'previewRisk',
    stateMutability: 'view',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'zeroForOne', type: 'bool' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [
      { name: 'predictedScore', type: 'uint256' },
      { name: 'predictedFee', type: 'uint24' },
      { name: 'willBlock', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'getRiskLabel',
    stateMutability: 'view',
    inputs: [{ name: 'poolId', type: 'bytes32' }],
    outputs: [{ name: 'label', type: 'string' }],
  },
  {
    type: 'error',
    name: 'XGuardSwapBlocked',
    inputs: [
      { name: 'poolId', type: 'bytes32' },
      { name: 'riskScore', type: 'uint256' },
      { name: 'amountIn', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'RiskUpdated',
    inputs: [
      { indexed: true, name: 'poolId', type: 'bytes32' },
      { indexed: false, name: 'state', type: 'uint8' },
      { indexed: false, name: 'score', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'FeeAdjusted',
    inputs: [
      { indexed: true, name: 'poolId', type: 'bytes32' },
      { indexed: false, name: 'oldFee', type: 'uint24' },
      { indexed: false, name: 'newFee', type: 'uint24' },
      { indexed: false, name: 'score', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'LargeSwapDetected',
    inputs: [
      { indexed: true, name: 'poolId', type: 'bytes32' },
      { indexed: true, name: 'sender', type: 'address' },
      { indexed: false, name: 'amount', type: 'uint256' },
      { indexed: false, name: 'impactBps', type: 'uint256' },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'amount', type: 'uint256' }],
  },
] as const;
