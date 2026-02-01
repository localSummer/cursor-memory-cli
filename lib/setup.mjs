import fs from "node:fs";
import path from "node:path";
import {
  TEMPLATES_DIR,
  resolveTargetDir,
  HOOK_SCRIPT_NAME,
  ARCHIVE_HOOK_SCRIPT_NAME
} from "./constants.mjs";
import {
  readHooksConfig,
  mergeHooksConfig,
  writeHooksConfig,
} from "./hooks.mjs";
import { copyFile, copyDir, makeExecutable } from "./copy.mjs";
import * as log from "./logger.mjs";

export function runSetup(mode) {
  const targetDir = resolveTargetDir(mode);
  const modeLabel =
    mode === "global" ? "global (~/.cursor/)" : `local (${targetDir}/)`;

  log.info(`Setting up cursor-memory in ${modeLabel} mode...`);
  log.dim(`Target directory: ${targetDir}`);

  // Step 1: Merge hooks.json
  log.info("Merging hooks.json...");
  const config = readHooksConfig(targetDir);
  mergeHooksConfig(config, mode);
  writeHooksConfig(targetDir, config);
  log.success(`hooks.json updated at ${path.join(targetDir, "hooks.json")}`);

  // Step 2: Copy hook script
  log.info("Installing hook script...");
  const hookSrc = path.join(TEMPLATES_DIR, "hooks", HOOK_SCRIPT_NAME);
  const hookDest = path.join(targetDir, "hooks", HOOK_SCRIPT_NAME);
  copyFile(hookSrc, hookDest);
  makeExecutable(hookDest);
  log.success(`Hook script installed at ${hookDest}`);

  // Step 2.1: Copy archive hook script and runner
  log.info("Installing archive hook script...");
  const archiveHookSrc = path.join(TEMPLATES_DIR, "hooks", ARCHIVE_HOOK_SCRIPT_NAME);
  const archiveHookDest = path.join(targetDir, "hooks", ARCHIVE_HOOK_SCRIPT_NAME);
  copyFile(archiveHookSrc, archiveHookDest);
  makeExecutable(archiveHookDest);
  const archiveRunnerSrc = path.join(TEMPLATES_DIR, "hooks", "cursor-memory-archive.mjs");
  const archiveRunnerDest = path.join(targetDir, "hooks", "cursor-memory-archive.mjs");
  copyFile(archiveRunnerSrc, archiveRunnerDest);
  log.success(`Archive hook installed at ${archiveHookDest}`);

  // Step 2.2: Install default archive config if missing
  const archiveConfigSrc = path.join(TEMPLATES_DIR, "memory-archive.json");
  const archiveConfigDest = path.join(targetDir, "memory-archive.json");
  if (!fs.existsSync(archiveConfigDest)) {
    copyFile(archiveConfigSrc, archiveConfigDest);
    log.success(`Archive config installed at ${archiveConfigDest}`);
  } else {
    log.dim(`Archive config already exists at ${archiveConfigDest}`);
  }

  // Step 3: Copy skill directory
  log.info("Installing cursor-memory skill...");
  const skillSrc = path.join(TEMPLATES_DIR, "skills", "cursor-memory");
  const skillDest = path.join(targetDir, "skills", "cursor-memory");
  copyDir(skillSrc, skillDest);
  log.success(`Skill installed at ${skillDest}`);

  // Step 4: Copy command file
  log.info("Installing catch-memory command...");
  const cmdSrc = path.join(TEMPLATES_DIR, "commands", "catch-memory.md");
  const cmdDest = path.join(targetDir, "commands", "catch-memory.md");
  copyFile(cmdSrc, cmdDest);
  log.success(`Command installed at ${cmdDest}`);

  // Summary
  console.log("");
  log.success("cursor-memory setup complete!");
  log.dim("Components installed:");
  log.dim(`  - hooks.json (merged)`);
  log.dim(`  - hooks/${HOOK_SCRIPT_NAME} (executable)`);
  log.dim(`  - skills/cursor-memory/ (SKILL.md, README.md)`);
  log.dim(`  - commands/catch-memory.md`);
}
