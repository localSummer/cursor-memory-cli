#!/usr/bin/env node

import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { runSetup } from "./lib/setup.mjs";
import * as log from "./lib/logger.mjs";
import { select } from "./lib/ui.mjs";
import { resolveTargetDir, DEFAULT_SERVE_PORT } from "./lib/constants.mjs";
import { runSearchCommand, SearchCommandError } from "./lib/search-command.mjs";

const USAGE = `Usage: node cli/cursor-memory-cli/index.mjs <command> [options]

Commands:
  setup     Install cursor-memory components
  archive   Run memory archive manually
  serve     Start memory preview server
  search    Search stored memories from the terminal

Options:
  --global    Install to ~/.cursor/ (user-level)
  --local     Install to ./.cursor/ (project-level)
  --dry-run   Preview archive without moving files (archive command)
  --threshold <days>  Override retention days (archive command)
  --limit <n>  Override result limit (archive/search commands)
  --root <path>  Search root directory (search command)
  --port <n>  Server port (default: 3000, serve command only)
  --help      Show help message

If neither --global nor --local is specified, you will be prompted to choose.`;

function parseArgs() {
  const args = process.argv.slice(2);
  let command = null;
  let mode = null;
  let dryRun = false;
  let threshold = null;
  let limit = null;
  let rootPath = null;
  let port = null;
  const searchTerms = [];
  const seenFlags = {
    dryRun: false,
    threshold: false,
    limit: false,
    root: false,
    port: false,
  };

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (!command && arg === "setup") {
      command = "setup";
    } else if (!command && arg === "archive") {
      command = "archive";
    } else if (!command && arg === "serve") {
      command = "serve";
    } else if (!command && arg === "search") {
      command = "search";
    } else if (arg === "--global") {
      mode = "global";
    } else if (arg === "--local") {
      mode = "local";
    } else if (arg === "--dry-run") {
      seenFlags.dryRun = true;
      dryRun = true;
    } else if (arg === "--threshold") {
      seenFlags.threshold = true;
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        log.error("--threshold requires a number argument");
        process.exit(1);
      }
      threshold = Number(value);
      i += 1;
    } else if (arg === "--limit") {
      seenFlags.limit = true;
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        log.error("--limit requires a number argument");
        process.exit(1);
      }
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed <= 0) {
        log.error(`Invalid limit: ${value}`);
        process.exit(1);
      }
      limit = parsed;
      i += 1;
    } else if (arg === "--root") {
      seenFlags.root = true;
      const value = args[i + 1];
      if (!value || value.startsWith("--")) {
        log.error("--root requires a path argument");
        process.exit(1);
      }
      rootPath = value;
      i += 1;
    } else if (arg === "--port") {
      seenFlags.port = true;
      const value = args[i + 1];
      if (value && !value.startsWith("--")) {
        const parsed = Number(value);
        if (!Number.isInteger(parsed) || parsed <= 0) {
          log.error(`Invalid port number: ${value}`);
          process.exit(1);
        }
        port = parsed;
        i += 1;
      } else {
        log.error("--port requires a number argument");
        process.exit(1);
      }
    } else if (arg === "--help" || arg === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else if (command === "serve" && !arg.startsWith("-")) {
      if (!rootPath) {
        rootPath = arg;
      }
    } else if (command === "search" && !arg.startsWith("-")) {
      searchTerms.push(arg);
    } else {
      log.error(`Unknown argument: ${arg}`);
      console.log(USAGE);
      process.exit(1);
    }
  }

  if (command === "serve" && mode) {
    log.error("--global/--local cannot be used with serve command");
    process.exit(1);
  }

  if (command === "search") {
    if (mode) {
      log.error("--global/--local cannot be used with search command");
      process.exit(1);
    }
    if (seenFlags.dryRun || seenFlags.threshold || seenFlags.port) {
      log.error("search only supports --root and --limit");
      process.exit(1);
    }
  }

  return { command, mode, dryRun, threshold, limit, rootPath, port, searchTerms };
}

async function promptMode() {
  console.log("");
  return select({
    question: "Where would you like to install cursor-memory?",
    options: [
      {
        label: "Global (~/.cursor/) - applies to all projects",
        value: "global",
      },
      {
        label: "Local  (./.cursor/) - applies to current project only",
        value: "local",
      },
    ],
    defaultIndex: 0,
  });
}

async function main() {
  const {
    command,
    mode,
    dryRun,
    threshold,
    limit,
    rootPath: parsedRootPath,
    port: parsedPort,
    searchTerms,
  } = parseArgs();

  if (!command) {
    log.error("No command specified.");
    console.log(USAGE);
    process.exit(1);
  }

  if (command !== "setup" && command !== "archive" && command !== "serve" && command !== "search") {
    log.error(`Unknown command: ${command}`);
    console.log(USAGE);
    process.exit(1);
  }

  if (command === "serve") {
    const rootPath = parsedRootPath || process.cwd();
    try {
      fs.accessSync(rootPath, fs.constants.R_OK);
    } catch {
      log.error(`Root directory not found or not readable: ${rootPath}`);
      process.exit(1);
    }
    const port = parsedPort || DEFAULT_SERVE_PORT;
    try {
      const { startServer } = await import("./lib/server.mjs");
      await startServer(rootPath, port);
    } catch (err) {
      log.error(err.message);
      process.exit(1);
    }
    return;
  }

  if (command === "search") {
    try {
      runSearchCommand({
        searchTerms,
        rootPath: parsedRootPath,
        limit,
        cwd: process.cwd(),
      });
      return;
    } catch (err) {
      if (err instanceof SearchCommandError) {
        log.error(err.message);
        if (err.showUsage) {
          console.log(USAGE);
        }
        process.exit(1);
      }
      log.error(`Search failed: ${err.message}`);
      process.exit(1);
    }
  }

  let resolvedMode = mode;
  if (!resolvedMode) {
    resolvedMode = await promptMode();
  }

  try {
    if (command === "setup") {
      runSetup(resolvedMode);
      return;
    }

    const targetDir = resolveTargetDir(resolvedMode);
    const runnerPath = path.join(
      targetDir,
      "hooks",
      "cursor-memory-archive.mjs",
    );
    if (!fs.existsSync(runnerPath)) {
      throw new Error(
        `Archive runner not found at ${runnerPath}. Run setup first.`,
      );
    }

    const args = [
      runnerPath,
      "--project-root",
      process.cwd(),
      "--cursor-dir",
      targetDir,
    ];
    if (dryRun) args.push("--dry-run");
    if (Number.isFinite(threshold)) {
      args.push("--threshold", String(threshold));
    }
    if (Number.isFinite(limit)) {
      args.push("--limit", String(limit));
    }

    const result = spawnSync("node", args, { stdio: "inherit" });
    if (result.status !== 0) {
      throw new Error("Archive command failed.");
    }
  } catch (err) {
    log.error(err.message);
    process.exit(1);
  }
}

main();
