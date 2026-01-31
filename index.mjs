#!/usr/bin/env node

import { runSetup } from './lib/setup.mjs';
import * as log from './lib/logger.mjs';
import { select } from './lib/ui.mjs';

const USAGE = `Usage: node cli/cursor-memory-cli/index.mjs setup [--global|--local]

Commands:
  setup    Install cursor-memory components

Options:
  --global   Install to ~/.cursor/ (user-level)
  --local    Install to ./.cursor/ (project-level)

If neither --global nor --local is specified, you will be prompted to choose.`;

function parseArgs() {
  const args = process.argv.slice(2);
  let command = null;
  let mode = null;

  for (const arg of args) {
    if (arg === 'setup') {
      command = 'setup';
    } else if (arg === '--global') {
      mode = 'global';
    } else if (arg === '--local') {
      mode = 'local';
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      log.error(`Unknown argument: ${arg}`);
      console.log(USAGE);
      process.exit(1);
    }
  }

  return { command, mode };
}

async function promptMode() {
  console.log('');
  return select({
    question: 'Where would you like to install cursor-memory?',
    options: [
      { label: 'Global (~/.cursor/) - applies to all projects', value: 'global' },
      { label: 'Local  (./.cursor/) - applies to current project only', value: 'local' }
    ],
    defaultIndex: 0
  });
}

async function main() {
  const { command, mode } = parseArgs();

  if (!command) {
    log.error('No command specified.');
    console.log(USAGE);
    process.exit(1);
  }

  if (command !== 'setup') {
    log.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }

  let resolvedMode = mode;
  if (!resolvedMode) {
    resolvedMode = await promptMode();
  }

  try {
    runSetup(resolvedMode);
  } catch (err) {
    log.error(err.message);
    process.exit(1);
  }
}

main();
