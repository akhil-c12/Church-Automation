import type { Request, Response } from 'express';

export function rateLimitHandler(message: string) {
  return (req: Request, res: Response) => {
    req.log?.warn({ event: 'rate_limited', path: req.path }, 'rate limited');
    res.status(429).json({ success: false, error: { code: 'RATE_LIMITED', message }, request_id: req.id });
  };
}
