import { Router, Request, Response } from 'express';
import { runtimeConfig, ServiceId } from '../../../config/runtimeConfig.js';
import { requireAdminAuth } from '../../middleware/adminAuth.js';
import { logger } from '../../../utils/logger.js';

export const usersApiRouter = Router();

usersApiRouter.use(requireAdminAuth);

/**
 * GET /api/users
 * Returns list of all authorized users and their permission sets.
 */
usersApiRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const users = await runtimeConfig.getAllUsers();
    res.json({
      success: true,
      users,
      totalUsers: users.length,
      activeUsers: users.filter((u) => u.isEnabled).length,
      adminUsers: users.filter((u) => u.isAdmin).length,
    });
  } catch (error: any) {
    logger.error({ error }, 'Failed to fetch users list');
    res.status(500).json({ error: 'FetchUsersFailed', message: error.message });
  }
});

/**
 * POST /api/users
 * Adds a new user to the platform access directory.
 */
usersApiRouter.post('/', async (req: Request, res: Response) => {
  const {
    userEmail,
    fullName,
    isAdmin = false,
    isEnabled = true,
    allowedServices = ['xero', 'bigquery', 'firestore', 'sagehr', 'slack'],
    readOnlyOnly = false,
    customDeniedTools = [],
  } = req.body || {};

  if (!userEmail || typeof userEmail !== 'string' || !userEmail.includes('@')) {
    return res.status(400).json({ error: 'BadRequest', message: 'Valid "userEmail" is required' });
  }

  const cleanEmail = userEmail.trim().toLowerCase();
  const actorEmail = req.adminUser?.email || 'system';

  try {
    const existing = await runtimeConfig.getUserAccess(cleanEmail);
    if (existing) {
      return res.status(409).json({ error: 'Conflict', message: `User '${cleanEmail}' already exists` });
    }

    const created = await runtimeConfig.createUserAccess(
      {
        userEmail: cleanEmail,
        fullName: fullName || cleanEmail.split('@')[0],
        isAdmin: Boolean(isAdmin),
        isEnabled: Boolean(isEnabled),
        allowedServices: allowedServices as ServiceId[],
        readOnlyOnly: Boolean(readOnlyOnly),
        customDeniedTools: Array.isArray(customDeniedTools) ? customDeniedTools : [],
      },
      actorEmail
    );

    res.status(201).json({
      success: true,
      user: created,
      message: `User '${cleanEmail}' added to access directory`,
    });
  } catch (error: any) {
    logger.error({ error, email: cleanEmail }, 'Failed to create user access record');
    res.status(500).json({ error: 'CreateUserFailed', message: error.message });
  }
});

/**
 * PATCH /api/users/:email/toggle
 * Enables or disables access for a specific user.
 */
usersApiRouter.patch('/:email/toggle', async (req: Request, res: Response) => {
  const email = req.params.email?.trim().toLowerCase();
  const { isEnabled } = req.body || {};

  if (typeof isEnabled !== 'boolean') {
    return res.status(400).json({ error: 'BadRequest', message: 'Field "isEnabled" (boolean) is required' });
  }

  const actorEmail = req.adminUser?.email || 'system';

  // Prevent admin from disabling themselves
  if (email === actorEmail.toLowerCase() && !isEnabled) {
    return res.status(400).json({ error: 'SelfActionDisallowed', message: 'You cannot disable your own administrator account' });
  }

  try {
    const updated = await runtimeConfig.toggleUserAccess(email, isEnabled, actorEmail);
    res.json({
      success: true,
      user: updated,
      message: `User '${email}' has been ${isEnabled ? 'ENABLED' : 'DISABLED'}`,
    });
  } catch (error: any) {
    logger.error({ error, email }, 'Failed to toggle user status');
    res.status(500).json({ error: 'ToggleUserFailed', message: error.message });
  }
});

/**
 * PUT /api/users/:email/permissions
 * Updates permissions, allowed services, and read-only flags for a user.
 */
usersApiRouter.put('/:email/permissions', async (req: Request, res: Response) => {
  const email = req.params.email?.trim().toLowerCase();
  const { fullName, isAdmin, allowedServices, readOnlyOnly, customDeniedTools } = req.body || {};

  const actorEmail = req.adminUser?.email || 'system';

  // Prevent admin from revoking their own administrator role (self-demotion)
  if (email === actorEmail.toLowerCase() && isAdmin === false) {
    return res.status(400).json({
      error: 'SelfActionDisallowed',
      message: 'You cannot revoke your own administrator privileges',
    });
  }

  try {
    const updated = await runtimeConfig.updateUserPermissions(
      email,
      {
        fullName,
        isAdmin,
        allowedServices,
        readOnlyOnly,
        customDeniedTools,
      },
      actorEmail
    );

    res.json({
      success: true,
      user: updated,
      message: `Permissions updated for '${email}'`,
    });
  } catch (error: any) {
    logger.error({ error, email }, 'Failed to update user permissions');
    res.status(500).json({ error: 'UpdatePermissionsFailed', message: error.message });
  }
});

/**
 * POST /api/users/:email/revoke-sessions
 * Instantly revokes all active sessions for a specific user.
 */
usersApiRouter.post('/:email/revoke-sessions', async (req: Request, res: Response) => {
  const email = req.params.email?.trim().toLowerCase();
  const actorEmail = req.adminUser?.email || 'system';

  try {
    const user = await runtimeConfig.getUserAccess(email);
    if (!user) {
      return res.status(404).json({ error: 'UserNotFound', message: `User '${email}' not found` });
    }

    const revokedCount = await runtimeConfig.revokeUserSessions(email);

    await runtimeConfig.logAudit('SESSION_REVOKE', actorEmail, `users_access/${email}`, {
      userEmail: email,
      revokedCount,
    });

    res.json({
      success: true,
      revokedCount,
      message: `Successfully revoked ${revokedCount} active session(s) for user '${email}'`,
    });
  } catch (error: any) {
    logger.error({ error, email }, 'Failed to revoke user sessions');
    res.status(500).json({ error: 'RevokeSessionsFailed', message: error.message });
  }
});

/**
 * DELETE /api/users/:email
 * Removes a user from the access directory.
 */
usersApiRouter.delete('/:email', async (req: Request, res: Response) => {
  const email = req.params.email?.trim().toLowerCase();
  const actorEmail = req.adminUser?.email || 'system';

  if (email === actorEmail.toLowerCase()) {
    return res.status(400).json({ error: 'SelfActionDisallowed', message: 'You cannot delete your own administrator account' });
  }

  try {
    await runtimeConfig.deleteUserAccess(email, actorEmail);
    res.json({
      success: true,
      message: `User '${email}' removed from platform access`,
    });
  } catch (error: any) {
    logger.error({ error, email }, 'Failed to delete user');
    res.status(500).json({ error: 'DeleteUserFailed', message: error.message });
  }
});
