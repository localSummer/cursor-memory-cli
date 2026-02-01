import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const CLI_ROOT = path.resolve(__dirname, '..');
export const TEMPLATES_DIR = path.join(CLI_ROOT, 'templates');
export const HOOK_SCRIPT_NAME = 'cursor-memory-reminder.sh';
export const ARCHIVE_HOOK_SCRIPT_NAME = 'cursor-memory-archive.sh';

export function resolveTargetDir(mode) {
  if (mode === 'global') {
    return path.join(os.homedir(), '.cursor');
  }
  return path.resolve(process.cwd(), '.cursor');
}

export function buildHookCommandPath(mode) {
  if (mode === 'global') {
    return `~/.cursor/hooks/${HOOK_SCRIPT_NAME}`;
  }
  return `.cursor/hooks/${HOOK_SCRIPT_NAME}`;
}

export function buildArchiveHookCommandPath(mode) {
  if (mode === 'global') {
    return `~/.cursor/hooks/${ARCHIVE_HOOK_SCRIPT_NAME}`;
  }
  return `.cursor/hooks/${ARCHIVE_HOOK_SCRIPT_NAME}`;
}
