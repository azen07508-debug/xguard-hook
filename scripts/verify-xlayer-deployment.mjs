import fs from 'node:fs';
import path from 'node:path';
import { createPublicClient, defineChain, formatUnits, http } from 'viem';
import { hasRuntimeCode, isEnabled, readEnv, validateDeploymentShape, xLayerChainId } from './preflight-utils.mjs';
import { explorerAddressUrl, requiredCodeTargets, riskStateName } from './deployment-verifier-utils.mjs';

const root = process.cwd();
const deploymentPath = process.argv[2] ?? 'deployments/xlayer-mainnet.json';
const rpcUrl = readEnv(root, 'XLAYER_RPC_URL', 'https://rpc.xlayer.tech');
const allowInsecureTls = isEnabled(readEnv(root, 'XLAYER_ALLOW_INSECURE_TLS', '0'));

if (allowInsecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('WARN XLAYER_ALLOW_INSECURE_TLS=1 disables Node TLS certificate verification for this process.');
}

const xLayer = defineChain({
  id: xLayerChainId,
  name: 'X Layer',
  nativeCurrency: { decimals: 18, name: 'OKB', symbol: 'OKB' },
  rpcUrls: { default: { http: [rpcUrl] } },
});

const hookAbi = [
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
];

function readDeployment() {
  const resolved = path.join(root, deploymentPath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`${deploymentPath} not found. Run deployment first.`);
  }
  return JSON.parse(fs.readFileSync(resolved, 'utf8'));
}

function report(ok, label, detail) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`${mark} ${label}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  const deployment = readDeployment();
  const missing = validateDeploymentShape(deployment);
  if (missing.length > 0) throw new Error(`Invalid deployment JSON fields: ${missing.join(', ')}`);
  report(true, deploymentPath, 'valid shape');

  const client = createPublicClient({ chain: xLayer, transport: http() });
  const chainId = await client.getChainId();
  if (chainId !== xLayerChainId) throw new Error(`Unexpected chain id ${chainId}`);
  report(true, 'XLAYER_RPC_URL chain id', String(chainId));

  for (const target of requiredCodeTargets(deployment)) {
    const code = await client.getCode({ address: target.address });
    if (!hasRuntimeCode(code)) throw new Error(`${target.label} has no runtime code at ${target.address}`);
    report(true, `${target.label} bytecode`, target.address);
  }

  const [risk, referenceLiquidity] = await Promise.all([
    client.readContract({
      address: deployment.xguardHook,
      abi: hookAbi,
      functionName: 'getPoolRisk',
      args: [deployment.poolId],
    }),
    client.readContract({
      address: deployment.xguardHook,
      abi: hookAbi,
      functionName: 'getReferenceLiquidity',
      args: [deployment.poolId],
    }),
  ]);

  report(
    true,
    'Hook risk',
    `${riskStateName(risk[0])}, score ${risk[1].toString()}, fee ${risk[2].toString()}, last block ${risk[3].toString()}`,
  );
  report(true, 'Reference liquidity', formatUnits(referenceLiquidity, 18));

  console.log('Explorer links:');
  for (const target of requiredCodeTargets(deployment)) {
    console.log(`${target.label}: ${explorerAddressUrl(target.address)}`);
  }
}

main().catch((error) => {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
  const tlsHint =
    cause.includes('issuer certificate') || cause.includes('certificate')
      ? ' Set XLAYER_ALLOW_INSECURE_TLS=1 only if you accept this local RPC TLS workaround.'
      : '';
  console.error(`FAIL verify deployment: ${error instanceof Error ? error.message : String(error)}${cause}${tlsHint}`);
  process.exit(1);
});
