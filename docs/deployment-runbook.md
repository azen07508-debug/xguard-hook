# XGuard X Layer Deployment Runbook

## Preconditions

- A wallet funded with a small amount of OKB on X Layer mainnet.
- Foundry installed and available as `forge`.
- `.env` created from `.env.example`.
- Never commit `.env` or private keys.
- If Node reports `unable to get local issuer certificate` for the public RPC, set `XLAYER_ALLOW_INSECURE_TLS=1` locally as a temporary workaround. Keep the default `0` whenever your system trust store works.

## Local Verification

```bash
npm install
npm run verify
npm run preflight:xlayer
npm run submission:check
forge test
```

`npm run verify` compiles Solidity through `solc` and builds the frontend. `forge test` is still required before mainnet deployment because it executes the Foundry tests against the Hook behavior.
`npm run preflight:xlayer` checks the X Layer RPC chain id, Uniswap v4 PoolManager bytecode, Uniswap v4 StateView bytecode, and deployment JSON shape when present.
`npm run submission:check` confirms that the repo contains the required hackathon submission files without requiring a deployment JSON yet.

## Deploy

Preferred Foundry path:

```bash
npm run preflight:xlayer:deploy
forge script script/DeployXGuard.s.sol:DeployXGuard \
  --rpc-url "$XLAYER_RPC_URL" \
  --broadcast
```

Node fallback when Foundry is unavailable:

```bash
npm run deploy:xlayer:dry-run
npm run preflight:xlayer:deploy
npm run deploy:xlayer:node
```

The deployment script:

- deploys `XGuardHook` at a mined Hook-permission address;
- deploys a project-owned `HookDeployer` before mining the Hook address, so deployment does not depend on a preinstalled CREATE2 singleton;
- deploys `XGuard Meme (XGM)` and `Guard USD (gUSD)`;
- creates a dynamic-fee Uniswap v4 pool through the X Layer PoolManager;
- registers the pool in the Hook;
- deploys `XGuardDemoRouter`;
- seeds initial liquidity;
- writes deployment JSON to `deployments/xlayer-mainnet.json` and `public/deployments/xlayer-mainnet.json`.

The pool must be created with `LPFeeLibrary.DYNAMIC_FEE_FLAG`; otherwise the `beforeSwap` fee override cannot apply.

## Post-Deploy Verification

```bash
npm run verify:xlayer-deployment
npm run demo:xlayer:run
npm run submission:check:final
```

`npm run verify:xlayer-deployment` checks runtime bytecode for PoolManager, StateView, HookDeployer, Hook, DemoRouter, XGM, and gUSD, then reads the onchain risk state. `npm run demo:xlayer:run` executes the judge demo path and writes `deployments/xlayer-demo-results.json` with transaction hashes and OKLink URLs. `npm run submission:check:final` requires `deployments/xlayer-mainnet.json` and validates its X Layer deployment shape.

## Post-Deploy Smoke Test

```bash
npm run web:dev
```

Open `http://localhost:5173` and run:

1. Connect wallet on X Layer.
2. Faucet.
3. Approve.
4. Normal Swap.
5. Large Swap.
6. Stress Test.
7. Blocked Swap.

Expected result: the risk panel progresses from `Normal` to `Warning` to `Protected`, and the UI records the hard-threshold failed transaction locally.

## Submission Artifacts

Copy these into the submission form:

- `xguardHook`
- `hookDeployer`
- `demoRouter`
- `xgm`
- `gUsd`
- `poolId`
- X Layer explorer links for deployment transactions
- `deployments/xlayer-demo-results.json` from `npm run demo:xlayer:run`
- frontend URL
- repository URL
- demo video URL
- project X/Twitter account and launch post URL
