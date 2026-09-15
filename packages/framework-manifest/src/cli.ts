import { readFile } from 'node:fs/promises';
import { extractManifest } from './extract.js';
import {
  DEFAULT_FRAMEWORK_LABEL,
  DEFAULT_FRAMEWORK_ROOT,
  DEFAULT_MANIFEST_PATH,
  serialiseManifest,
  writeManifest,
} from './manifest-file.js';

/**
 * build  writes framework-manifest.json from the framework source.
 * check  regenerates in memory and exits 1 if the committed file differs. Runs in CI.
 */
const command = process.argv[2];
const manifest = extractManifest({
  frameworkRoot: DEFAULT_FRAMEWORK_ROOT,
  frameworkLabel: DEFAULT_FRAMEWORK_LABEL,
});

if (command === 'build') {
  await writeManifest(manifest);
  console.log(
    `Wrote ${DEFAULT_MANIFEST_PATH}: ${manifest.pageObjects.length} page objects, ` +
      `${manifest.pageObjects.reduce((n, p) => n + p.methods.length, 0)} methods, ` +
      `${manifest.fixtures.length} fixtures, ${manifest.examples.length} example files.`,
  );
} else if (command === 'check') {
  const expected = serialiseManifest(manifest);
  const actual = await readFile(DEFAULT_MANIFEST_PATH, 'utf8').catch(() => '');
  if (actual === expected) {
    console.log('framework-manifest.json is up to date.');
  } else {
    console.error(
      'framework-manifest.json is out of date with the framework source. Run "npm run manifest:build" and commit the result.',
    );
    process.exit(1);
  }
} else {
  console.error('Usage: cli.ts build | check');
  process.exit(2);
}
