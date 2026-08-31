import { ServiceModule } from '../../mcp/types.js';
import { firestoreTools } from './tools/index.js';
import { firestoreService } from './client.js';
import { getFirestoreConfig } from './config.js';

export * from './config.js';
export * from './client.js';
export * from './errors.js';
export * from './tools/index.js';

export const firestoreModule: ServiceModule = {
  name: 'firestore',
  tools: firestoreTools,
  initialize: async () => {
    await getFirestoreConfig();
  },
};
