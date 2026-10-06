import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { MulterError } from 'multer';
import { AppError } from '../lib/errors.js';

export function zodDetails(err: ZodError) {
  return err.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
}

export const notFound: RequestHandler = (_req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Route not found'));
};

/** Every error leaves the API as { success:false, error:{ code, message, details? }, request_id }. */
export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  if (res.headersSent) return next(err);

  let appErr: AppError;
  if (err instanceof AppError) {
    appErr = err;
  } else if (err instanceof ZodError) {
    appErr = new AppError(400, 'VALIDATION_ERROR', 'Request validation failed', zodDetails(err));
  } else if (err instanceof MulterError) {
    appErr =
      err.code === 'LIMIT_FILE_SIZE'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'CSV file exceeds 2 MB')
        : new AppError(400, 'VALIDATION_ERROR', `Invalid upload: ${err.code}`);
  } else if (isBodyParserError(err)) {
    appErr =
      err.type === 'entity.too.large'
        ? new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body too large')
        : new AppError(400, 'INVALID_BODY', 'Malformed request body');
  } else {
    req.log?.error({ err }, 'unhandled error');
    appErr = new AppError(500, 'INTERNAL_ERROR', 'Internal server error');
  }

  if (appErr.status >= 500 && err instanceof AppError) {
    req.log?.error({ code: appErr.code }, appErr.message);
  }

  res.status(appErr.status).json({
    success: false,
    error: {
      code: appErr.code,
      message: appErr.message,
      ...(appErr.details ? { details: appErr.details } : {}),
    },
    request_id: req.id,
  });
};

function isBodyParserError(err: unknown): err is { type: string; status: number } {
  return typeof err === 'object' && err !== null && typeof (err as { type?: unknown }).type === 'string' && 'status' in err;
}
