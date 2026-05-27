import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';
import {
  concatHex,
  createPublicClient,
  createWalletClient,
  defineChain,
  encodeAbiParameters,
  encodeDeployData,
  getAddress,
  http,
  keccak256,
  maxUint256,
  numberToHex,
  padHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { waitForSuccessfulReceiptRaw } from './tx-utils.mjs';

const root = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const poolManagerAddress = getAddress('0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32');
const stateViewAddress = getAddress('0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990');
const hookFlags = 0x80n | 0x40n;
const hookMask = (1n << 14n) - 1n;
const sqrtPriceOneToOne = 79_228_162_514_264_337_593_543_950_336n;
const dynamicFeeFlag = 0x800000;
const representativeHookDeployer = getAddress('0x000000000000000000000000000000000000dEaD');

function isEnabled(value) {
  return typeof value === 'string' && ['1', 'true', 'yes'].includes(value.toLowerCase());
}

const xLayer = defineChain({
  id: 196,
  name: 'X Layer',
  nativeCurrency: { decimals: 18, name: 'OKB', symbol: 'OKB' },
  rpcUrls: { default: { http: [readEnv('XLAYER_RPC_URL', 'https://rpc.xlayer.tech')] } },
});

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

const poolManagerAbi = [
  {
    type: 'function',
    name: 'initialize',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'key',
        type: 'tuple',
        components: poolKeyComponents(),
      },
      { name: 'sqrtPriceX96', type: 'uint160' },
    ],
    outputs: [{ name: 'tick', type: 'int24' }],
  },
];

function readEnv(name, fallback) {
  if (process.env[name]) return process.env[name];
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    const line = fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .find((entry) => entry.trim().startsWith(`${name}=`));
    if (line) return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
  }
  return fallback;
}

if (isEnabled(readEnv('XLAYER_ALLOW_INSECURE_TLS', '0'))) {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  console.warn('WARN XLAYER_ALLOW_INSECURE_TLS=1 disables Node TLS certificate verification for this process.');
}

function poolKeyComponents() {
  return [
    { name: 'currency0', type: 'address' },
    { name: 'currency1', type: 'address' },
    { name: 'fee', type: 'uint24' },
    { name: 'tickSpacing', type: 'int24' },
    { name: 'hooks', type: 'address' },
  ];
}

function compile() {
  const entries = [
    'src/XGuardHook.sol',
    'src/HookDeployer.sol',
    'src/DemoToken.sol',
    'src/XGuardDemoRouter.sol',
  ];
  const input = {
    language: 'Solidity',
    sources: Object.fromEntries(
      entries.map((file) => [file, { content: fs.readFileSync(path.join(root, file), 'utf8') }]),
    ),
    settings: {
      optimizer: { enabled: true, runs: 44444444 },
      viaIR: true,
      outputSelection: {
        '*': {
          '*': ['abi', 'evm.bytecode.object'],
        },
      },
    },
  };

  const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  const errors = (output.errors ?? []).filter((message) => message.severity === 'error');
  for (const message of output.errors ?? []) console.error(message.formattedMessage.trim());
  if (errors.length > 0) throw new Error('Solidity compile failed');

  return {
    hookDeployer: output.contracts['src/HookDeployer.sol'].HookDeployer,
    hook: output.contracts['src/XGuardHook.sol'].XGuardHook,
    token: output.contracts['src/DemoToken.sol'].DemoToken,
    router: output.contracts['src/XGuardDemoRouter.sol'].XGuardDemoRouter,
  };
}

function findImports(importPath) {
  const candidates = [
    path.join(root, importPath),
    path.join(root, 'node_modules', importPath),
    path.join(root, 'node_modules/forge-std/src', importPath.replace(/^forge-std\//, '')),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return { contents: fs.readFileSync(candidate, 'utf8') };
  }
  return { error: `File not found: ${importPath}` };
}

function computeCreate2Address(deployer, salt, initCode) {
  const digest = keccak256(concatHex(['0xff', deployer, salt, keccak256(initCode)]));
  return getAddress(`0x${digest.slice(-40)}`);
}

function mineHookAddress(hookDeployer, hookArtifact, constructorArgs) {
  const initCode = encodeDeployData({
    abi: hookArtifact.abi,
    bytecode: `0x${hookArtifact.evm.bytecode.object}`,
    args: constructorArgs,
  });

  for (let index = 0; index < 160_444; index += 1) {
    const salt = padHex(numberToHex(index), { size: 32 });
    const hookAddress = computeCreate2Address(hookDeployer, salt, initCode);
    if ((BigInt(hookAddress) & hookMask) === hookFlags) return { hookAddress, salt, initCode };
  }
  throw new Error('Unable to mine hook salt');
}

async function deployContract(walletClient, publicClient, artifact, args) {
  const hash = await walletClient.deployContract({
    abi: artifact.abi,
    bytecode: `0x${artifact.evm.bytecode.object}`,
    args,
  });
  const receipt = await waitForSuccessfulReceiptRaw(publicClient, hash);
  if (!receipt.contractAddress) throw new Error(`Deployment missing contract address: ${hash}`);
  return getAddress(receipt.contractAddress);
}

async function writeAndWait(walletClient, publicClient, request) {
  const hash = await walletClient.writeContract(request);
  await waitForSuccessfulReceiptRaw(publicClient, hash);
  return hash;
}

function poolIdFor(key) {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'tuple', components: poolKeyComponents() }],
      [key],
    ),
  );
}

function writeDeployment(deployment) {
  fs.mkdirSync(path.join(root, 'deployments'), { recursive: true });
  fs.mkdirSync(path.join(root, 'public/deployments'), { recursive: true });
  const body = `${JSON.stringify(deployment, null, 2)}\n`;
  fs.writeFileSync(path.join(root, 'deployments/xlayer-mainnet.json'), body);
  fs.writeFileSync(path.join(root, 'public/deployments/xlayer-mainnet.json'), body);
}

async function main() {
  const artifacts = compile();
  const privateKey = readEnv('PRIVATE_KEY');
  if (!privateKey && !dryRun) throw new Error('PRIVATE_KEY is required. Use .env or export it in the shell.');

  const account = privateKey
    ? privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`)
    : privateKeyToAccount('0x0000000000000000000000000000000000000000000000000000000000000001');
  const publicClient = createPublicClient({ chain: xLayer, transport: http() });
  const walletClient = createWalletClient({ account, chain: xLayer, transport: http() });

  const dryRunHookPlan = mineHookAddress(representativeHookDeployer, artifacts.hook, [poolManagerAddress, account.address]);
  if (dryRun) {
    console.log(`representative hook deployer: ${representativeHookDeployer}`);
    console.log(`representative hook address: ${dryRunHookPlan.hookAddress}`);
    console.log(`representative hook salt: ${dryRunHookPlan.salt}`);
    console.log('dry run complete');
    return;
  }

  const hookDeployer = await deployContract(walletClient, publicClient, artifacts.hookDeployer, []);
  const hookPlan = mineHookAddress(hookDeployer, artifacts.hook, [poolManagerAddress, account.address]);
  console.log(`hook deployer: ${hookDeployer}`);
  console.log(`hook address: ${hookPlan.hookAddress}`);
  console.log(`hook salt: ${hookPlan.salt}`);

  const xgm = await deployContract(walletClient, publicClient, artifacts.token, ['XGuard Meme', 'XGM', account.address]);
  const gUsd = await deployContract(walletClient, publicClient, artifacts.token, ['Guard USD', 'gUSD', account.address]);

  const existingHookCode = await publicClient.getCode({ address: hookPlan.hookAddress });
  if (!existingHookCode || existingHookCode === '0x') {
    const deployHookHash = await walletClient.writeContract({
      address: hookDeployer,
      abi: artifacts.hookDeployer.abi,
      functionName: 'deploy',
      args: [hookPlan.salt, hookPlan.initCode],
    });
    await waitForSuccessfulReceiptRaw(publicClient, deployHookHash);
  }

  const [currency0, currency1] = BigInt(xgm) < BigInt(gUsd) ? [xgm, gUsd] : [gUsd, xgm];
  const key = {
    currency0,
    currency1,
    fee: dynamicFeeFlag,
    tickSpacing: 60,
    hooks: hookPlan.hookAddress,
  };
  const poolId = poolIdFor(key);

  await writeAndWait(walletClient, publicClient, {
    address: hookPlan.hookAddress,
    abi: artifacts.hook.abi,
    functionName: 'registerPool',
    args: [key, 1_000_000n * 10n ** 18n],
  });
  await writeAndWait(walletClient, publicClient, {
    address: poolManagerAddress,
    abi: poolManagerAbi,
    functionName: 'initialize',
    args: [key, sqrtPriceOneToOne],
  });

  const router = await deployContract(walletClient, publicClient, artifacts.router, [
    poolManagerAddress,
    xgm,
    gUsd,
    key,
    account.address,
  ]);

  await writeAndWait(walletClient, publicClient, {
    address: xgm,
    abi: artifacts.token.abi,
    functionName: 'setMinter',
    args: [router],
  });
  await writeAndWait(walletClient, publicClient, {
    address: gUsd,
    abi: artifacts.token.abi,
    functionName: 'setMinter',
    args: [router],
  });
  await writeAndWait(walletClient, publicClient, {
    address: xgm,
    abi: artifacts.token.abi,
    functionName: 'mint',
    args: [account.address, 10_000_000n * 10n ** 18n],
  });
  await writeAndWait(walletClient, publicClient, {
    address: gUsd,
    abi: artifacts.token.abi,
    functionName: 'mint',
    args: [account.address, 10_000_000n * 10n ** 18n],
  });
  await writeAndWait(walletClient, publicClient, {
    address: xgm,
    abi: erc20Abi,
    functionName: 'approve',
    args: [router, maxUint256],
  });
  await writeAndWait(walletClient, publicClient, {
    address: gUsd,
    abi: erc20Abi,
    functionName: 'approve',
    args: [router, maxUint256],
  });
  await writeAndWait(walletClient, publicClient, {
    address: router,
    abi: artifacts.router.abi,
    functionName: 'addInitialLiquidity',
    args: [-887_220, 887_220, 2_000_000n * 10n ** 18n],
  });

  const deployment = {
    chainId: 196,
    poolManager: poolManagerAddress,
    stateView: stateViewAddress,
    hookDeployer,
    xguardHook: hookPlan.hookAddress,
    demoRouter: router,
    xgm,
    gUsd,
    poolId,
    currency0,
    currency1,
    deployedAt: Math.floor(Date.now() / 1000),
  };
  writeDeployment(deployment);
  console.log(JSON.stringify(deployment, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
