import test from 'node:test';
import assert from 'node:assert/strict';
import { waitForTransactionReceiptRaw } from './tx-utils.mjs';

test('waitForTransactionReceiptRaw polls eth_getTransactionReceipt without fetching blocks', async () => {
  const calls = [];
  const client = {
    async request({ method, params }) {
      calls.push({ method, params });
      return calls.length === 1 ? null : { transactionHash: params[0], status: '0x1', contractAddress: null };
    },
  };

  const receipt = await waitForTransactionReceiptRaw(client, '0xabc', { intervalMs: 0, timeoutMs: 100 });

  assert.equal(receipt.transactionHash, '0xabc');
  assert.deepEqual(calls.map((call) => call.method), ['eth_getTransactionReceipt', 'eth_getTransactionReceipt']);
});

test('waitForTransactionReceiptRaw times out with a clear hash-specific error', async () => {
  const client = {
    async request() {
      return null;
    },
  };

  await assert.rejects(
    () => waitForTransactionReceiptRaw(client, '0xdef', { intervalMs: 0, timeoutMs: 1 }),
    /Timed out waiting for transaction receipt: 0xdef/,
  );
});
