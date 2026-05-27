# XGuard Publication Runbook

This runbook covers the remaining offchain steps before submitting Hook the Future.

## 1. Publish The Repository

Before publishing, confirm the private key is not in the repo:

```bash
git status --ignored --short
```

Expected sensitive state:

- `.env` is ignored.
- `node_modules/`, `out/`, `cache/`, `dist/`, and `tsconfig.tsbuildinfo` are ignored.

Recommended public repo contents:

- `src/`
- `test/`
- `script/`
- `scripts/`
- `src-web/`
- `docs/`
- `deployments/xlayer-mainnet.json`
- `deployments/xlayer-demo-results.json`
- `public/deployments/xlayer-mainnet.json`
- `README.md`
- `package.json`
- `foundry.toml`
- `.github/workflows/ci.yml`
- `.github/workflows/pages.yml`

The repo includes `.github/workflows/ci.yml` for `forge test`, `npm run verify`, and `npm run submission:check:final`. After publishing, wait for this workflow to pass before submitting the repo URL.

## 2. Publish The Frontend

The frontend is a static Vite app. It reads deployed addresses from:

```text
public/deployments/xlayer-mainnet.json
```

Build locally:

```bash
npm run web:build
```

Static output directory:

```text
dist/
```

The selected frontend host is Vercel. The repo includes `vercel.json` with:

- install command: `npm ci`;
- build command: `npm run web:build`;
- output directory: `dist`;
- public deployment JSON path: `/deployments/xlayer-mainnet.json`;
- public X Layer RPC URL: `https://rpc.xlayer.tech`.

Do not add `.env`, `PRIVATE_KEY`, or any deployer key to Vercel. The Vercel frontend only needs public `VITE_*` values.

The repo includes `.github/workflows/pages.yml`. If you publish this repo on GitHub, enable GitHub Pages with `GitHub Actions` as the source, then run the `Deploy frontend to GitHub Pages` workflow. The workflow builds `npm run web:build` and publishes `dist/`.

Environment variables for hosted frontend:

```bash
VITE_XLAYER_RPC_URL=https://rpc.xlayer.tech
VITE_DEPLOYMENT_URL=/deployments/xlayer-mainnet.json
```

After publishing, open the public URL and verify:

- title shows `XGuard Hook`;
- risk panel shows `Normal`;
- dynamic fee shows `0.30%`;
- Hook address shows `0xA8e5...00c0`;
- buttons show `Faucet`, `Approve`, `Normal Swap`, `Large Swap`, `Stress Test`, and `Blocked Swap`;
- browser console has no errors.

## 3. Record Demo Video

Use `docs/demo-script.md` as the voiceover. Keep the video between 1 and 3 minutes.

Required shots:

1. Open the frontend and show X Layer connection.
2. Show pool state `Normal`, score `0`, and fee `0.30%`.
3. Run `Normal Swap`.
4. Run `Large Swap` and show the event stream.
5. Run `Stress Test` and show `Protected` / `3.00%`.
6. Run `Blocked Swap` and show the UI message for `XGuardSwapBlocked`.
7. Close on the sentence: `Risk-aware liquidity infrastructure for X Layer new asset pools.`

## 4. Post On X/Twitter

Create or use the project account, then publish the launch post from:

```text
docs/social-post.md
```

The post must tag:

- `@XLayerOfficial`
- `@Uniswap`
- `@flapdotsh`

Save the project account URL and post URL.

## 5. Final Submission

Copy values from:

```text
docs/google-form-answers.md
docs/final-submission-package.md
```

Fill these remaining links:

- repository URL;
- public frontend URL;
- demo video URL;
- project X/Twitter URL;
- launch post URL.

After filling those links, run:

```bash
npm run submission:ready
```

Expected result:

```text
Submission check passed with deployment JSON and final external links.
```

Then submit through the Hook the Future Google Form before the deadline.
