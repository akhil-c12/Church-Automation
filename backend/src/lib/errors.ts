export type ErrorDetail = { path?: string; row?: number; message: string } | string;

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const validationError = (details: ErrorDetail[], message = 'Request validation failed') =>
  new AppError(400, 'VALIDATION_ERROR', message, details);
