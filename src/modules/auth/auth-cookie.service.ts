import { Injectable } from '@nestjs/common';
import type { CookieOptions, Response } from 'express';
import { AppConfigService } from '@infrastructure/config/app-config.service';
import { COOKIE } from '@shared/constants/http.constants';

/**
 * Sets and clears the auth cookies.
 *
 * **Why cookies are the default transport for browsers** (the trade-off the
 * brief asks about, in full in docs/AUTH.md):
 *
 *  - `localStorage` is readable by any script on the page. One XSS — including
 *    one in a third-party dependency you did not write — and the token is
 *    exfiltrated. There is no mitigation; that is what the API is for.
 *  - An `HttpOnly` cookie is not reachable from JavaScript at all, so the same
 *    XSS can only *use* the session while the victim is on the page, not steal
 *    it for later. That is a large reduction in blast radius.
 *  - The cost is CSRF, which cookies reintroduce and localStorage does not
 *    have. `SameSite=Lax` handles it for the top-level navigation case, and
 *    this API is JSON-only with no form endpoints, so a cross-site `<form>`
 *    POST cannot produce a request the server will accept. For a deployment
 *    where the frontend is on a different site and `SameSite=None` is required,
 *    add a double-submit CSRF token — see docs/AUTH.md.
 *
 * Non-browser clients (mobile, service-to-service) set
 * `AUTH_COOKIE_ENABLED=false` and take the tokens from the response body, where
 * none of the above applies.
 */
@Injectable()
export class AuthCookieService {
  constructor(private readonly config: AppConfigService) {}

  get enabled(): boolean {
    return this.config.cookies.enabled;
  }

  setAuthCookies(response: Response, tokens: { accessToken: string; refreshToken: string }): void {
    if (!this.enabled) return;

    response.cookie(COOKIE.ACCESS_TOKEN, tokens.accessToken, {
      ...this.baseOptions(),
      maxAge: this.config.jwt.accessTtlS * 1000,
      // Sent on every request, so it is scoped to the whole API.
      path: '/',
    });

    response.cookie(COOKIE.REFRESH_TOKEN, tokens.refreshToken, {
      ...this.baseOptions(),
      maxAge: this.config.jwt.refreshTtlS * 1000,
      // Narrow path: the refresh token is only ever presented to the refresh
      // and logout endpoints, so the browser never attaches it to anything
      // else. A leak in any other handler's logging cannot expose it.
      path: `${this.config.apiBasePath}/auth`,
    });
  }

  clearAuthCookies(response: Response): void {
    if (!this.enabled) return;

    // The clear must match the original path exactly or the browser keeps the
    // cookie and the user stays "logged in" from its point of view.
    response.clearCookie(COOKIE.ACCESS_TOKEN, { ...this.baseOptions(), path: '/' });
    response.clearCookie(COOKIE.REFRESH_TOKEN, {
      ...this.baseOptions(),
      path: `${this.config.apiBasePath}/auth`,
    });
  }

  private baseOptions(): CookieOptions {
    return {
      // The whole point: unreadable from JavaScript.
      httpOnly: true,
      // Forced true in production by the env schema — a Secure-less auth cookie
      // travels in plaintext on the first request to an http:// URL.
      secure: this.config.cookies.secure,
      sameSite: this.config.cookies.sameSite,
      ...(this.config.cookies.domain ? { domain: this.config.cookies.domain } : {}),
    };
  }
}
