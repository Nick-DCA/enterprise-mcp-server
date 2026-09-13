import { Router } from 'express';
import { authApiRouter } from './auth.js';
import { servicesApiRouter } from './services.js';
import { secretsApiRouter } from './secrets.js';
import { usersApiRouter } from './users.js';
import { auditApiRouter } from './audit.js';
import { setupApiRouter } from './setup.js';
import { slackConnectorRouter } from './connectors/slack.js';
import { userLogsApiRouter } from './userLogs.js';

export const adminApiRouter = Router();

adminApiRouter.use('/setup', setupApiRouter);
adminApiRouter.use('/auth', authApiRouter);
adminApiRouter.use('/services', servicesApiRouter);
adminApiRouter.use('/secrets', secretsApiRouter);
adminApiRouter.use('/users', usersApiRouter);
adminApiRouter.use('/audit', auditApiRouter);
adminApiRouter.use('/logs/user', userLogsApiRouter);
adminApiRouter.use('/connectors/slack', slackConnectorRouter);
