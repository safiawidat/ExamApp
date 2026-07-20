import { config, validateRuntimeConfig } from './config.js';

validateRuntimeConfig();

const { app } = await import('./app.js');

app.listen(config.port, () => {
  console.log(`Server listening on port ${config.port}`);
});
