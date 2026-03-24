import type { JwtPayload } from './index';

/**
 * Module augmentation: adds `user` to every Express Request
 * so NestJS controllers typed with `@Request() req: Request` can safely
 * access `req.user` without casting to `any`.
 */
declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}
