import { UnauthorizedException } from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import type { JwtPayload } from '@/common/types';

export const getAuthenticatedUser = (req: ExpressRequest): JwtPayload => {
  if (!req.user) {
    throw new UnauthorizedException('Authentication required');
  }

  return req.user;
};
