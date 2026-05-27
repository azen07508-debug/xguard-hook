# XGuard Hook

XGuard Hook is a dynamic risk-fee Uniswap v4 Hook for new asset pools, meme pools, and low-cap pools on X Layer. It increases LP fees under high-impact or abnormal swap conditions while exposing transparent onchain risk states for traders and LPs.

中文：XGuard Hook 是 X Layer 上面向 Uniswap v4 新资产池的动态风险费率 Hook。它会根据交易冲击和异常 swap 行为实时调整 LP 手续费，并向交易者和 LP 展示链上可验证的池子风险状态。

## What It Demonstrates

- Dynamic LP fee override in `beforeSwap`
- Risk state tracking: `Normal`, `Warning`, `Protected`
- MVP signals: swap impact, consecutive same-direction large swaps, and block-based risk decay
- Hard threshold blocking through `XGuardSwapBlocked` custom error, not a reverted transaction event
- A demo router and frontend for faucet, approval, normal swap, large swap, stress test, blocked swap, risk preview, and event stream

## Risk-Priced LP Fee

| State | Fee | Meaning |
| --- | ---: | --- |
| Normal | 0.30% | Normal market flow, low-cost trading |
| Warning | 1.00% | High-impact flow appears, LPs receive higher risk compensation |
| Protected | 3.00% | Pool is in a high-risk state; trading can continue with clearly higher cost |
| Hard Block | Revert | Single swap exceeds the 8% hard threshold and is rejected by custom error |

XGuard pools must be initialized as dynamic-fee Uniswap v4 pools. If the `PoolKey` does not use `LPFeeLibrary.DYNAMIC_FEE_FLAG`, the Hook's fee override will not be applied.

## Contracts

- `XGuardHook`: Uniswap v4 Hook with dynamic fee and protection logic
- `HookDeployer`: small CREATE2 deployer used to mine a valid Uniswap v4 Hook address on any EVM chain
- `DemoToken`: mintable ERC20 for `XGuard Meme (XGM)` and `Guard USD (gUSD)`
- `XGuardDemoRouter`: faucet, initial liquidity helper, and exact-input swap helper
- `DeployXGuard`: X Layer mainnet deployment script

## Local Setup

```bash
npm install
```

Foundry is required for Solidity build and tests:

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
forge test
```

On macOS, Homebrew is also a valid route:

```bash
brew install foundry
forge test
```

Frontend build:

```bash
npm run web:build
```

Solidity compile fallback when `forge` is not available:

```bash
npm run sol:compile
```

Combined local verification:

```bash
npm run verify
forge test
npm run submission:check
```

Frontend dev server:

```bash
npm run web:dev
```

## Frontend Deployment

The frontend is a static Vite app and is ready for Vercel deployment.

Vercel settings are captured in `vercel.json`:

- install command: `npm ci`
- build command: `npm run web:build`
- output directory: `dist`
- deployment JSON path: `/deployments/xlayer-mainnet.json`

Do not upload `.env` or private keys to Vercel. The frontend only needs public values:

```bash
VITE_XLAYER_RPC_URL=https://rpc.xlayer.tech
VITE_DEPLOYMENT_URL=/deployments/xlayer-mainnet.json
```

## X Layer Deployment

Current X Layer mainnet deployment:

- HookDeployer: `0x2660118f58288A3bCe5041724a070aee86Fb2BCa`
- XGuardHook: `0xA8e58263Dd5337af93CcB29400f7341c67F200c0`
- DemoRouter: `0xee9431f43B978578Db583CF49f2e0a62089c155d`
- XGM: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`
- gUSD: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`
- PoolId: `0xf296bc633edb99d1e68aa6ed981fbd496c4f1f54482d849844d8efa1025d778f`

The deployed pool was restored to `Normal`, score `0`, fee `0.30%`, at block `61070079` after the onchain demo trace.

Create `.env` from `.env.example` and fund the deployer wallet with OKB for gas.

```bash
cp .env.example .env
npm run preflight:xlayer:deploy
forge script script/DeployXGuard.s.sol:DeployXGuard \
  --rpc-url "$XLAYER_RPC_URL" \
  --broadcast
```

The script writes both `deployments/xlayer-mainnet.json` and `public/deployments/xlayer-mainnet.json`, so the frontend can read the deployed addresses directly.

After deployment:

```bash
npm run verify:xlayer-deployment
npm run demo:xlayer:run
npm run submission:check:final
```

If Foundry is not available, use the Node deployment fallback:

```bash
npm run deploy:xlayer:dry-run
npm run preflight:xlayer:deploy
npm run deploy:xlayer:node
```

## Demo Flow

1. Connect wallet on X Layer.
2. Claim faucet tokens.
3. Approve the demo router for `currency0`.
4. Run `Normal Swap` to keep the pool in `Normal` with a 0.30% fee.
5. Run `Large Swap` to trigger Warning and a higher fee.
6. Run `Stress Test` to push the pool toward Protected.
7. Run `Blocked Swap` to demonstrate the hard-threshold custom error surfaced in the UI.

For a repeatable onchain demo trace after deployment, run:

```bash
npm run demo:xlayer:run
```

It writes `deployments/xlayer-demo-results.json` with transaction hashes and OKLink URLs for the judge walkthrough.

## Submission Package

- Final form fields and explorer links: `docs/final-submission-package.md`
- Google Form copy source: `docs/google-form-answers.md`
- Remaining publication steps: `docs/publication-runbook.md`
- Demo video script: `docs/demo-script.md`
- X/Twitter post drafts: `docs/social-post.md`
- Vercel deployment config: `vercel.json`
- GitHub CI workflow: `.github/workflows/ci.yml`
- GitHub Pages deployment workflow: `.github/workflows/pages.yml`

## Mainnet Constants

- X Layer chain id: `196`
- Uniswap v4 PoolManager: `0x360E68faccca8cA495c1B759Fd9EEe466db9FB32`
- Uniswap v4 StateView: `0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990`
- Dynamic fee pool flag: `0x800000`
- Hook address permissions: `beforeSwap` and `afterSwap`
- Hook address mining does not rely on a predeployed singleton factory; the project deploys its own `HookDeployer`.

## Submission Positioning

Chinese name: `XGuard Hook：新资产池的动态保护层`

One-liner: XGuard is a dynamic risk-fee Hook for Uniswap v4 pools on X Layer, increasing LP fees under high-impact or abnormal swap conditions while exposing transparent onchain risk states.
