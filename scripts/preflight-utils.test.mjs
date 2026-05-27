import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hasRuntimeCode,
  isEnabled,
  parseRpcChainId,
  privateKeyStatus,
  validateDeploymentShape,
  xLayerPoolManager,
  xLayerStateView,
} from './preflight-utils.mjs';

test('parseRpcChainId converts X Layer chain id from JSON-RPC hex', () => {
  assert.equal(parseRpcChainId('0xc4'), 196);
});

test('hasRuntimeCode rejects empty EVM code responses', () => {
  assert.equal(hasRuntimeCode('0x'), false);
  assert.equal(hasRuntimeCode(undefined), false);
  assert.equal(hasRuntimeCode('0x60016000'), true);
});

test('isEnabled accepts explicit truthy environment toggles only', () => {
  assert.equal(isEnabled('1'), true);
  assert.equal(isEnabled('true'), true);
  assert.equal(isEnabled('TRUE'), true);
  assert.equal(isEnabled('0'), false);
  assert.equal(isEnabled(undefined), false);
});

test('privateKeyStatus rejects missing and placeholder keys', () => {
  assert.deepEqual(privateKeyStatus(undefined), { ok: false, reason: 'missing' });
  assert.deepEqual(privateKeyStatus(`0x${'0'.repeat(64)}`), { ok: false, reason: 'zero placeholder' });
  assert.deepEqual(privateKeyStatus(`0x${'1'.repeat(64)}`), { ok: true, reason: 'present' });
});

test('validateDeploymentShape accepts a complete X Layer deployment shape', () => {
  const missing = validateDeploymentShape({
    chainId: 196,
    poolManager: xLayerPoolManager,
    stateView: xLayerStateView,
    xguardHook: '0x1111111111111111111111111111111111111111',
    demoRouter: '0x2222222222222222222222222222222222222222',
    xgm: '0x3333333333333333333333333333333333333333',
    gUsd: '0x4444444444444444444444444444444444444444',
    currency0: '0x3333333333333333333333333333333333333333',
    currency1: '0x4444444444444444444444444444444444444444',
    poolId: `0x${'a'.repeat(64)}`,
  });

  assert.deepEqual(missing, []);
});
