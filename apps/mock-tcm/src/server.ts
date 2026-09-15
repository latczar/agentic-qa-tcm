import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { createPool, migrate } from './db.js';
import { loadSeedCases } from './domain/seed-loader.js';
import { CaseRepository } from './repo/cases.js';

const config = loadConfig();
const db = createPool(config.databaseUrl);
await migrate(db);

const seed = await loadSeedCases(config.seedDir);
const repo = new CaseRepository(db);
if ((await repo.count()) === 0) {
  await repo.replaceAll(seed);
  console.log(`Seeded ${seed.length} test cases`);
}

createApp(repo, seed, config).listen(config.port, () => {
  console.log(
    `Mock TCM listening on http://localhost:${config.port} (test endpoints ${config.testMode ? 'on' : 'off'})`,
  );
});
