# XGuard Final Submission Package

Use this file as the single copy source for the Hook the Future submission form.

## Project Identity

Project name: XGuard Hook

Chinese name: XGuard Hook：新资产池的动态保护层

One-liner:

XGuard is a dynamic risk-fee Hook for Uniswap v4 pools on X Layer, increasing LP fees under high-impact or abnormal swap conditions while exposing transparent onchain risk states.

Short description:

XGuard Hook is a risk-aware Uniswap v4 Hook deployed on X Layer. It helps new asset pools price trading risk in real time by increasing LP fees under high-impact or abnormal swap conditions, while exposing transparent onchain risk states for traders and LPs.

Chinese description:

XGuard Hook 是 X Layer 上面向 Uniswap v4 新资产池的动态风险费率 Hook。它会根据交易冲击和异常 swap 行为实时调整 LP 手续费，并向交易者和 LP 展示链上可验证的池子风险状态。

Category:

Risk-aware liquidity infrastructure for new asset pools, meme pools, and low-cap pools.

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

Currency0: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`

Currency1: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`

Deployment JSON: `deployments/xlayer-mainnet.json`

Frontend deployment JSON: `public/deployments/xlayer-mainnet.json`

Demo trace JSON: `deployments/xlayer-demo-results.json`

Repository target name: `xguard-hook`

Frontend host target: Vercel

## Explorer Links

- XGuardHook: https://www.oklink.com/xlayer/address/0xA8e58263Dd5337af93CcB29400f7341c67F200c0
- DemoRouter: https://www.oklink.com/xlayer/address/0xee9431f43B978578Db583CF49f2e0a62089c155d
- HookDeployer: https://www.oklink.com/xlayer/address/0x2660118f58288A3bCe5041724a070aee86Fb2BCa
- XGM: https://www.oklink.com/xlayer/address/0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745
- gUSD: https://www.oklink.com/xlayer/address/0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e
- Faucet tx: https://www.oklink.com/xlayer/tx/0x89dd3ce9ad9f6f5a2c8d62354168d39e2758ac74b9895a749a09de7ab1b58d7c
- Approve tx: https://www.oklink.com/xlayer/tx/0x7912a6f8424473d70a11167d8b44f9922d605812a325d5ce8ad32aa449b4c8d8
- Normal swap tx: https://www.oklink.com/xlayer/tx/0xc38368056cb5080aaa8fd9d311bac63f66a81c27bf8dd705d47a65e2d41e6b90
- Large swap tx: https://www.oklink.com/xlayer/tx/0x672b5088951277387771c5d3d74395aae9d3773158f9afc760b38d16df54133c
- Stress test tx: https://www.oklink.com/xlayer/tx/0xb68f74a94810d7eeee795d3c365eca8835c3ada63cc860c0a53569c4a6f45ff2
- Restore-to-Normal tx: https://www.oklink.com/xlayer/tx/0xcd0af83afb5314b884ec5670cd1a028e728b29e861813bdc4b8185432b4d4a93

## Demo Proof

Current verified pool state after the recorded demo and restore transaction:

- State: `Normal`
- Risk score: `0`
- Dynamic fee: `3000` (`0.30%`)
- Last updated block: `61070079`

Recorded demo path:

1. Faucet gives demo XGM/gUSD.
2. Approve allows DemoRouter to spend `currency0`.
3. Normal swap keeps the pool at `Normal` and `0.30%`.
4. Large swap triggers `LargeSwapDetected`, raises risk, and moves toward `Warning`.
5. Stress test pushes the pool into `Protected` and `3.00%`.
6. Blocked swap is captured through the `XGuardSwapBlocked` custom error. No reverted event is expected because reverted logs are rolled back.
7. Restore-to-Normal swap returns the pool to the clean starting state for judge interaction.

## Final Links To Fill

Repository URL: `TODO`

Public frontend URL: `TODO`

Demo video URL: `TODO`

Project X/Twitter URL: `TODO`

Launch post URL: `TODO`

## Form Answer For Technical Notes

XGuard uses only `beforeSwap` and `afterSwap` hook permissions for the MVP. The pool is initialized as a dynamic-fee Uniswap v4 pool with `LPFeeLibrary.DYNAMIC_FEE_FLAG`; otherwise the fee override would not apply. Hard-threshold trades use `XGuardSwapBlocked(bytes32 poolId, uint256 riskScore, uint256 amountIn)` as a custom error, not a reverted event, because logs emitted in a reverted transaction are not retained onchain.

## Suggested Demo Video Caption

XGuard starts in Normal with a 0.30% LP fee, raises fees when a large swap hits the pool, enters Protected after repeated abnormal flow, and surfaces blocked high-impact swaps through a custom error. Built with Uniswap v4 Hooks on X Layer.
