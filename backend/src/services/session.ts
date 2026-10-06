import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { CookieOptions } from 'express';
import type { Config } from '../config.js';

const ISSUER = 'church-birthday-backend';
const AUDIENCE = 'church-birthday-dashboard';

export interface SessionUser {
  username: string;
  jti: string;
  /** Expiry, seconds since epoch. */
  exp: number;
}

/**
 * Issues and verifies session JWTs. Logout revokes the token's jti in memory
 * until it would have expired anyway; rotating JWT_SECRET revokes everything.
 */
export class SessionService extends EventEmitter {
  readonly cookieName: string;
  private readonly revoked = new Map<string, number>();
  private readonly sweep: NodeJS.Timeout;

  constructor(private readonly config: Config) {
    super();
    this.setMaxListeners(100); // one listener per open SSE stream
    // `__Host-` cookies must be Secure, path=/ and host-only: the browser then
    // refuses any attempt by a sibling subdomain to overwrite them.
    this.cookieName = config.NODE_ENV === 'production' ? '__Host-cbd_session' : 'cbd_session';
    this.sweep = setInterval(() => this.pruneRevoked(), 10 * 60_000);
    this.sweep.unref();
  }

  get ttlSeconds(): number {
    return Math.floor(this.config.JWT_TTL_HOURS * 3600);
  }

  issue(username: string): string {
    return jwt.sign({}, this.config.JWT_SECRET, {
      algorithm: 'HS256',
      subject: username,
      jwtid: randomUUID(),
      issuer: ISSUER,
      audience: AUDIENCE,
      expiresIn: this.ttlSeconds,
    });
  }

  /** Returns the session or null; never throws. */
  verify(token: unknown): SessionUser | null {
    if (typeof token !== 'string' || token.length === 0 || token.length > 2048) return null;
    try {
      const payload = jwt.verify(token, this.config.JWT_SECRET, {
        algorithms: ['HS256'],
        issuer: ISSUER,
        audience: AUDIENCE,
      });
      if (typeof payload !== 'object' || !payload.sub || !payload.jti || !payload.exp) return null;
      // A token for a previous ADMIN_USERNAME stops working when it is changed.
      if (payload.sub !== this.config.ADMIN_USERNAME) return null;
      if (this.revoked.has(payload.jti)) return null;
      return { username: payload.sub, jti: payload.jti, exp: payload.exp };
    } catch {
      return null;
    }
  }

  revoke(user: SessionUser): void {
    this.revoked.set(user.jti, user.exp);
    this.emit('revoked', user.jti);
  }

  cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.config.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: this.ttlSeconds * 1000,
    };
  }

  clearCookieOptions(): CookieOptions {
    const { maxAge: _maxAge, ...rest } = this.cookieOptions();
    return rest;
  }

  close(): void {
    clearInterval(this.sweep);
  }

  private pruneRevoked(): void {
    const now = Date.now() / 1000;
    for (const [jti, exp] of this.revoked) if (exp < now) this.revoked.delete(jti);
  }
}
