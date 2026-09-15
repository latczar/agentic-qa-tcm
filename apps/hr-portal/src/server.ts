import { createApp } from './app.js';
import { loadConfig } from './config.js';
import { InMemoryStore } from './domain/store.js';

const config = loadConfig();
const store = new InMemoryStore();
const app = createApp(store, config);

app.listen(config.port, () => {
  console.log(
    `Harbour HR listening on http://localhost:${config.port} (test endpoints ${config.testMode ? 'on' : 'off'})`,
  );
});
