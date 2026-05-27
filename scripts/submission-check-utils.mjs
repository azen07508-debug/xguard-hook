import fs from 'node:fs';
import path from 'node:path';
import { validateDeploymentShape } from './preflight-utils.mjs';

export const requiredSubmissionFiles = [
  '.env.example',
  '.github/workflows/ci.yml',
  '.github/workflows/pages.yml',
  'README.md',
  'vercel.json',
  'foundry.toml',
  'package.json',
  'script/DeployXGuard.s.sol',
  'src/XGuardHook.sol',
  'src/XGuardDemoRouter.sol',
  'src/DemoToken.sol',
  'src/HookDeployer.sol',
  'test/XGuardHook.t.sol',
  'test/XGuardDemoFlow.t.sol',
  'src-web/App.tsx',
  'src-web/abi.ts',
  'src-web/config.ts',
  'docs/deployment-runbook.md',
  'docs/demo-script.md',
  'docs/final-submission-package.md',
  'docs/google-form-answers.md',
  'docs/publication-runbook.md',
  'docs/submission-checklist.md',
  'docs/submission-form-draft.md',
  'docs/social-post.md',
  'scripts/demo-runner-utils.mjs',
  'scripts/run-xlayer-demo.mjs',
  'scripts/submission-check.mjs',
  'scripts/tx-utils.mjs',
  'public/deployments/xlayer-mainnet.example.json',
];

export function checkRequiredFiles(root, files = requiredSubmissionFiles) {
  return files.filter((file) => !fs.existsSync(path.join(root, file)));
}

export function checkDeploymentJson(root, { requireDeployment }) {
  const deploymentPath = path.join(root, 'deployments/xlayer-mainnet.json');
  if (!fs.existsSync(deploymentPath)) {
    return requireDeployment ? ['deployments/xlayer-mainnet.json'] : [];
  }

  try {
    const deployment = JSON.parse(fs.readFileSync(deploymentPath, 'utf8'));
    return validateDeploymentShape(deployment).map((field) => `deployments/xlayer-mainnet.json:${field}`);
  } catch {
    return ['deployments/xlayer-mainnet.json:invalid-json'];
  }
}

export const requiredFinalSubmissionLinkLabels = [
  'Repository URL',
  'Public frontend URL',
  'Demo video URL',
  'Project X/Twitter URL',
  'Launch post URL',
];

export function checkFinalSubmissionLinks(root) {
  const packagePath = path.join(root, 'docs/final-submission-package.md');
  if (!fs.existsSync(packagePath)) return [...requiredFinalSubmissionLinkLabels];

  const content = fs.readFileSync(packagePath, 'utf8');
  const missing = [];

  for (const label of requiredFinalSubmissionLinkLabels) {
    const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`^${escapedLabel}:\\s*(.+)$`, 'm'));
    const value = match?.[1]?.trim().replace(/^`|`$/g, '') ?? '';
    if (!/^https?:\/\/\S+$/i.test(value) || /^TODO$/i.test(value)) missing.push(label);
  }

  return missing;
}
