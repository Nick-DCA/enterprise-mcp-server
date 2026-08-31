import { Request, Response, NextFunction } from 'express';

/**
 * Normalizes Accept header for MCP SDK compatibility on StreamableHTTP requests.
 * Ensures 'application/json, text/event-stream' is present.
 */
export function acceptHeaderMiddleware(req: Request, _res: Response, next: NextFunction) {
  if (req.path === '/mcp' || req.path === '/' || req.method === 'POST') {
    const accept = req.headers['accept'] || '';
    if (!accept.includes('application/json') || !accept.includes('text/event-stream')) {
      const normalizedAccept = 'application/json, text/event-stream';
      req.headers['accept'] = normalizedAccept;
      if (req.rawHeaders) {
        let found = false;
        for (let i = 0; i < req.rawHeaders.length; i += 2) {
          if (req.rawHeaders[i].toLowerCase() === 'accept') {
            req.rawHeaders[i + 1] = normalizedAccept;
            found = true;
            break;
          }
        }
        if (!found) {
          req.rawHeaders.push('Accept', normalizedAccept);
        }
      }
    }
  }
  next();
}
