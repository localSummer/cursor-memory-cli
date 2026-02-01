#!/usr/bin/env node

import path from 'node:path';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { runSetup } from './lib/setup.mjs';
import * as log from './lib/logger.mjs';
import { select } from './lib/ui.mjs';
import { resolveTargetDir } from './lib/constants.mjs';

const USAGE = `Usage: node cli/cursor-memory-cli/index.mjs <command> [options]

Commands:
  setup     Install cursor-memory components
  archive   Run memory archive manually

Options:
  --global    Install to ~/.cursor/ (user-level)
  --local     Install to ./.cursor/ (project-level)
  --dry-run   Preview archive without moving files (archive command)
  --threshold <days>  Override retention days (archive command)
  --limit <n>  Override max files per run (archive command)

If neither --global nor --local is specified, you will be prompted to choose.`;

function parseArgs() {
  const args = process.argv.slice(2);
  let command = null;
  let mode = null;
  let dryRun = false;
  let threshold = null;
  let limit = null;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === 'setup') {
      command = 'setup';
    } else if (arg === 'archive') {
      command = 'archive';
    } else if (arg === '--global') {
      mode = 'global';
    } else if (arg === '--local') {
      mode = 'local';
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg === '--threshold') {
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        threshold = Number(value);
        i += 1;
      } else {
        threshold = null;
      }
    } else if (arg === '--limit') {
      const value = args[i + 1];
      if (value && !value.startsWith('--')) {
        limit = Number(value);
        i += 1;
      } else {
        limit = null;
      }
    } else if (arg === '--help' || arg === '-h') {
      console.log(USAGE);
      process.exit(0);
    } else {
      log.error(`Unknown argument: ${arg}`);
      console.log(USAGE);
      process.exit(1);
    }
  }

  return { command, mode, dryRun, threshold, limit };
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
  const { command, mode, dryRun, threshold, limit } = parseArgs();

  if (!command) {
    log.error('No command specified.');
    console.log(USAGE);
    process.exit(1);
  }

  if (command !== 'setup' && command !== 'archive') {
    log.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }

  let resolvedMode = mode;
  if (!resolvedMode) {
    resolvedMode = await promptMode();
  }

  try {
    if (command === 'setup') {
      runSetup(resolvedMode);
      return;
    }

    const targetDir = resolveTargetDir(resolvedMode);
    const runnerPath = path.join(targetDir, 'hooks', 'cursor-memory-archive.mjs');
    if (!fs.existsSync(runnerPath)) {
      throw new Error(`Archive runner not found at ${runnerPath}. Run setup first.`);
    }

    const args = [
      runnerPath,
      '--project-root',
      process.cwd(),
      '--cursor-dir',
      targetDir
    ];
    if (dryRun) args.push('--dry-run');
    if (Number.isFinite(threshold)) {
      args.push('--threshold', String(threshold));
    }
    if (Number.isFinite(limit)) {
      args.push('--limit', String(limit));
    }

    const result = spawnSync('node', args, { stdio: 'inherit' });
    if (result.status !== 0) {
      throw new Error('Archive command failed.');
    }
  } catch (err) {
    log.error(err.message);
    process.exit(1);
  }
}

main();
