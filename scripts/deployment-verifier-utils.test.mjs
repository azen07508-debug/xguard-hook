import test from 'node:test';
import assert from 'node:assert/strict';
import {
  explorerAddressUrl,
  explorerTxUrl,
  requiredCodeTargets,
  riskStateName,
} from './deployment-verifier-utils.mjs';

test('riskStateName maps known Hook states', () => {
  assert.equal(riskStateName(0), 'Normal');
  assert.equal(riskStateName(1), 'Warning');
  assert.equal(riskStateName(2), 'Protected');
  assert.equal(riskStateName(99), 'Unknown');
});

test('requiredCodeTargets includes deployed contracts, PoolManager, and StateView', () => {
  const targets = requiredCodeTargets({
    poolManager: '0x1111111111111111111111111111111111111111',
    stateView: '0x2222222222222222222222222222222222222222',
    hookDeployer: '0x3333333333333333333333333333333333333333',
    xguardHook: '0x4444444444444444444444444444444444444444',
    demoRouter: '0x5555555555555555555555555555555555555555',
    xgm: '0x6666666666666666666666666666666666666666',
    gUsd: '0x7777777777777777777777777777777777777777',
  });

  assert.deepEqual(targets.map((target) => target.label), [
    'PoolManager',
    'StateView',
    'HookDeployer',
    'XGuardHook',
    'DemoRouter',
    'XGM',
    'gUSD',
  ]);
});

test('explorer URL helpers produce OKLink X Layer URLs', () => {
  assert.equal(
    explorerAddressUrl('0x1111111111111111111111111111111111111111'),
    'https://www.oklink.com/xlayer/address/0x1111111111111111111111111111111111111111',
  );
  assert.equal(
    explorerTxUrl('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    'https://www.oklink.com/xlayer/tx/0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  );
});
