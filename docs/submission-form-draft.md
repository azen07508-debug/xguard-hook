# Hook the Future Submission Draft

## Project

Name: XGuard Hook

Chinese name: XGuard Hook：新资产池的动态保护层

One-liner: XGuard is a dynamic risk-fee Hook for Uniswap v4 pools on X Layer, increasing LP fees under high-impact or abnormal swap conditions while exposing transparent onchain risk states.

Category: Risk-aware liquidity infrastructure for new asset pools, meme pools, and low-cap pools.

## Description

XGuard Hook is a Uniswap v4 Hook for X Layer new asset pools. It watches swap impact and repeated same-direction large swaps. Normal flow keeps a low LP fee. High-risk flow pays a higher LP fee. Swaps above the hard threshold are blocked by custom error and surfaced in the demo UI.

For LPs, XGuard creates dynamic risk compensation. For traders, it shows pool risk before they enter. For launch teams, it provides a default safety layer for new asset pools. For X Layer, it creates real Uniswap v4 Hook calls, swaps, LP activity, and reusable infrastructure for new asset launches.

## Deployment

Network: X Layer mainnet

PoolManager: `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`

StateView: `0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990`

HookDeployer: `0x2660118f58288A3bCe5041724a070aee86Fb2BCa`

XGuardHook: `0xA8e58263Dd5337af93CcB29400f7341c67F200c0`

DemoRouter: `0xee9431f43B978578Db583CF49f2e0a62089c155d`

XGM: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`

gUSD: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`

PoolId: `0xf296bc633edb99d1e68aa6ed981fbd496c4f1f54482d849844d8efa1025d778f`

Currency0: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`

Currency1: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`

Deployment JSON: `deployments/xlayer-mainnet.json`

Demo results JSON: `deployments/xlayer-demo-results.json`

Onchain demo txs:

- Faucet: `0x89dd3ce9ad9f6f5a2c8d62354168d39e2758ac74b9895a749a09de7ab1b58d7c`
- Approve: `0x7912a6f8424473d70a11167d8b44f9922d605812a325d5ce8ad32aa449b4c8d8`
- Normal swap: `0xc38368056cb5080aaa8fd9d311bac63f66a81c27bf8dd705d47a65e2d41e6b90`
- Large swap: `0x672b5088951277387771c5d3d74395aae9d3773158f9afc760b38d16df54133c`
- Stress test: `0xb68f74a94810d7eeee795d3c365eca8835c3ada63cc860c0a53569c4a6f45ff2`
- Blocked swap: `XGuardSwapBlocked` custom error captured by the demo path
- Restore-to-Normal swap: `0xcd0af83afb5314b884ec5670cd1a028e728b29e861813bdc4b8185432b4d4a93`

## Demo Flow

1. Connect wallet on X Layer.
2. Claim XGM and gUSD faucet tokens.
3. Approve the demo router.
4. Run `Normal Swap` and show `Normal` plus `0.30%`.
5. Run `Large Swap` and show `LargeSwapDetected`, `Warning`, and `1.00%`.
6. Run `Stress Test` and show `Protected` plus `3.00%`.
7. Run `Blocked Swap` and show the reverted `XGuardSwapBlocked` custom error in the UI.

## Links

Repository: `https://github.com/azen07508-debug/xguard-hook`

Frontend: `https://xguard-hook.vercel.app/`

Demo video: `https://www.youtube.com/watch?v=JEAyIYO5uFk`

Project X/Twitter: `https://x.com/ZenAo365353`

Launch post: `https://x.com/ZenAo365353/status/2059872071178649923`

For all copyable deployment fields and explorer links, use `docs/final-submission-package.md`.
