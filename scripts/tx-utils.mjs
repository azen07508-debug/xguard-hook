export async function waitForTransactionReceiptRaw(client, hash, { intervalMs = 2_000, timeoutMs = 180_000 } = {}) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const receipt = await client.request({
      method: 'eth_getTransactionReceipt',
      params: [hash],
    });
    if (receipt) return receipt;
    if (intervalMs > 0) await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`Timed out waiting for transaction receipt: ${hash}`);
}

export async function waitForSuccessfulReceiptRaw(client, hash, options) {
  const receipt = await waitForTransactionReceiptRaw(client, hash, options);
  if (receipt.status !== '0x1') throw new Error(`Transaction reverted: ${hash}`);
  return receipt;
}
