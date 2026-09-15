import { spawn } from 'node:child_process';
import path from 'node:path';
import { repoRoot } from '@aiqa/framework-manifest';

export interface CommandResult {
  code: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
}

/**
 * Runs a Node-based tool by its JavaScript entry point, so the same code works on Windows and
 * Linux without a shell and without .cmd shims.
 */
export function toolEntry(name: 'tsc' | 'eslint' | 'playwright'): string {
  const entries = {
    tsc: 'typescript/bin/tsc',
    eslint: 'eslint/bin/eslint.js',
    playwright: 'playwright/cli.js',
  };
  return path.join(repoRoot, 'node_modules', entries[name]);
}

export function runNode(
  entry: string,
  args: string[],
  options: { cwd: string; env?: NodeJS.ProcessEnv; timeoutMs: number },
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, [entry, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, options.timeoutMs);
    child.stdout.on('data', (d: Buffer) => (stdout += d.toString()));
    child.stderr.on('data', (d: Buffer) => (stderr += d.toString()));
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, durationMs: Date.now() - started, timedOut });
    });
  });
}

export function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\[[0-9;]*m/g, '');
}
