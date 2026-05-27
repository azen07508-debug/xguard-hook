export const xguardSwapBlockedSelector = '0x224d9f7a';

export const demoStepNames = ['faucet', 'approve', 'normalSwap', 'largeSwap', 'stressTest', 'blockedSwap'];

export function hasXGuardSwapBlockedReason(value, seen = new Set()) {
  if (typeof value === 'string') {
    const lower = value.toLowerCase();
    return lower.includes('xguardswapblocked') || lower.includes(xguardSwapBlockedSelector.slice(2));
  }
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (value instanceof Error && hasXGuardSwapBlockedReason(value.message, seen)) return true;
  return Object.values(value).some((entry) => hasXGuardSwapBlockedReason(entry, seen));
}

export function makeDemoResult({ chainId, account, deploymentPath, steps }) {
  return {
    chainId,
    account,
    deploymentPath,
    generatedAt: new Date().toISOString(),
    steps,
  };
}
