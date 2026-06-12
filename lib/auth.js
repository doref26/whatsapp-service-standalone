/**
 * Optional API key authentication for outbound-facing REST endpoints.
 * When API_KEY is unset, all routes remain open (local dev convenience).
 */
export function createAuthMiddleware(config) {
  const apiKey = (config.api?.apiKey || '').trim();

  return function apiKeyAuth(req, res, next) {
    if (!apiKey) return next();

    const publicPaths = ['/api/status', '/api/qr', '/health', '/settings/voice', '/api/tts/settings', '/api/tts/voices', '/api/tts/settings/preview'];
    if (publicPaths.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
      return next();
    }

    const headerKey = req.headers['x-api-key'] || req.headers['authorization']?.replace(/^Bearer\s+/i, '');
    if (headerKey === apiKey) return next();

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Provide a valid API key via X-API-Key header or Authorization: Bearer <key>',
    });
  };
}
