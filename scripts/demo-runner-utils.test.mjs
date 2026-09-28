import test from 'node:test';
import assert from 'node:assert/strict';
import { keccak256, stringToHex } from 'viem';
import {
  demoStepNames,
  hasXGuardSwapBlockedReason,
  makeDemoResult,
  xguardSwapBlockedSelector,
} from './demo-runner-utils.mjs';

test('demoStepNames describes the expected judge demo flow', () => {
  assert.deepEqual(demoStepNames, ['faucet', 'approve', 'normalSwap', 'largeSwap', 'stressTest', 'blockedSwap']);
});

test('xguardSwapBlockedSelector matches the Solidity error signature', () => {
  const derived = keccak256(stringToHex('XGuardSwapBlocked(bytes32,uint256,uint256)')).slice(0, 10);
  assert.equal(xguardSwapBlockedSelector, derived);
  assert.equal(xguardSwapBlockedSelector, '0x224d9f7a');
});

test('hasXGuardSwapBlockedReason detects named and selector-based errors', () => {
  assert.equal(hasXGuardSwapBlockedReason(new Error('execution reverted: XGuardSwapBlocked')), true);
  assert.equal(hasXGuardSwapBlockedReason({ data: '0x000000224d9f7aabcdef' }), true);
  assert.equal(hasXGuardSwapBlockedReason({ nested: { reason: 'ordinary revert' } }), false);
});

test('hasXGuardSwapBlockedReason walks Error.cause, which Object.values cannot see', () => {
  const wrapped = new Error('failed to execute', {
    cause: new Error('execution reverted: XGuardSwapBlocked'),
  });
  assert.equal(Object.values(wrapped).includes(wrapped.cause), false, 'cause should be non-enumerable');
  assert.equal(hasXGuardSwapBlockedReason(wrapped), true);
  assert.equal(hasXGuardSwapBlockedReason(new Error('boom', { cause: new Error('ordinary revert') })), false);
});

test('makeDemoResult records account, deployment, steps, and generated timestamp', () => {
  const result = makeDemoResult({
    chainId: 196,
    account: '0x1111111111111111111111111111111111111111',
    deploymentPath: 'deployments/xlayer-mainnet.json',
    steps: [{ name: 'normalSwap', hash: '0xabc', status: 'success' }],
  });

  assert.equal(result.chainId, 196);
  assert.equal(result.account, '0x1111111111111111111111111111111111111111');
  assert.equal(result.deploymentPath, 'deployments/xlayer-mainnet.json');
  assert.deepEqual(result.steps, [{ name: 'normalSwap', hash: '0xabc', status: 'success' }]);
  assert.equal(typeof result.generatedAt, 'string');
});
