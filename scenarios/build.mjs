// Turns each scenario's readable candidate-N.ts into response-N.txt: the JSON object a model
// would emit, with the code included verbatim. Run: node scenarios/build.mjs
import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const ownerByField = { leave: 'LeavePage', leaveForm: 'LeaveFormPage', login: 'LoginPage', dashboard: 'DashboardPage' };

for (const dir of (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory())) {
  const folder = path.join(root, dir.name);
  const meta = JSON.parse(await readFile(path.join(folder, 'scenario.json'), 'utf8'));
  for (const file of (await readdir(folder)).filter((f) => /^candidate-\d+\.ts$/.test(f))) {
    const n = /\d+/.exec(file)[0];
    const code = await readFile(path.join(folder, file), 'utf8');
    const methods = [...new Set([...code.matchAll(/app\.(\w+)\.(\w+)\(/g)].map((m) => `${m[1]}.${m[2]}`))];
    const response = {
      testCaseId: meta.testCaseId,
      fileName: `tc-${meta.testCaseId.slice(3).toLowerCase()}-sick-leave-past-date.spec.ts`,
      title: 'Sick leave can be recorded for a day in the past',
      usedPageObjects: [...new Set(methods.map((m) => ownerByField[m.split('.')[0]] ?? m.split('.')[0]))],
      usedMethods: methods.map((m) => {
        const [field, method] = m.split('.');
        return `${ownerByField[field] ?? field}.${method}`;
      }),
      usedFixtures: ['app', 'signInAs'],
      code,
      assumptions: [],
      confidence: 0.8,
    };
    await writeFile(path.join(folder, `response-${n}.txt`), JSON.stringify(response, null, 2), 'utf8');
  }
}
console.log('scenario responses built');
