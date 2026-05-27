import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  maxUint256,
  parseUnits,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { hasXGuardSwapBlockedReason, makeDemoResult } from './demo-runner-utils.mjs';
import { isEnabled, readEnv, validateDeploymentShape, xLayerChainId } from './preflight-utils.mjs';
import { explorerTxUrl } from './deployment-verifier-utils.mjs';
import { waitForTransactionReceiptRaw } from './tx-utils.mjs';

const root = process.cwd();
const deploymentPath = process.argv[2] ?? 'deployments/xlayer-mainnet.json';
const resultPath = process.argv[3] ?? 'deployments/xlayer-demo-results.json';
const rpcUrl = readEnv(root, 'XLAYER_RPC_URL', 'https://rpc.xlayer.tech');
const privateKey = readEnv(root, 'PRIVATE_KEY');

if (isEnabled(readEnv(root, 'XLAYER_ALLOW_INSECURE_TLS', '0'))) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('WARN XLAYER_ALLOW_INSECURE_TLS=1 disables Node TLS certificate verification for this process.');
}

const xLayer = defineChain({
  id: xLayerChainId,
  name: 'X Layer',
  nativeCurrency: { decimals: 18, name: 'OKB', symbol: 'OKB' },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const demoRouterAbi = [
  { type: 'function', name: 'faucetClaimed', stateMutability: 'view', inputs: [{ name: 'user', type: 'address' }], outputs: [{ name: 'claimed', type: 'bool' }] },
  { type: 'function', name: 'faucet', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  { type: 'function', name: 'demoNormalSwap', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'amountOut', type: 'uint256' }] },
  { type: 'function', name: 'demoLargeSwap', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'amountOut', type: 'uint256' }] },
  { type: 'function', name: 'demoStressSwap', stateMutability: 'nonpayable', inputs: [], outputs: [{ name: 'totalAmountOut', type: 'uint256' }] },
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
];

const erc20Abi = [
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
];

function readDeployment() {
  const resolved = path.join(root, deploymentPath);
  if (!fs.existsSync(resolved)) throw new Error(`${deploymentPath} not found. Run deployment first.`);
  const deployment = JSON.parse(fs.readFileSync(resolved, 'utf8'));
  const missing = validateDeploymentShape(deployment);
  if (missing.length > 0) throw new Error(`Invalid deployment JSON fields: ${missing.join(', ')}`);
  return deployment;
}

function requirePrivateKey() {
  if (!privateKey) throw new Error('PRIVATE_KEY is required. Add it to .env without committing it.');
  return privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`;
}

async function writeAndRecord({ name, walletClient, publicClient, request, steps }) {
  const hash = await walletClient.writeContract(request);
  const receipt = await waitForTransactionReceiptRaw(publicClient, hash);
  const status = receipt.status === '0x1' ? 'success' : 'reverted';
  steps.push({ name, hash, status, explorer: explorerTxUrl(hash) });
  console.log(`${name}: ${status} ${hash}`);
  return receipt;
}

async function main() {
  const deployment = readDeployment();
  const account = privateKeyToAccount(requirePrivateKey());
  const publicClient = createPublicClient({ chain: xLayer, transport: http() });
  const walletClient = createWalletClient({ account, chain: xLayer, transport: http() });
  const chainId = await publicClient.getChainId();
  if (chainId !== xLayerChainId) throw new Error(`Unexpected chain id ${chainId}`);

  const steps = [];
  const faucetClaimed = await publicClient.readContract({
    address: deployment.demoRouter,
    abi: demoRouterAbi,
    functionName: 'faucetClaimed',
    args: [account.address],
  });

  if (faucetClaimed) {
    steps.push({ name: 'faucet', status: 'skipped', reason: 'already claimed' });
    console.log('faucet: skipped already claimed');
  } else {
    await writeAndRecord({
      name: 'faucet',
      walletClient,
      publicClient,
      steps,
      request: { address: deployment.demoRouter, abi: demoRouterAbi, functionName: 'faucet' },
    });
  }

  await writeAndRecord({
    name: 'approve',
    walletClient,
    publicClient,
    steps,
    request: {
      address: deployment.currency0,
      abi: erc20Abi,
      functionName: 'approve',
      args: [deployment.demoRouter, maxUint256],
    },
  });

  for (const [name, functionName] of [
    ['normalSwap', 'demoNormalSwap'],
    ['largeSwap', 'demoLargeSwap'],
    ['stressTest', 'demoStressSwap'],
  ]) {
    await writeAndRecord({
      name,
      walletClient,
      publicClient,
      steps,
      request: { address: deployment.demoRouter, abi: demoRouterAbi, functionName },
    });
  }

  try {
    await publicClient.simulateContract({
      account: account.address,
      address: deployment.demoRouter,
      abi: demoRouterAbi,
      functionName: 'swapExactInput',
      args: [true, parseUnits('90000', 18), 0n],
    });
    throw new Error('Blocked swap simulation unexpectedly succeeded');
  } catch (error) {
    if (!hasXGuardSwapBlockedReason(error)) throw error;
    steps.push({ name: 'blockedSwap', status: 'blocked', reason: 'XGuardSwapBlocked' });
    console.log('blockedSwap: blocked by XGuard custom error');
  }

  const result = makeDemoResult({ chainId, account: account.address, deploymentPath, steps });
  fs.mkdirSync(path.dirname(path.join(root, resultPath)), { recursive: true });
  fs.writeFileSync(path.join(root, resultPath), `${JSON.stringify(result, null, 2)}\n`);
  console.log(`wrote ${resultPath}`);
}

main().catch((error) => {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
  console.error(`FAIL run demo: ${error instanceof Error ? error.message : String(error)}${cause}`);
  process.exit(1);
});
