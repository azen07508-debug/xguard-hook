export const okLinkXLayerBaseUrl = 'https://www.oklink.com/xlayer';

export function riskStateName(value) {
  return ['Normal', 'Warning', 'Protected'][Number(value)] ?? 'Unknown';
}

export function requiredCodeTargets(deployment) {
  return [
    ['PoolManager', deployment.poolManager],
    ['StateView', deployment.stateView],
    ['HookDeployer', deployment.hookDeployer],
    ['XGuardHook', deployment.xguardHook],
    ['DemoRouter', deployment.demoRouter],
    ['XGM', deployment.xgm],
    ['gUSD', deployment.gUsd],
  ]
    .filter(([, address]) => Boolean(address))
    .map(([label, address]) => ({ label, address }));
}

export function explorerAddressUrl(address) {
  return `${okLinkXLayerBaseUrl}/address/${address}`;
}

export function explorerTxUrl(hash) {
  return `${okLinkXLayerBaseUrl}/tx/${hash}`;
}
