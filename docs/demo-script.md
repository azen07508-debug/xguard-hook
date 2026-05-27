# XGuard Demo Video Script

Target length: 1-3 minutes.

## 0:00-0:20 Problem

New asset and meme pools bring activity to X Layer, but they are fragile at launch. LPs fear toxic flow, traders cannot see pool risk, and large swaps can distort the pool for everyone.

## 0:20-0:45 Product

XGuard Hook is a dynamic risk-fee layer for Uniswap v4 pools. It watches swap impact and consecutive same-direction large swaps. Normal users keep low fees. Riskier flow pays higher LP fees. Only swaps above the hard threshold are blocked.

## 0:45-1:35 Live Demo

1. Show the XGuard dashboard connected to X Layer.
2. Claim XGM and gUSD faucet tokens.
3. Run a normal swap and show `Normal` status with `0.30%` fee.
4. Run a large swap and show `LargeSwapDetected`, `Warning`, and `1.00%` fee.
5. Run the stress test and show risk score moving toward `Protected` with `3.00%` fee.
6. Run the blocked swap and show the UI capturing the reverted `XGuardSwapBlocked` custom error.

## 1:35-2:10 Why It Matters

For LPs, high-risk trades pay more. For traders, the pool surface shows risk before they blindly enter. For project teams, new pools can launch with a default safety layer. For X Layer, this creates real Uniswap v4 Hook calls, swap activity, LP activity, and reusable infrastructure for new asset launches.

## 2:10-2:30 Close

XGuard is not another swap page. It is risk-aware liquidity infrastructure for X Layer's next wave of new asset pools.
