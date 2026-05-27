import fs from 'node:fs';
import path from 'node:path';
import solc from 'solc';

const root = process.cwd();
const entries = [
  'src/XGuardHook.sol',
  'src/HookDeployer.sol',
  'src/DemoToken.sol',
  'src/XGuardDemoRouter.sol',
  'script/DeployXGuard.s.sol',
  'test/XGuardHook.t.sol',
];

const input = {
  language: 'Solidity',
  sources: Object.fromEntries(
    entries.map((file) => [file, { content: fs.readFileSync(path.join(root, file), 'utf8') }]),
  ),
  settings: {
    optimizer: { enabled: true, runs: 44444444 },
    viaIR: true,
    outputSelection: {
      '*': {
        '*': ['abi', 'evm.bytecode.object'],
      },
    },
  },
};

function findImports(importPath) {
  const candidates = [
    path.join(root, importPath),
    path.join(root, 'node_modules', importPath),
    path.join(root, 'node_modules/forge-std/src', importPath.replace(/^forge-std\//, '')),
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return { contents: fs.readFileSync(candidate, 'utf8') };
    }
  }

  return { error: `File not found: ${importPath}` };
}

const output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
const messages = output.errors ?? [];
for (const message of messages) {
  console.error(message.formattedMessage.trim());
}

const errors = messages.filter((message) => message.severity === 'error');
if (errors.length > 0) {
  process.exit(1);
}

console.log(`compiled ${Object.keys(output.contracts ?? {}).length} source units`);
