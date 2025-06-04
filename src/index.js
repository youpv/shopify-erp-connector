import { createServer } from './server.js';
import { config } from './config.js';
import { startWorker } from './productSync.js';

const app = createServer();

app.listen(config.port, () => {
  console.log(`Server listening on ${config.port}`);
});

startWorker();
