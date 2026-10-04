import { z } from 'zod';
import {
  api,
  sameOrigin,
  requestJson,
  HttpError,
} from '../../../../lib/http.js';
import { authClient, demoLogin, isAdminEmail } from '../../../../lib/auth.js';
import { readEnv } from '../../../../lib/env.js';
import { rateLimit, requestIdentity } from '../../../../lib/security.js';
export const runtime = 'nodejs';
/** @param {Request} request */
export function POST(request) {
  return api(async () => {
    sameOrigin(request);
    await rateLimit(`login:${requestIdentity(request)}`, 5);
    const data = z
      .object({
        email: z.string().max(254),
        password: z.string().min(1).max(200),
      })
      .strict()
      .parse(await requestJson(request));
    if (readEnv().APP_MODE === 'demo') await demoLogin(data.password);
    else {
      if (!z.email().safeParse(data.email).success || !isAdminEmail(data.email))
        throw new HttpError(401, 'invalid_credentials');
      const { error } = await (
        await authClient()
      ).auth.signInWithPassword({ email: data.email, password: data.password });
      if (error) throw new HttpError(401, 'invalid_credentials');
    }
    return Response.json({ signedIn: true });
  });
}
