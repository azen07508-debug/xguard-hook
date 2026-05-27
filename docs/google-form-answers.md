# Hook the Future Google Form Answers

Use this file when filling the final Google Form. Replace only the five external links after publishing the repo, frontend, video, and X/Twitter post.

## Project Name

XGuard Hook

## Chinese Name

XGuard Hook：新资产池的动态保护层

## One-Liner

XGuard is a dynamic risk-fee Hook for Uniswap v4 pools on X Layer, increasing LP fees under high-impact or abnormal swap conditions while exposing transparent onchain risk states.

## Category

Risk-aware liquidity infrastructure for new asset pools, meme pools, and low-cap pools.

## Project Description

XGuard Hook is a Uniswap v4 Hook for X Layer new asset pools. It watches swap impact and repeated same-direction large swaps. Normal flow keeps a low LP fee. High-risk flow pays a higher LP fee. Swaps above the hard threshold are blocked by custom error and surfaced in the demo UI.

For LPs, XGuard creates dynamic risk compensation. For traders, it shows pool risk before they enter. For launch teams, it provides a default safety layer for new asset pools. For X Layer, it creates real Uniswap v4 Hook calls, swaps, LP activity, and reusable infrastructure for new asset launches.

## Technical Highlights

- Uniswap v4 `beforeSwap` and `afterSwap` Hook callbacks.
- Dynamic-fee pool initialized with `LPFeeLibrary.DYNAMIC_FEE_FLAG`.
- Risk-priced LP fees: `0.30%` Normal, `1.00%` Warning, `3.00%` Protected.
- Risk score based on swap impact, repeated same-direction large swaps, and block-based decay.
- Hard-threshold swaps use `XGuardSwapBlocked(bytes32 poolId, uint256 riskScore, uint256 amountIn)` custom error. The project does not rely on reverted transaction events because reverted logs are rolled back.
- Demo router gives judges a simple faucet, approve, normal swap, large swap, stress test, and blocked swap flow.

## X Layer Deployment

Network: X Layer mainnet

Chain ID: `196`

PoolManager: `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32`

StateView: `0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990`

HookDeployer: `0x2660118f58288A3bCe5041724a070aee86Fb2BCa`

XGuardHook: `0xA8e58263Dd5337af93CcB29400f7341c67F200c0`

DemoRouter: `0xee9431f43B978578Db583CF49f2e0a62089c155d`

XGM: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`

gUSD: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`

PoolId: `0xf296bc633edb99d1e68aa6ed981fbd496c4f1f54482d849844d8efa1025d778f`

## Explorer Links

XGuardHook: https://www.oklink.com/xlayer/address/0xA8e58263Dd5337af93CcB29400f7341c67F200c0

DemoRouter: https://www.oklink.com/xlayer/address/0xee9431f43B978578Db583CF49f2e0a62089c155d

HookDeployer: https://www.oklink.com/xlayer/address/0x2660118f58288A3bCe5041724a070aee86Fb2BCa

Normal swap tx: https://www.oklink.com/xlayer/tx/0xc38368056cb5080aaa8fd9d311bac63f66a81c27bf8dd705d47a65e2d41e6b90

Large swap tx: https://www.oklink.com/xlayer/tx/0x672b5088951277387771c5d3d74395aae9d3773158f9afc760b38d16df54133c

Stress test tx: https://www.oklink.com/xlayer/tx/0xb68f74a94810d7eeee795d3c365eca8835c3ada63cc860c0a53569c4a6f45ff2

## Demo Flow

1. Connect wallet on X Layer.
2. Claim XGM and gUSD faucet tokens.
3. Approve the demo router.
4. Run `Normal Swap` and show `Normal` plus `0.30%`.
5. Run `Large Swap` and show `LargeSwapDetected`, `Warning`, and `1.00%`.
6. Run `Stress Test` and show `Protected` plus `3.00%`.
7. Run `Blocked Swap` and show the UI capturing the `XGuardSwapBlocked` custom error.

## Required External Links

Repository URL: `https://github.com/azen07508-debug/xguard-hook`

Public frontend URL: `https://xguard-hook.vercel.app/`

Demo video URL: `TODO`

Project X/Twitter URL: `TODO`

Launch post URL: `TODO`

## Recommended Form Notes

XGuard is not positioned as a guaranteed attack-prevention product. It is a risk-aware liquidity layer that prices high-impact flow in real time, gives LPs more compensation under abnormal conditions, and gives traders visible pool-risk context before they trade.
