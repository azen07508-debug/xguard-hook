import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  checkDeploymentJson,
  checkFinalSubmissionLinks,
  checkRequiredFiles,
  requiredSubmissionFiles,
} from './submission-check-utils.mjs';
import { xLayerPoolManager, xLayerStateView } from './preflight-utils.mjs';

test('requiredSubmissionFiles includes the main hackathon deliverables', () => {
  assert.ok(requiredSubmissionFiles.includes('README.md'));
  assert.ok(requiredSubmissionFiles.includes('vercel.json'));
  assert.ok(requiredSubmissionFiles.includes('src/XGuardHook.sol'));
  assert.ok(requiredSubmissionFiles.includes('src/XGuardDemoRouter.sol'));
  assert.ok(requiredSubmissionFiles.includes('src-web/App.tsx'));
  assert.ok(requiredSubmissionFiles.includes('docs/google-form-answers.md'));
  assert.ok(requiredSubmissionFiles.includes('docs/submission-form-draft.md'));
  assert.ok(requiredSubmissionFiles.includes('docs/final-submission-package.md'));
  assert.ok(requiredSubmissionFiles.includes('docs/publication-runbook.md'));
});

test('checkRequiredFiles reports missing files relative to the project root', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xguard-check-'));
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(path.join(root, 'README.md'), '# test\n');

  const missing = checkRequiredFiles(root, ['README.md', 'src/XGuardHook.sol']);

  assert.deepEqual(missing, ['src/XGuardHook.sol']);
});

test('checkDeploymentJson can be optional before mainnet deployment', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xguard-check-'));

  assert.deepEqual(checkDeploymentJson(root, { requireDeployment: false }), []);
  assert.deepEqual(checkDeploymentJson(root, { requireDeployment: true }), ['deployments/xlayer-mainnet.json']);
});

test('checkDeploymentJson validates final X Layer deployment shape', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xguard-check-'));
  fs.mkdirSync(path.join(root, 'deployments'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'deployments/xlayer-mainnet.json'),
    `${JSON.stringify({
      chainId: 196,
      poolManager: xLayerPoolManager,
      stateView: xLayerStateView,
      xguardHook: '0x1111111111111111111111111111111111111111',
      demoRouter: '0x2222222222222222222222222222222222222222',
      xgm: '0x3333333333333333333333333333333333333333',
      gUsd: '0x4444444444444444444444444444444444444444',
      currency0: '0x3333333333333333333333333333333333333333',
      currency1: '0x4444444444444444444444444444444444444444',
      poolId: `0x${'a'.repeat(64)}`,
    })}\n`,
  );

  assert.deepEqual(checkDeploymentJson(root, { requireDeployment: true }), []);
});

test('checkFinalSubmissionLinks reports unfilled external submission links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xguard-check-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'docs/final-submission-package.md'),
    [
      'Repository URL: `TODO`',
      'Public frontend URL: `https://xguard.example`',
      'Demo video URL: `TODO`',
      'Project X/Twitter URL: `https://x.com/xguardhook`',
      'Launch post URL: `TODO`',
      '',
    ].join('\n'),
  );

  assert.deepEqual(checkFinalSubmissionLinks(root), [
    'Repository URL',
    'Demo video URL',
    'Launch post URL',
  ]);
});

test('checkFinalSubmissionLinks accepts filled http links', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'xguard-check-'));
  fs.mkdirSync(path.join(root, 'docs'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'docs/final-submission-package.md'),
    [
      'Repository URL: `https://github.com/example/xguard-hook`',
      'Public frontend URL: `https://xguard.example`',
      'Demo video URL: `https://youtu.be/demo`',
      'Project X/Twitter URL: `https://x.com/xguardhook`',
      'Launch post URL: `https://x.com/xguardhook/status/1`',
      '',
    ].join('\n'),
  );

  assert.deepEqual(checkFinalSubmissionLinks(root), []);
});

test('requiredSubmissionFiles includes the final readiness checker', () => {
  assert.ok(requiredSubmissionFiles.includes('scripts/submission-check.mjs'));
});

test('requiredSubmissionFiles includes GitHub Pages deployment workflow', () => {
  assert.ok(requiredSubmissionFiles.includes('.github/workflows/pages.yml'));
});

test('requiredSubmissionFiles includes GitHub CI workflow', () => {
  assert.ok(requiredSubmissionFiles.includes('.github/workflows/ci.yml'));
});
