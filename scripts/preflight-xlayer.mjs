import fs from 'node:fs';
import path from 'node:path';
import {
  hasRuntimeCode,
  isEnabled,
  parseRpcChainId,
  privateKeyStatus,
  readEnv,
  validateDeploymentShape,
  xLayerChainId,
  xLayerPoolManager,
  xLayerStateView,
} from './preflight-utils.mjs';

const root = process.cwd();
const requirePrivateKey = process.argv.includes('--require-private-key');
const deploymentArgIndex = process.argv.indexOf('--deployment');
const deploymentPath =
  deploymentArgIndex >= 0 ? process.argv[deploymentArgIndex + 1] : 'deployments/xlayer-mainnet.json';
const rpcUrl = readEnv(root, 'XLAYER_RPC_URL', 'https://rpc.xlayer.tech');
const privateKey = readEnv(root, 'PRIVATE_KEY');
const allowInsecureTls = isEnabled(readEnv(root, 'XLAYER_ALLOW_INSECURE_TLS', '0'));

if (allowInsecureTls) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('WARN XLAYER_ALLOW_INSECURE_TLS=1 disables Node TLS certificate verification for this process.');
}

async function rpc(method, params = []) {
  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} HTTP ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method} RPC error: ${body.error.message ?? JSON.stringify(body.error)}`);
  return body.result;
}

function report(ok, label, detail) {
  const mark = ok ? 'OK' : 'FAIL';
  console.log(`${mark} ${label}${detail ? `: ${detail}` : ''}`);
}

async function main() {
  let failed = false;

  const keyStatus = privateKeyStatus(privateKey);
  const privateKeyOk = keyStatus.ok || !requirePrivateKey;
  failed ||= !privateKeyOk;
  report(privateKeyOk, 'PRIVATE_KEY', keyStatus.ok ? 'present' : keyStatus.reason);

  const chainId = parseRpcChainId(await rpc('eth_chainId'));
  const chainOk = chainId === xLayerChainId;
  failed ||= !chainOk;
  report(chainOk, 'XLAYER_RPC_URL chain id', `${chainId}`);

  const poolManagerCode = await rpc('eth_getCode', [xLayerPoolManager, 'latest']);
  const poolManagerOk = hasRuntimeCode(poolManagerCode);
  failed ||= !poolManagerOk;
  report(poolManagerOk, 'Uniswap v4 PoolManager code', xLayerPoolManager);

  const stateViewCode = await rpc('eth_getCode', [xLayerStateView, 'latest']);
  const stateViewOk = hasRuntimeCode(stateViewCode);
  failed ||= !stateViewOk;
  report(stateViewOk, 'Uniswap v4 StateView code', xLayerStateView);

  const resolvedDeploymentPath = path.join(root, deploymentPath);
  if (fs.existsSync(resolvedDeploymentPath)) {
    const deployment = JSON.parse(fs.readFileSync(resolvedDeploymentPath, 'utf8'));
    const missing = validateDeploymentShape(deployment);
    const shapeOk = missing.length === 0;
    failed ||= !shapeOk;
    report(shapeOk, deploymentPath, shapeOk ? 'valid shape' : `invalid fields ${missing.join(', ')}`);
  } else {
    report(true, deploymentPath, 'not present yet; expected before first deployment');
  }

  if (failed) process.exit(1);
}

main().catch((error) => {
  const cause = error instanceof Error && error.cause instanceof Error ? ` (${error.cause.message})` : '';
  const tlsHint =
    cause.includes('issuer certificate') || cause.includes('certificate')
      ? ' Set XLAYER_ALLOW_INSECURE_TLS=1 only if you accept this local RPC TLS workaround.'
      : '';
  console.error(`FAIL preflight: ${error instanceof Error ? error.message : String(error)}${cause}${tlsHint}`);
  process.exit(1);
});
