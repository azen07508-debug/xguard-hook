import test from 'node:test';
import assert from 'node:assert/strict';
import {
  demoStepNames,
  hasXGuardSwapBlockedReason,
  makeDemoResult,
  xguardSwapBlockedSelector,
} from './demo-runner-utils.mjs';

test('demoStepNames describes the expected judge demo flow', () => {
  assert.deepEqual(demoStepNames, ['faucet', 'approve', 'normalSwap', 'largeSwap', 'stressTest', 'blockedSwap']);
});

test('hasXGuardSwapBlockedReason detects named and selector-based errors', () => {
  assert.equal(hasXGuardSwapBlockedReason(new Error('execution reverted: XGuardSwapBlocked')), true);
  assert.equal(hasXGuardSwapBlockedReason({ data: `0x000000${xguardSwapBlockedSelector.slice(2)}abcdef` }), true);
  assert.equal(hasXGuardSwapBlockedReason({ nested: { reason: 'ordinary revert' } }), false);
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
