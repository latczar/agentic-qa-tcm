import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FrameworkManifest } from './types.js';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const repoRoot = path.resolve(packageRoot, '..', '..');

/** Where the committed manifest lives. */
export const DEFAULT_MANIFEST_PATH = path.join(packageRoot, 'framework-manifest.json');

/** The framework the manifest describes. */
export const DEFAULT_FRAMEWORK_ROOT = path.join(repoRoot, 'packages', 'e2e-framework');
export const DEFAULT_FRAMEWORK_LABEL = 'packages/e2e-framework';

export function serialiseManifest(manifest: FrameworkManifest): string {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

export async function writeManifest(manifest: FrameworkManifest, file = DEFAULT_MANIFEST_PATH) {
  await writeFile(file, serialiseManifest(manifest), 'utf8');
}

export async function loadManifest(file = DEFAULT_MANIFEST_PATH): Promise<FrameworkManifest> {
  let text: string;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    throw new Error(
      `Manifest not found at ${file}. Run "npm run manifest:build" to generate it from the framework.`,
    );
  }
  const parsed = JSON.parse(text) as FrameworkManifest;
  if (parsed.schemaVersion !== 1) {
    throw new Error(`Unsupported manifest schemaVersion ${String(parsed.schemaVersion)}`);
  }
  return parsed;
}
