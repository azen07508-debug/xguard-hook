import fs from 'node:fs';
import path from 'node:path';
import { getAddress, isAddress } from 'viem';

export const xLayerChainId = 196;
export const xLayerPoolManager = getAddress('0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32');
export const xLayerStateView = getAddress('0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990');

export function readDotEnv(root, name) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) return undefined;

  const line = fs
    .readFileSync(envPath, 'utf8')
    .split(/\r?\n/)
    .find((entry) => entry.trim().startsWith(`${name}=`));
  if (!line) return undefined;
  return line.slice(line.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '');
}

export function readEnv(root, name, fallback) {
  return process.env[name] ?? readDotEnv(root, name) ?? fallback;
}

export function isEnabled(value) {
  return typeof value === 'string' && ['1', 'true', 'yes'].includes(value.toLowerCase());
}

export function parseRpcChainId(value) {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new Error(`Invalid eth_chainId response: ${String(value)}`);
  }
  return Number(BigInt(value));
}

export function hasRuntimeCode(value) {
  return typeof value === 'string' && value !== '0x' && value.length > 2;
}

export function privateKeyStatus(privateKey) {
  if (!privateKey) return { ok: false, reason: 'missing' };
  const normalized = privateKey.startsWith('0x') ? privateKey.slice(2) : privateKey;
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) return { ok: false, reason: 'invalid format' };
  if (/^0+$/.test(normalized)) return { ok: false, reason: 'zero placeholder' };
  return { ok: true, reason: 'present' };
}

export function validateDeploymentShape(deployment) {
  const requiredAddresses = [
    'poolManager',
    'stateView',
    'xguardHook',
    'demoRouter',
    'xgm',
    'gUsd',
    'currency0',
    'currency1',
  ];
  const missing = [];
  for (const key of requiredAddresses) {
    if (!deployment[key] || !isAddress(deployment[key])) missing.push(key);
  }
  if (deployment.chainId !== xLayerChainId) missing.push('chainId');
  if (!deployment.poolId || typeof deployment.poolId !== 'string' || !deployment.poolId.startsWith('0x')) {
    missing.push('poolId');
  }
  return missing;
}
