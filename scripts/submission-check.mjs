import process from 'node:process';
import {
  checkDeploymentJson,
  checkFinalSubmissionLinks,
  checkRequiredFiles,
} from './submission-check-utils.mjs';

const root = process.cwd();
const requireDeployment = process.argv.includes('--require-deployment');
const requireLinks = process.argv.includes('--require-links');
const missingFiles = checkRequiredFiles(root);
const deploymentIssues = checkDeploymentJson(root, { requireDeployment });
const linkIssues = requireLinks
  ? checkFinalSubmissionLinks(root).map((label) => `docs/final-submission-package.md:${label}`)
  : [];
const issues = [...missingFiles, ...deploymentIssues, ...linkIssues];

if (issues.length > 0) {
  console.error('Submission check failed:');
  for (const issue of issues) console.error(`- ${issue}`);
  process.exit(1);
}

if (requireDeployment && requireLinks) {
  console.log('Submission check passed with deployment JSON and final external links.');
} else {
  console.log(requireDeployment ? 'Submission check passed with deployment JSON.' : 'Submission check passed.');
}
