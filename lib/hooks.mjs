import fs from 'node:fs';
import path from 'node:path';
import {
  HOOK_SCRIPT_NAME,
  ARCHIVE_HOOK_SCRIPT_NAME,
  buildHookCommandPath,
  buildArchiveHookCommandPath
} from './constants.mjs';

function createDefaultHooksConfig() {
  return { version: 1, hooks: {} };
}

export function readHooksConfig(targetDir) {
  const filePath = path.join(targetDir, 'hooks.json');
  if (!fs.existsSync(filePath)) {
    return createDefaultHooksConfig();
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(
      `Failed to parse ${filePath}: ${err.message}\nPlease fix the JSON syntax manually and retry.`
    );
  }
}

function isCursorMemoryHook(command) {
  if (typeof command !== 'string') return false;
  return command.endsWith(HOOK_SCRIPT_NAME) || command.includes(`/${HOOK_SCRIPT_NAME}`);
}

function isCursorMemoryArchiveHook(command) {
  if (typeof command !== 'string') return false;
  return (
    command.endsWith(ARCHIVE_HOOK_SCRIPT_NAME) ||
    command.includes(`/${ARCHIVE_HOOK_SCRIPT_NAME}`)
  );
}

export function mergeHooksConfig(config, mode) {
  if (!config.hooks) config.hooks = {};
  if (!config.version) config.version = 1;
  if (!Array.isArray(config.hooks.beforeSubmitPrompt)) {
    config.hooks.beforeSubmitPrompt = [];
  }
  if (!Array.isArray(config.hooks.sessionEnd)) {
    config.hooks.sessionEnd = [];
  }

  config.hooks.beforeSubmitPrompt = config.hooks.beforeSubmitPrompt.filter(
    (entry) => !isCursorMemoryHook(entry.command)
  );
  config.hooks.sessionEnd = config.hooks.sessionEnd.filter(
    (entry) => !isCursorMemoryArchiveHook(entry.command)
  );

  config.hooks.beforeSubmitPrompt.push({
    command: buildHookCommandPath(mode)
  });
  config.hooks.sessionEnd.push({
    command: buildArchiveHookCommandPath(mode)
  });

  return config;
}

export function writeHooksConfig(targetDir, config) {
  fs.mkdirSync(targetDir, { recursive: true });
  const filePath = path.join(targetDir, 'hooks.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}
