# XGuard Current Status

Last updated: 2026-05-27.

## Implemented

- `XGuardHook` implements `beforeSwap` and `afterSwap` callbacks.
- Dynamic fee tiers are `0.30%`, `1.00%`, and `3.00%`.
- Risk state is tracked as `Normal`, `Warning`, and `Protected`.
- Risk scoring uses swap impact, consecutive same-direction large swaps, and block-based decay.
- Hard threshold swaps revert through `XGuardSwapBlocked` custom error; the design does not rely on reverted transaction events.
- Demo contracts include `XGuard Meme (XGM)`, `Guard USD (gUSD)`, `HookDeployer`, and `XGuardDemoRouter`.
- React demo UI covers wallet connection, faucet, approve, normal swap, large swap, stress test, blocked swap, risk preview, risk panel, fee panel, and event stream.
- Deployment scripts target X Layer mainnet PoolManager `0x360E68faCcca8cA495c1B759Fd9EEe466db9FB32` and StateView `0x76Fd297e2D437cd7f76d50F01AfE6160f86e9990`.

## X Layer Mainnet Deployment

Deployment JSON:

- `deployments/xlayer-mainnet.json`
- `public/deployments/xlayer-mainnet.json`

Addresses:

- HookDeployer: `0x2660118f58288A3bCe5041724a070aee86Fb2BCa`
- XGuardHook: `0xA8e58263Dd5337af93CcB29400f7341c67F200c0`
- DemoRouter: `0xee9431f43B978578Db583CF49f2e0a62089c155d`
- XGM: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`
- gUSD: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`
- PoolId: `0xf296bc633edb99d1e68aa6ed981fbd496c4f1f54482d849844d8efa1025d778f`
- Currency0: `0x590CAE3fcc46Dc4Fc7d2C017C449a601119f545e`
- Currency1: `0xBeeC9123bF466a2F5C3F5C09B50F0556E978b745`

Onchain demo trace:

- Faucet: `0x89dd3ce9ad9f6f5a2c8d62354168d39e2758ac74b9895a749a09de7ab1b58d7c`
- Approve: `0x7912a6f8424473d70a11167d8b44f9922d605812a325d5ce8ad32aa449b4c8d8`
- Normal swap: `0xc38368056cb5080aaa8fd9d311bac63f66a81c27bf8dd705d47a65e2d41e6b90`
- Large swap: `0x672b5088951277387771c5d3d74395aae9d3773158f9afc760b38d16df54133c`
- Stress test: `0xb68f74a94810d7eeee795d3c365eca8835c3ada63cc860c0a53569c4a6f45ff2`
- Blocked swap: captured as `XGuardSwapBlocked` by simulation/custom-error decoding; no reverted event is expected.
- Restore-to-Normal swap: `0xcd0af83afb5314b884ec5670cd1a028e728b29e861813bdc4b8185432b4d4a93`

Current verified pool state after restore:

- State: `Normal`
- Score: `0`
- Fee: `3000` (`0.30%`)
- Last updated block: `61070079`

## Verified Locally And Onchain

```bash
forge test
npm run verify
npm run build
npm run submission:check
npm run submission:check:final
npm run submission:ready
npm run deploy:xlayer:dry-run
XLAYER_ALLOW_INSECURE_TLS=1 npm run preflight:xlayer
npm run verify:xlayer-deployment
npm run demo:xlayer:run
```

Verified results:

- Foundry installed through Homebrew: `forge Version: 1.5.1-Homebrew`.
- Foundry tests: 12 passed.
- Node unit tests: 22 passed.
- Solidity compile through `solc`: 56 source units compiled.
- Frontend production build: completed successfully.
- Project build path `forge build && npm run web:build`: completed successfully.
- Submission file check: completed successfully before and after deployment.
- Final readiness check exists as `npm run submission:ready`; it is expected to fail until repository, frontend, demo video, project X/Twitter, and launch post URLs are filled in `docs/final-submission-package.md`.
- Hook address mining dry-run: completed successfully.
- X Layer RPC preflight: chain id `196`, PoolManager and StateView bytecode present.
- X Layer deployment verifier: runtime bytecode present for PoolManager, StateView, HookDeployer, Hook, DemoRouter, XGM, and gUSD; onchain risk state read successfully.
- Onchain demo runner: faucet, approve, normal swap, large swap, stress test, and blocked-swap custom error path completed.
- Final submission package: `docs/final-submission-package.md`.
- Publication runbook for repo/frontend/video/social links: `docs/publication-runbook.md`.
- Public repository: `https://github.com/azen07508-debug/xguard-hook`.
- Frontend deployment target: Vercel using `vercel.json`.
- CI is prepared in `.github/workflows/ci.yml`.
- Optional GitHub Pages deployment is prepared in `.github/workflows/pages.yml`.

## Remaining Submission Work

- Public frontend URL.
- Demo video URL.
- Project X/Twitter account URL.
- X/Twitter launch post URL tagging `@XLayerOfficial`, `@Uniswap`, and `@flapdotsh`.
- Final update of `docs/final-submission-package.md` and `docs/google-form-answers.md` after all five external links are available.

Current publication status:

- `origin` points to `https://github.com/azen07508-debug/xguard-hook.git`.
- Local `main` tracks `origin/main`.
- GitHub metadata verifies the repo is public and the default branch is `main`.

## Mainnet Deployment Gate

The deployment gate has already been run on the current deployment. Re-run only after changing contracts, scripts, deployment JSON, or frontend behavior:

```bash
npm run preflight:xlayer:deploy
forge test
npm run submission:check
npm run deploy:xlayer:dry-run
npm run deploy:xlayer:node
npm run verify:xlayer-deployment
npm run demo:xlayer:run
npm run submission:check:final
npm run web:build
```
