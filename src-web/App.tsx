import { Fragment, useEffect, useMemo, useState } from 'react';
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
  type Connector,
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

/** 风险分历史点：用于绘制风险曲线 */
type RiskPoint = {
  score: number;
  state: number;
  block: number;
};

/** 曲线最多保留的点数 */
const RISK_HISTORY_LIMIT = 40;

const riskLabels = ['Normal', 'Warning', 'Protected'];
const riskTones = ['normal', 'warning', 'protected'] as const;

/** 把合约的三种风险态映射到 OKX 语义色类（正向 / 警告 / 负向） */
const toneClass = (tone: string) =>
  tone === 'normal' ? 'pos' : tone === 'warning' ? 'warn' : 'neg';

/** 三种风险态的业务含义。合约侧的阈值由 stateIndex 决定，这里只描述状态本身。 */
const zoneDescriptions: Record<string, string> = {
  normal: '低风险 · 基础费率',
  warning: '中风险 · 费率上浮',
  protected: '高风险 · 高费率或拦截',
};
const xguardSwapBlockedSelector = '224d9f7a';
const normalSwapAmount = parseUnits('10', 18);
const largeSwapAmount = parseUnits('60000', 18);
const stressSwapAmount = largeSwapAmount * 3n;
const blockedAmount = parseUnits('90000', 18);
const fullDemoSpendAmount = normalSwapAmount + largeSwapAmount + stressSwapAmount + blockedAmount;

function shortAddress(value?: string) {
  if (!value) return '0x0000...0000';
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

function feeToPercent(fee?: number) {
  if (fee === undefined) return '0.00%';
  return `${(fee / 10_000).toFixed(2)}%`;
}

/**
 * 资金流示意：交易从用户经路由进入 Uniswap v4 池，XGuard Hook 在 beforeSwap
 * 读取风险分并设定动态费率，最终决定成交或拦截。
 * 用 HTML/CSS 而非 SVG —— 窄屏时可以直接改成纵向排列，不需要横向滚动。
 */
function HookFlow({
  state,
  score,
  fee,
  active,
}: {
  state: string;
  score: number;
  fee: string;
  active: boolean;
}) {
  const nodes: { label: string; value: string; sub: string; hot?: boolean }[] = [
    { label: 'Trader', value: 'swap XGM → gUSD', sub: '发起交易' },
    { label: 'Router', value: 'XGuardDemoRouter', sub: '路由到目标池' },
    { label: 'Pool Manager', value: 'Uniswap v4', sub: '触发 beforeSwap' },
    { label: 'XGuard Hook', value: state, sub: `score ${score} · fee ${fee}`, hot: true },
    { label: 'Settlement', value: '成交或拦截', sub: 'LP 获得风险补偿' },
  ];

  return (
    <section
      className={`flow-wrap${active ? ' is-active' : ''}`}
      aria-label="XGuard Hook 拦截流程"
    >
      <div className="flow">
        {nodes.map((n, index) => (
          <Fragment key={n.label}>
            {index > 0 && <span className="flow-arrow" aria-hidden="true" />}
            <div
              className={`flow-node${n.hot ? ' is-hot' : ''}`}
              style={active ? { animationDelay: `${index * 0.18}s` } : undefined}
            >
              {n.hot && <span className="flow-tag">Risk-Aware · 可拦截</span>}
              <span className="flow-label">{n.label}</span>
              <span className="flow-value">{n.value}</span>
              <span className="flow-sub">{n.sub}</span>
            </div>
          </Fragment>
        ))}
      </div>
    </section>
  );
}

/**
 * 风险曲线：把 RiskUpdated 事件串成一条走势线，
 * 让风险面板从「一个数字」变成「一段趋势」。
 */
function RiskCurve({
  points,
  currentScore,
  tone,
}: {
  points: RiskPoint[];
  currentScore: number;
  tone: string;
}) {
  const W = 560;
  const H = 72;
  const PAD_Y = 11;
  const MAX = 120;

  const hasHistory = points.length >= 2;
  const series = hasHistory ? points.map((p) => p.score) : [currentScore, currentScore];

  const x = (i: number) => (series.length <= 1 ? W : (i / (series.length - 1)) * W);
  const y = (v: number) => H - PAD_Y - (Math.min(Math.max(v, 0), MAX) / MAX) * (H - PAD_Y * 2);

  const line = series.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const area = `${line} L${W},${H} L0,${H} Z`;
  const lastValue = series[series.length - 1];
  const lastX = x(series.length - 1);
  const lastY = y(lastValue);

  return (
    <div className="curve">
      <div className="curve-head">
        <span className="curve-title">Risk Trend</span>
        <span className="curve-meta">
          {hasHistory ? `${points.length} 个采样点` : '等待 RiskUpdated 事件'}
        </span>
      </div>
      <svg
        className={`curve-svg ${tone}`}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          hasHistory
            ? `风险分走势，共 ${points.length} 个采样点，最新值 ${lastValue}`
            : `尚无历史事件，当前风险分 ${lastValue}`
        }
      >
        <defs>
          <linearGradient id="curve-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 60, 120].map((v) => (
          <line key={v} x1="0" y1={y(v)} x2={W} y2={y(v)} className="curve-grid" />
        ))}
        {[120, 60, 0].map((v) => (
          <text key={`t-${v}`} x={W - 2} y={y(v) - 5} textAnchor="end" className="curve-tick">
            {v}
          </text>
        ))}
        {/* 没有历史时用虚线占位，避免让人误以为分数长期为 0 */}
        {hasHistory && <path d={area} fill="url(#curve-fill)" />}
        <path
          d={line}
          className={`curve-line${hasHistory ? '' : ' is-placeholder'}`}
          fill="none"
        />
        <circle cx={lastX} cy={lastY} r="3.5" className="curve-dot" />
      </svg>
    </div>
  );
}

async function loadDeployment() {
  // BASE_URL 在 base: './' 下是 './'，在根路径部署下是 '/'。
  // 用它拼部署 JSON 的路径，子路径部署（GitHub Pages）才取得到文件。
  const base = import.meta.env.BASE_URL || '/';
  const configured = import.meta.env.VITE_DEPLOYMENT_URL;
  const candidates = [
    configured,
    `${base}deployments/xlayer-mainnet.json`,
    `${base}deployments/xlayer-mainnet.example.json`,
  ].filter((value): value is string => Boolean(value));

  for (const path of candidates) {
    try {
      const response = await fetch(path);
      if (response.ok) return (await response.json()) as Deployment;
    } catch {
      /* 取不到就试下一个候选路径 */
    }
  }

  throw new Error(`Failed to load deployment JSON (tried: ${candidates.join(', ')})`);
}

export function App() {
  const [deployment, setDeployment] = useState<Deployment | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [riskHistory, setRiskHistory] = useState<RiskPoint[]>([]);
  const [txStatus, setTxStatus] = useState<string>('Ready');
  const publicClient = usePublicClient({ chainId: xLayer.id });
  const { address, isConnected, chainId } = useAccount();
  const { connectors, connectAsync, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { writeContractAsync, isPending: isWriting } = useWriteContract();
  const [walletError, setWalletError] = useState<string | null>(null);

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
    args: deployment ? [deployment.poolId, true, largeSwapAmount] : undefined,
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

  const { data: faucetAlreadyClaimed, refetch: refetchFaucetClaimed } = useReadContract({
    address: deployment?.demoRouter,
    abi: demoRouterAbi,
    functionName: 'faucetClaimed',
    args: address ? [address] : undefined,
    query: { enabled: Boolean(isReadyDeployment && address) },
  });

  // 首次加载：把历史 RiskUpdated 事件拉回来，曲线一进页面就有内容，不用等新交易
  useEffect(() => {
    if (!publicClient || !deployment || !isReadyDeployment) return undefined;
    let cancelled = false;

    publicClient
      .getContractEvents({
        address: deployment.xguardHook,
        abi: xguardHookAbi,
        eventName: 'RiskUpdated',
        fromBlock: 0n,
        toBlock: 'latest',
      })
      .then((logs) => {
        if (cancelled || !logs.length) return;
        const points = logs
          .map((log) => ({
            score: Number((log.args as { score?: bigint }).score ?? 0),
            state: Number((log.args as { state?: number | bigint }).state ?? 0),
            block: Number(log.blockNumber ?? 0),
          }))
          .slice(-RISK_HISTORY_LIMIT);
        setRiskHistory((current) => (current.length ? current : points));
      })
      .catch(() => {
        /* 历史拉取失败不影响实时订阅，静默降级 */
      });

    return () => {
      cancelled = true;
    };
  }, [publicClient, deployment, isReadyDeployment]);

  useEffect(() => {
    if (!publicClient || !deployment || !isReadyDeployment) return undefined;
    return publicClient.watchContractEvent({
      address: deployment.xguardHook,
      abi: xguardHookAbi,
      onLogs: (logs) => {
        // 风险曲线：实时把 RiskUpdated 追加进历史
        const riskPoints = logs
          .filter((log) => log.eventName === 'RiskUpdated')
          .map((log) => ({
            score: Number((log.args as { score?: bigint }).score ?? 0),
            state: Number((log.args as { state?: number | bigint }).state ?? 0),
            block: Number(log.blockNumber ?? 0),
          }));
        if (riskPoints.length) {
          setRiskHistory((current) => [...current, ...riskPoints].slice(-RISK_HISTORY_LIMIT));
        }

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

  const currency0Balance =
    deployment?.currency0.toLowerCase() === deployment?.xgm.toLowerCase() ? xgmBalance : gusdBalance;
  const faucetClaimStatusKnown = !address || faucetAlreadyClaimed !== undefined;
  const hasFaucetClaimed = Boolean(faucetAlreadyClaimed);
  const allowanceAmount = allowance ?? 0n;
  const hasFullDemoApproval = allowanceAmount >= fullDemoSpendAmount;
  const canRunNormalSwap = Boolean(currency0Balance && currency0Balance >= normalSwapAmount && allowanceAmount >= normalSwapAmount);
  const canRunLargeSwap = Boolean(currency0Balance && currency0Balance >= largeSwapAmount && allowanceAmount >= largeSwapAmount);
  const canRunStressTest = Boolean(currency0Balance && currency0Balance >= stressSwapAmount && allowanceAmount >= stressSwapAmount);
  const canRunBlockedSwap = Boolean(currency0Balance && currency0Balance >= blockedAmount && allowanceAmount >= blockedAmount);

  async function refreshReads() {
    await Promise.all([
      refetchRisk(),
      refetchXgm(),
      refetchGusd(),
      refetchAllowance(),
      refetchLargePreview(),
      refetchFaucetClaimed(),
    ]);
  }

  async function requireReady() {
    if (!deployment || !address) throw new Error('Connect wallet and load deployment first');
    if (chainId !== xLayer.id) {
      switchChain({ chainId: xLayer.id });
      throw new Error('Switch to X Layer and retry');
    }
    return deployment;
  }

  async function connectWallet() {
    setWalletError(null);
    const orderedConnectors = getPreferredConnectors(connectors);
    if (orderedConnectors.length === 0) {
      const message = 'No injected wallet detected. Install or enable OKX Wallet / MetaMask, then refresh.';
      setWalletError(message);
      setTxStatus('Wallet connection failed');
      return;
    }
    let lastError: unknown;
    for (const connector of orderedConnectors) {
      try {
        setTxStatus(`Opening ${connector.name} connection...`);
        await connectAsync({ connector, chainId: xLayer.id });
        setWalletError(null);
        setTxStatus('Wallet connected');
        return;
      } catch (error) {
        lastError = error;
        if (!isMissingProviderError(error)) break;
      }
    }
    setWalletError(formatWalletConnectError(lastError));
    setTxStatus('Wallet connection failed');
  }

  function getPreferredConnectors(availableConnectors: readonly Connector[]) {
    return [...availableConnectors].sort((left, right) => connectorPriority(left) - connectorPriority(right));
  }

  function connectorPriority(connector: Connector) {
    const label = `${connector.id} ${connector.name}`.toLowerCase();
    if (label.includes('okx') || label.includes('okex')) return 0;
    if (label.includes('injected')) return 1;
    if (label.includes('metamask')) return 2;
    return 3;
  }

  function formatWalletConnectError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    if (
      lower.includes('providernotfound') ||
      lower.includes('provider not found') ||
      lower.includes('no provider') ||
      lower.includes('no ethereum provider')
    ) {
      return 'No injected wallet detected. Install or enable OKX Wallet / MetaMask, then refresh.';
    }
    if (lower.includes('rejected') || lower.includes('denied') || lower.includes('user rejected')) {
      return 'Wallet connection was rejected. Open the wallet extension and approve the connection request.';
    }
    return message.slice(0, 220);
  }

  function isMissingProviderError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const lower = message.toLowerCase();
    return (
      lower.includes('providernotfound') ||
      lower.includes('provider not found') ||
      lower.includes('no provider') ||
      lower.includes('no ethereum provider')
    );
  }

  async function claimFaucet() {
    const loaded = await requireReady();
    if (faucetAlreadyClaimed) {
      setTxStatus('Demo tokens ready');
      pushLocalEvent('Faucet', 'Demo tokens are already available for this wallet.', 'normal');
      return;
    }
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

  return (
    <main className="app-shell">
      <section className="topbar">
        <div className="brand">
          <span className="brand-mark">XG</span>
          <span className="brand-name">XGuard Hook</span>
          <span className="brand-sub">Uniswap v4 · X Layer</span>
        </div>
        <div className="wallet-box">
          {isConnected ? (
            <>
              <span className="wallet-address">{shortAddress(address)}</span>
              <button type="button" onClick={() => disconnect()}>
                Disconnect
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary"
              onClick={connectWallet}
              disabled={isConnecting}
            >
              <Wallet size={15} />
              {isConnecting ? 'Connecting' : 'Connect Wallet'}
            </button>
          )}
        </div>
      </section>

      <section className="page-head">
        <p className="eyebrow">Risk-Aware Liquidity Hook</p>
        <h1>
          Dynamic risk-priced
          <br />
          liquidity for X Layer.
        </h1>
        <p className="subtitle">
          新资产池的动态保护层：低风险低费，高风险交易为 LP 支付更高风险补偿。
        </p>
      </section>

      <HookFlow
        state={risk.label}
        score={risk.score}
        fee={feeToPercent(risk.fee)}
        active={isWriting}
      />

      <section className="strip" aria-label="池状态概览">
        <div className="strip-item">
          <span className="strip-label">Pool</span>
          <span className="strip-value">XGM / gUSD</span>
        </div>
        <div className="strip-item">
          <span className="strip-label">Status</span>
          <span className={`strip-value ${toneClass(risk.tone)}`}>
            <i className={`state-sq ${toneClass(risk.tone)}`} />
            {risk.label}
          </span>
        </div>
        <div className="strip-item">
          <span className="strip-label">Risk Score</span>
          <span className="strip-value">{risk.score}</span>
        </div>
        <div className="strip-item">
          <span className="strip-label">Dynamic Fee</span>
          <span className="strip-value">{feeToPercent(risk.fee)}</span>
        </div>
        <div className="strip-item">
          <span className="strip-label">Ref. Liquidity</span>
          <span className="strip-value">
            {referenceLiquidity ? formatUnits(referenceLiquidity, 18) : '—'}
          </span>
        </div>
        <div className="strip-item">
          <span className="strip-label">Last Block</span>
          <span className="strip-value">{risk.lastUpdatedBlock}</span>
        </div>
      </section>

      {walletError && (
        <section className="notice warning">
          <AlertTriangle size={16} />
          <span>{walletError}</span>
        </section>
      )}

      {onWrongChain && (
        <section className="notice protected">
          <AlertTriangle size={16} />
          <span>当前钱包不在 X Layer。切换到 X Layer 主网后再触发 Hook Demo。</span>
          <button type="button" onClick={() => switchChain({ chainId: xLayer.id })}>
            Switch
          </button>
        </section>
      )}

      {loadError && <section className="notice protected">{loadError}</section>}

      <section className="dashboard">
        <div className={`panel risk-panel ${risk.tone}`}>
          <div className="panel-title">
            <Shield size={16} />
            <h2>Pool Risk Readout</h2>
          </div>

          <div className="risk-head">
            <div>
              <span className="risk-head-label">Current State</span>
              <span className={`risk-state ${toneClass(risk.tone)}`}>
                <i className={`state-sq ${toneClass(risk.tone)}`} />
                {risk.label}
              </span>
            </div>
            <div className="risk-score">
              {risk.score}
              <small>RISK SCORE</small>
            </div>
          </div>

          <div className="gauge">
            <div className="gauge-fill" style={{ width: `${Math.min(risk.score, 120)}%` }} />
            <div
              className={`gauge-marker ${toneClass(risk.tone)}`}
              /* clamp 保证指针永远落在轨道内：风险分为 0 或 120 时
                 纯百分比定位会被 overflow:hidden 裁掉，等于没有指针。 */
              style={{
                left: `clamp(1px, ${(Math.min(risk.score, 120) / 120) * 100}%, calc(100% - 3px))`,
              }}
            />
          </div>
          <div className="gauge-scale">
            <span>0</span>
            <span>30</span>
            <span>60</span>
            <span>90</span>
            <span>120</span>
          </div>

          <RiskCurve
            points={riskHistory}
            currentScore={risk.score}
            tone={toneClass(risk.tone)}
          />

          <div className="metrics">
            <div className="metric-row">
              <span>Risk Score</span>
              <strong>{risk.score}</strong>
            </div>
            <div className="metric-row">
              <span>Dynamic Fee</span>
              <strong>{feeToPercent(risk.fee)}</strong>
            </div>
            <div className="metric-row">
              <span>Reference Liquidity</span>
              <strong>{referenceLiquidity ? formatUnits(referenceLiquidity, 18) : '—'}</strong>
            </div>
          </div>

          <div className="risk-zones">
            <span className="risk-zones-title">Risk States</span>
            {riskTones.map((tone, index) => (
              <div
                key={tone}
                className={`zone-row ${toneClass(tone)}${risk.tone === tone ? ' is-current' : ''}`}
              >
                <i className={`state-sq ${toneClass(tone)}`} />
                <span className="zone-name">{riskLabels[index]}</span>
                <span className="zone-desc">{zoneDescriptions[tone]}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel actions-panel flush-right">
          <div className="panel-title">
            <Zap size={16} />
            <h2>Demo Actions</h2>
          </div>
          <div className="balance-row">
            <span>XGM {xgmBalance ? formatUnits(xgmBalance, 18) : '0'}</span>
            <span>gUSD {gusdBalance ? formatUnits(gusdBalance, 18) : '0'}</span>
          </div>
          <div className="tx-status">{txStatus}</div>
          <p className="hint">
            Demo flow: {hasFaucetClaimed ? 'demo tokens are ready, continue from approval and swaps.' : 'claim demo tokens first.'}{' '}
            {hasFullDemoApproval ? 'Router approval is ready.' : 'Approve once before running swaps.'}
          </p>
          <div className="button-grid">
            <button
              type="button"
              className="primary"
              onClick={claimFaucet}
              disabled={!isReadyDeployment || !address || isWriting || !faucetClaimStatusKnown}
            >
              <BadgeCheck size={15} />
              {hasFaucetClaimed ? 'Tokens Ready' : 'Faucet'}
            </button>
            <button
              type="button"
              onClick={approveRouter}
              disabled={!isReadyDeployment || !address || isWriting || hasFullDemoApproval}
            >
              <Shield size={15} />
              {hasFullDemoApproval ? 'Approved' : 'Approve'}
            </button>
            <button
              type="button"
              onClick={() => demoSwap('demoNormalSwap', 'Normal Swap')}
              disabled={!isReadyDeployment || !address || isWriting || !canRunNormalSwap}
            >
              <ArrowDownUp size={15} />
              Normal Swap
            </button>
            <button
              type="button"
              onClick={() => demoSwap('demoLargeSwap', 'Large Swap')}
              disabled={!isReadyDeployment || !address || isWriting || !canRunLargeSwap}
            >
              <Gauge size={15} />
              Large Swap
            </button>
            <button
              type="button"
              className="wide danger"
              onClick={() => demoSwap('demoStressSwap', 'Stress Test')}
              disabled={!isReadyDeployment || !address || isWriting || !canRunStressTest}
            >
              <AlertTriangle size={15} />
              Stress Test
            </button>
            <button
              type="button"
              className="wide danger"
              onClick={() => swap(blockedAmount, 1, 'Blocked Swap')}
              disabled={!isReadyDeployment || !address || isWriting || !canRunBlockedSwap}
            >
              <AlertTriangle size={15} />
              Blocked Swap
            </button>
          </div>
          <p className="hint">
            Large swap preview: fee {feeToPercent(Number(largeSwapPreview?.[1] ?? 3_000))}, score{' '}
            {largeSwapPreview?.[0]?.toString() ?? '-'}, {largeSwapPreview?.[2] ? 'will block' : 'will execute'}.
          </p>
          <p className="hint">
            Allowance: {allowance ? formatUnits(allowance, 18) : '0'} currency0. Demo 使用 `minAmountOut = 0`
            以突出 Hook 风险响应。
          </p>
        </div>
      </section>

      <section className="lower-grid">
        <div className="panel info-panel flush-left">
          <div className="panel-title">
            <RadioTower size={16} />
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

        <div className="panel events-panel flush-right">
          <div className="panel-title">
            <RadioTower size={16} />
            <h2>Hook Event Stream</h2>
          </div>
          {events.length === 0 ? (
            <p className="empty">
              等待链上事件。
              <br />
              触发任意 swap 后，这里会按时间顺序显示 RiskUpdated、FeeAdjusted 与 LargeSwapDetected。
            </p>
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
