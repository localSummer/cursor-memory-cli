import fs from 'node:fs';
import path from 'node:path';

export function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

export function copyDir(src, dest) {
  fs.cpSync(src, dest, { recursive: true, force: true });
}

export function makeExecutable(filePath) {
  const stat = fs.statSync(filePath);
  fs.chmodSync(filePath, stat.mode | 0o111);
}
