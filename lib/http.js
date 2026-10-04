import 'server-only';
import { ZodError } from 'zod';
import { readEnv } from './env.js';
import { logEvent } from './log.js';

export class HttpError extends Error {
  /** @param {number} status @param {string} code */
  constructor(status, code) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
/** @param {() => Promise<Response>} action */
export async function api(action) {
  try {
    const response = await action();
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    if (error instanceof ZodError)
      return Response.json(
        { error: 'invalid_input' },
        { status: 400, headers: { 'Cache-Control': 'no-store' } },
      );
    if (error instanceof HttpError)
      return Response.json(
        { error: error.code },
        { status: error.status, headers: { 'Cache-Control': 'no-store' } },
      );
    logEvent('request_failed', { code: 'internal_error' });
    return Response.json(
      { error: 'temporarily_unavailable' },
      { status: 503, headers: { 'Cache-Control': 'no-store' } },
    );
  }
}
/** @param {Request} request */
export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin || origin !== new URL(readEnv().NEXT_PUBLIC_SITE_URL).origin) {
    // Permit the explicitly local demo origin, including the browser-check host.
    if (
      readEnv().APP_MODE !== 'demo' ||
      !origin ||
      !['http://localhost:3000', 'http://127.0.0.1:3000'].includes(origin)
    )
      throw new HttpError(403, 'invalid_origin');
  }
}
/** @param {Request} request */
export async function requestJson(request) {
  if (!request.headers.get('content-type')?.includes('application/json'))
    throw new HttpError(415, 'json_required');
  const text = await request.text();
  if (text.length > 16384) throw new HttpError(413, 'request_too_large');
  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'invalid_input');
  }
}
