import type { Client } from 'chrome-remote-interface';
import { existsSync, statSync, realpathSync } from 'fs';
import { resolve, normalize } from 'path';

const DEFAULT_UPLOAD_ROOTS = [process.cwd()];

function getUploadRoots(): string[] {
  const env = process.env.PILOT_UPLOAD_ROOTS;
  if (env) {
    return env
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
      .map((p) => resolve(p));
  }
  return DEFAULT_UPLOAD_ROOTS;
}

function isUnderAllowedRoot(filePath: string, roots: string[]): boolean {
  const resolved = realpathSync(filePath);
  // Use path separator boundary to prevent "/allowed" matching "/allowed_evil"
  return roots.some(
    (root) => resolved === root || resolved.startsWith(root + '/')
  );
}

export function validateUploadFiles(files: string[]): void {
  const roots = getUploadRoots();

  for (const file of files) {
    const normalized = normalize(resolve(file));

    if (!existsSync(normalized)) {
      throw new Error(`Upload file not found: ${file}`);
    }

    const stat = statSync(normalized);
    if (!stat.isFile()) {
      throw new Error(`Upload path is not a regular file: ${file}`);
    }

    if (!isUnderAllowedRoot(normalized, roots)) {
      throw new Error(
        `Upload file "${file}" is outside allowed roots. Set PILOT_UPLOAD_ROOTS to configure allowed directories.`
      );
    }
  }
}

export async function uploadFiles(
  client: Client,
  backendNodeId: number,
  files: string[]
): Promise<void> {
  const resolved = files.map((f) => resolve(f));
  await client.DOM.setFileInputFiles({
    files: resolved,
    backendNodeId
  });
}
