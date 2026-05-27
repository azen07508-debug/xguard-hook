import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownUp,
  BadgeCheck,
  Gauge,
  RadioTower,
  Shield,
  Wallet,
  Zap,
} from 'lucide-react';
import type { Address, Hex } from 'viem';
import { formatUnits, maxUint256, parseUnits } from 'viem';
import {
  useAccount,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from 'wagmi';
import { demoRouterAbi, erc20Abi, xguardHookAbi } from './abi';
import { xLayer } from './config';

type Deployment = {
  chainId: number;
  poolManager: Address;
  stateView: Address;
  hookDeployer?: Address;
  xguardHook: Address;
  demoRouter: Address;
  xgm: Address;
  gUsd: Address;
  poolId: Hex;
  currency0: Address;
  currency1: Address;
  deployedAt: number;
};

type EventItem = {
  id: string;
  title: string;
  detail: string;
  tone: 'normal' | 'warning' | 'protected';
};

const riskLabels = ['Normal', 'Warning', 'Protected'];
const riskTones = ['normal', 'warning', 'protected'] as const;
const xguardSwapBlockedSelector = '224d9f7a';

function shortAddress(value?: string) {
  if (!value) return '0x0000...0000';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function feeToPercent(fee?: number) {
  if (fee === undefined) return '0.00%';
  return `${(fee / 10_000).toFixed(2)}%`;
}

async function loadDeployment() {
  const path = import.meta.env.VITE_DEPLOYMENT_URL ?? '/deployments/xlayer-mainnet.json';
  let response = await fetch(path);
  if (!response.ok && !import.meta.env.VITE_DEPLOYMENT_URL) {
    response = await fetch('/deployments/xlayer-mainnet.example.json');
  }
  if (!response.ok) throw new Error(`Failed to load ${path}`);
  return (await response.json()) as Deployment;
}

export function App() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [txStatus, setTxStatus] = useState<string>('Ready');
  const publicClient = usePublicClient({ chainId: xLayer.id });
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connect, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();

  const isReadyDeployment = deployment && deployment.xguardHook !== '0x0000000000000000000000000000000000000000';
  const onWrongChain = isConnected && chainId !== xLayer.id;

  useEffect(() => {
    loadDeployment()
      .then(setDeployment)
      .catch((error) => setLoadError(error instanceof Error ? error.message : 'Failed to load deployment'));
  }, []);

  const { data: poolRisk, refetch: refetchRisk } = useReadContract({
    address: deployment?.xguardHook,
    abi: xguardHookAbi,
    functionName: 'getPoolRisk',
    args: deployment ? [deployment.poolId] : undefined,
    query: { enabled: Boolean(isReadyDeployment) },
  });

  const { data: referenceLiquidity } = useReadContract({
    address: deployment?.xguardHook,
    abi: xguardHookAbi,
    functionName: 'getReferenceLiquidity',
    args: deployment ? [deployment.poolId] : undefined,
    query: { enabled: Boolean(isReadyDeployment) },
  });

  const { data: largeSwapPreview, refetch: refetchLargePreview } = useReadContract({
    address: deployment?.xguardHook,
    abi: xguardHookAbi,
    functionName: 'previewRisk',
    args: deployment ? [deployment.poolId, true, parseUnits('60000', 18)] : undefined,
    query: { enabled: Boolean(isReadyDeployment) },
  });

  const { data: xgmBalance, refetch: refetchXgm } = useReadContract({
    address: deployment?.xgm,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(isReadyDeployment && address) },
  });

  const { data: gusdBalance, refetch: refetchGusd } = useReadContract({
    address: deployment?.gUsd,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(isReadyDeployment && address) },
  });

  const { data: allowance, refetch: refetchAllowance } = useReadContract({
    address: deployment?.currency0,
    abi: erc20Abi,
    functionName: 'allowance',
    args: address && deployment ? [address, deployment.demoRouter] : undefined,
    query: { enabled: Boolean(isReadyDeployment && address) },
  });

  useEffect(() => {
    if (!publicClient || !deployment || !isReadyDeployment) return undefined;
    return publicClient.watchContractEvent({
      address: deployment.xguardHook,
      abi: xguardHookAbi,
      onLogs: (logs) => {
        setEvents((current) => {
          const next = logs.map((log) => {
            const eventName = log.eventName ?? 'HookEvent';
            const args = log.args as Record<string, unknown>;
            const tone =
              args.state === 2
                ? 'protected'
                : eventName === 'LargeSwapDetected' || eventName === 'FeeAdjusted' || args.state === 1
                  ? 'warning'
                  : 'normal';
            return {
              id: `${log.transactionHash}-${log.logIndex}`,
              title: eventName,
              detail: Object.entries(args)
                .filter(([, value]) => value !== undefined)
                .map(([key, value]) => `${key}: ${String(value)}`)
                .join(' · '),
              tone,
            } satisfies EventItem;
          });
          return [...next, ...current].slice(0, 8);
        });
      },
    });
  }, [deployment, isReadyDeployment, publicClient]);

  const risk = useMemo(() => {
    const stateIndex = Number(poolRisk?.[0] ?? 0);
    const score = Number(poolRisk?.[1] ?? 0);
    const fee = Number(poolRisk?.[2] ?? 3_000);
    return {
      stateIndex,
      label: riskLabels[stateIndex] ?? 'Normal',
      tone: riskTones[stateIndex] ?? 'normal',
      score,
      fee,
      lastUpdatedBlock: poolRisk?.[3]?.toString() ?? '-',
    };
  }, [poolRisk]);

  async function refreshReads() {
    await Promise.all([refetchRisk(), refetchXgm(), refetchGusd(), refetchAllowance(), refetchLargePreview()]);
  }

  async function requireReady() {
    if (!deployment || !address) throw new Error('Connect wallet and load deployment first');
    if (chainId !== xLayer.id) {
      switchChain({ chainId: xLayer.id });
      throw new Error('Switch to X Layer and retry');
    }
    return deployment;
  }

  async function claimFaucet() {
    const loaded = await requireReady();
    try {
      setTxStatus('Claiming demo tokens...');
      const hash = await writeContractAsync({
        address: loaded.demoRouter,
        abi: demoRouterAbi,
        functionName: 'faucet',
      });
      await waitForTransaction(hash);
      setTxStatus('Faucet confirmed');
      pushLocalEvent('Faucet', 'Claimed 500,000 XGM and 500,000 gUSD', 'normal');
      await refreshReads();
    } catch (error) {
      reportTransactionError('Faucet failed', error);
    }
  }

  async function approveRouter() {
    const loaded = await requireReady();
    try {
      setTxStatus('Approving router...');
      const hash = await writeContractAsync({
        address: loaded.currency0,
        abi: erc20Abi,
        functionName: 'approve',
        args: [loaded.demoRouter, maxUint256],
      });
      await waitForTransaction(hash);
      setTxStatus('Approval confirmed');
      pushLocalEvent('Approval', `Approved ${shortAddress(loaded.demoRouter)} for currency0`, 'normal');
      await refetchAllowance();
    } catch (error) {
      reportTransactionError('Approval failed', error);
    }
  }

  async function swap(amount: bigint, repeat = 1, label = 'Swap') {
    const loaded = await requireReady();
    try {
      for (let index = 0; index < repeat; index += 1) {
        setTxStatus(`${label} ${index + 1}/${repeat}...`);
        const hash = await writeContractAsync({
          address: loaded.demoRouter,
          abi: demoRouterAbi,
          functionName: 'swapExactInput',
          args: [true, amount, 0n],
        });
        await waitForTransaction(hash);
      }
      setTxStatus(`${label} confirmed`);
      pushLocalEvent(label, `${repeat} swap transaction(s) confirmed`, repeat > 1 ? 'warning' : 'normal');
      await refreshReads();
    } catch (error) {
      reportTransactionError(`${label} blocked or failed`, error);
    }
  }

  async function demoSwap(functionName: 'demoNormalSwap' | 'demoLargeSwap' | 'demoStressSwap', label: string) {
    const loaded = await requireReady();
    try {
      setTxStatus(`${label}...`);
      const hash = await writeContractAsync({
        address: loaded.demoRouter,
        abi: demoRouterAbi,
        functionName,
      });
      await waitForTransaction(hash);
      setTxStatus(`${label} confirmed`);
      pushLocalEvent(label, 'Demo router transaction confirmed', functionName === 'demoNormalSwap' ? 'normal' : 'warning');
      await refreshReads();
    } catch (error) {
      reportTransactionError(`${label} blocked or failed`, error);
    }
  }

  function pushLocalEvent(title: string, detail: string, tone: EventItem['tone']) {
    setEvents((current) => [
      { id: `${Date.now()}-${title}`, title, detail, tone },
      ...current,
    ].slice(0, 8));
  }

  async function waitForTransaction(hash: Hex) {
    if (!publicClient) return;
    await publicClient.waitForTransactionReceipt({ hash });
  }

  function reportTransactionError(title: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    setTxStatus(title);
    const isBlocked = hasXGuardSwapBlockedReason(error);
    const detail = isBlocked ? 'Blocked by XGuard: amount exceeds hard threshold.' : message.slice(0, 240);
    pushLocalEvent(title, detail, 'protected');
  }

  function hasXGuardSwapBlockedReason(value: unknown, seen = new Set<object>()): boolean {
    if (typeof value === 'string') {
      const lower = value.toLowerCase();
      return lower.includes('xguardswapblocked') || lower.includes(xguardSwapBlockedSelector);
    }
    if (!value || typeof value !== 'object') return false;
    if (seen.has(value)) return false;
    seen.add(value);
    if (value instanceof Error && hasXGuardSwapBlockedReason(value.message, seen)) return true;
    return Object.values(value).some((entry) => hasXGuardSwapBlockedReason(entry, seen));
  }

  const blockedAmount = parseUnits('90000', 18);

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Risk-Aware Liquidity Infrastructure for X Layer</p>
          <h1>XGuard Hook</h1>
          <p className="subtitle">新资产池的动态保护层：低风险低费，高风险交易为 LP 支付更高风险补偿。</p>
        </div>
        <div className="wallet-box">
          {isConnected ? (
            <>
              <span>{shortAddress(address)}</span>
              <button type="button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => connect({ connector: connectors[0] })}
              disabled={isConnecting || connectors.length === 0}
            >
              <Wallet size={18} />
              Connect
            </button>
          )}
        </div>
      </section>

      {onWrongChain && (
        <section className="notice protected">
          <AlertTriangle size={18} />
          <span>当前钱包不在 X Layer。切换到 X Layer 主网后再触发 Hook Demo。</span>
          <button type="button" onClick={() => switchChain({ chainId: xLayer.id })}>
            Switch
          </button>
        </section>
      )}

      {loadError && <section className="notice protected">{loadError}</section>}

      <section className="dashboard">
        <div className={`risk-panel ${risk.tone}`}>
          <div className="risk-heading">
            <Shield size={26} />
            <div>
              <span>Pool Status</span>
              <strong>{risk.label}</strong>
            </div>
          </div>
          <div className="gauge">
            <div className="gauge-fill" style={{ width: `${Math.min(risk.score, 120)}%` }} />
          </div>
          <div className="metrics">
            <div>
              <span>Risk Score</span>
              <strong>{risk.score}</strong>
            </div>
            <div>
              <span>Dynamic Fee</span>
              <strong>{feeToPercent(risk.fee)}</strong>
            </div>
            <div>
              <span>Reference Liquidity</span>
              <strong>{referenceLiquidity ? formatUnits(referenceLiquidity, 18) : '-'}</strong>
            </div>
          </div>
        </div>

        <div className="actions-panel">
          <div className="panel-title">
            <Zap size={22} />
            <h2>Demo Actions</h2>
          </div>
          <div className="balance-row">
            <span>XGM {xgmBalance ? formatUnits(xgmBalance, 18) : '0'}</span>
            <span>gUSD {gusdBalance ? formatUnits(gusdBalance, 18) : '0'}</span>
          </div>
          <div className="tx-status">{txStatus}</div>
          <p className="hint">
            Large swap preview: fee {feeToPercent(Number(largeSwapPreview?.[1] ?? 3_000))}, score{' '}
            {largeSwapPreview?.[0]?.toString() ?? '-'}, {largeSwapPreview?.[2] ? 'will block' : 'will execute'}.
          </p>
          <div className="button-grid">
            <button type="button" onClick={claimFaucet} disabled={!isReadyDeployment || !address || isWriting}>
              <BadgeCheck size={18} />
              Faucet
            </button>
            <button type="button" onClick={approveRouter} disabled={!isReadyDeployment || !address || isWriting}>
              <Shield size={18} />
              Approve
            </button>
            <button
              type="button"
              onClick={() => demoSwap('demoNormalSwap', 'Normal Swap')}
              disabled={!isReadyDeployment || !address || isWriting}
            >
              <ArrowDownUp size={18} />
              Normal Swap
            </button>
            <button
              type="button"
              onClick={() => demoSwap('demoLargeSwap', 'Large Swap')}
              disabled={!isReadyDeployment || !address || isWriting}
            >
              <Gauge size={18} />
              Large Swap
            </button>
            <button
              type="button"
              className="wide danger"
              onClick={() => demoSwap('demoStressSwap', 'Stress Test')}
              disabled={!isReadyDeployment || !address || isWriting}
            >
              <AlertTriangle size={18} />
              Stress Test
            </button>
            <button
              type="button"
              className="wide danger"
              onClick={() => swap(blockedAmount, 1, 'Blocked Swap')}
              disabled={!isReadyDeployment || !address || isWriting}
            >
              <AlertTriangle size={18} />
              Blocked Swap
            </button>
          </div>
          <p className="hint">
            Allowance: {allowance ? formatUnits(allowance, 18) : '0'} currency0. Demo 使用 `minAmountOut = 0`
            以突出 Hook 风险响应。
          </p>
        </div>
      </section>

      <section className="lower-grid">
        <div className="info-panel">
          <div className="panel-title">
            <RadioTower size={22} />
            <h2>Deployment</h2>
          </div>
          <dl>
            <dt>Hook</dt>
            <dd>{shortAddress(deployment?.xguardHook)}</dd>
            <dt>Router</dt>
            <dd>{shortAddress(deployment?.demoRouter)}</dd>
            <dt>PoolManager</dt>
            <dd>{shortAddress(deployment?.poolManager)}</dd>
            <dt>StateView</dt>
            <dd>{shortAddress(deployment?.stateView)}</dd>
            <dt>HookDeployer</dt>
            <dd>{shortAddress(deployment?.hookDeployer)}</dd>
            <dt>PoolId</dt>
            <dd>{deployment?.poolId ? `${deployment.poolId.slice(0, 10)}...${deployment.poolId.slice(-8)}` : '-'}</dd>
            <dt>Last Block</dt>
            <dd>{risk.lastUpdatedBlock}</dd>
          </dl>
        </div>

        <div className="events-panel">
          <div className="panel-title">
            <RadioTower size={22} />
            <h2>Hook Event Stream</h2>
          </div>
          {events.length === 0 ? (
            <p className="empty">等待链上事件。触发 swap 后这里会显示 RiskUpdated、FeeAdjusted 和 LargeSwapDetected。</p>
          ) : (
            <ul>
              {events.map((event) => (
                <li key={event.id} className={event.tone}>
                  <strong>{event.title}</strong>
                  <span>{event.detail}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
