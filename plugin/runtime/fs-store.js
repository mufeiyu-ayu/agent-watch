import { chmod, copyFile, mkdir, open, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

export async function readJson(path, fallback = undefined) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT' && fallback !== undefined) {
      return structuredClone(fallback);
    }
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in ${path}: ${error.message}`);
    }
    throw error;
  }
}

export async function pathExists(path) {
  try {
    await stat(path);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}

export async function atomicWriteJson(path, value, { mode = 0o600, backup = false } = {}) {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });

  let backupPath;
  if (backup && await pathExists(path)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    backupPath = `${path}.agent-watch.${timestamp}.bak`;
    await copyFile(path, backupPath);
    await chmod(backupPath, mode);
  }

  const tempPath = join(dirname(path), `.${randomUUID()}.tmp`);
  const serialized = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tempPath, serialized, { encoding: 'utf8', mode });

  // Validate the exact bytes before replacing a user configuration file.
  JSON.parse(await readFile(tempPath, 'utf8'));

  const handle = await open(tempPath, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }

  await rename(tempPath, path);
  await chmod(path, mode);
  return { path, backupPath };
}

export async function removePath(path) {
  await rm(path, { recursive: true, force: true });
}
