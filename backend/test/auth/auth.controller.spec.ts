import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from '@/auth/auth.controller';
import { AuthService } from '@/auth/auth.service';
import { JwtAuthGuard } from '@/auth/jwt-auth.guard';
import { UnauthorizedException, HttpException } from '@nestjs/common';
import { vi, describe, beforeEach, it, expect } from 'vitest';

describe('AuthController', () => {
  let controller: AuthController;
  let service: {
    login: ReturnType<typeof vi.fn>;
    validateUser: ReturnType<typeof vi.fn>;
    getUserById: ReturnType<typeof vi.fn>;
    createUser: ReturnType<typeof vi.fn>;
    createGuestUser: ReturnType<typeof vi.fn>;
    blacklistToken: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    service = {
      login: vi.fn().mockResolvedValue({
        access_token: 'token',
        role: 'user',
        username: 'test',
      }),
      validateUser: vi.fn(),
      getUserById: vi.fn(),
      createUser: vi.fn().mockResolvedValue(true),
      createGuestUser: vi
        .fn()
        .mockResolvedValue({ id: 'guest-uuid', username: 'guest_abc123' }),
      blacklistToken: vi.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  // ─── POST /token (login) ─────────────────────────────────────────────────────

  describe('POST /token (login)', () => {
    it('returns access_token on valid credentials', async () => {
      service.validateUser.mockResolvedValue({
        id: 'u1',
        username: 'admin',
        role: 'admin',
      });
      const result = await controller.login({
        username: 'admin',
        password: 'pass',
      });
      expect(result).toHaveProperty('access_token');
      expect(service.login).toHaveBeenCalledWith({
        id: 'u1',
        username: 'admin',
        role: 'admin',
      });
    });

    it('throws UnauthorizedException when credentials are invalid', async () => {
      service.validateUser.mockResolvedValue(null);
      await expect(
        controller.login({ username: 'bad', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── POST /register ──────────────────────────────────────────────────────────

  describe('POST /register', () => {
    it('creates user and returns token', async () => {
      service.validateUser.mockResolvedValue({
        id: 'u1',
        username: 'newuser',
        role: 'user',
      });
      const result = await controller.register({
        username: 'newuser',
        password: 'pass',
      });
      expect(result).toHaveProperty('access_token');
      expect(service.createUser).toHaveBeenCalledWith(
        'newuser',
        'pass',
        undefined,
        undefined,
      );
    });

    it('throws HttpException (400) when username is already registered', async () => {
      service.createUser.mockResolvedValue(false);
      await expect(
        controller.register({ username: 'existing', password: 'pass' }),
      ).rejects.toThrow(HttpException);
    });

    it('throws HttpException (500) when validateUser returns null after successful creation', async () => {
      service.createUser.mockResolvedValue(true);
      service.validateUser.mockResolvedValue(null);
      await expect(
        controller.register({ username: 'new', password: 'pass' }),
      ).rejects.toThrow(HttpException);
    });
  });

  // ─── POST /guest ─────────────────────────────────────────────────────────────

  describe('POST /guest', () => {
    it('creates a guest user and returns token', async () => {
      const result = await controller.loginGuest();
      expect(result).toHaveProperty('access_token');
      expect(service.createGuestUser).toHaveBeenCalled();
      expect(service.login).toHaveBeenCalledWith(
        expect.objectContaining({ username: 'guest_abc123', role: 'user' }),
      );
    });
  });

  // ─── POST /logout ────────────────────────────────────────────────────────────

  describe('POST /logout', () => {
    it('blacklists the bearer token and returns success message', async () => {
      const req = {
        headers: { authorization: 'Bearer my-jwt-token' },
        user: { id: 'u1' },
      } as unknown as import('express').Request;
      const result = await controller.logout(req);
      expect(result).toHaveProperty('message');
      expect(service.blacklistToken).toHaveBeenCalledWith(
        'my-jwt-token',
        expect.any(Date),
      );
    });

    it('throws UnauthorizedException when Authorization header is missing', async () => {
      const req = {
        headers: {},
        user: { id: 'u1' },
      } as unknown as import('express').Request;
      await expect(controller.logout(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  // ─── GET /me ─────────────────────────────────────────────────────────────────

  describe('GET /me', () => {
    it('returns user profile when the user exists', async () => {
      service.getUserById.mockResolvedValue({
        username: 'admin',
        email: 'a@b.com',
        fullName: 'Admin User',
        isActive: true,
        role: 'admin',
      });
      const req = {
        user: { id: 'u1' },
      } as unknown as import('express').Request;
      const result = await controller.getMe(req);
      expect(result).toMatchObject({
        username: 'admin',
        role: 'admin',
        disabled: false,
      });
    });

    it('throws UnauthorizedException when user is not found', async () => {
      service.getUserById.mockResolvedValue(null);
      const req = {
        user: { id: 'ghost' },
      } as unknown as import('express').Request;
      await expect(controller.getMe(req)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('returns full_name as null when fullName is absent', async () => {
      service.getUserById.mockResolvedValue({
        username: 'alice',
        email: null,
        fullName: null,
        isActive: true,
        role: 'user',
      });
      const req = {
        user: { id: 'u2' },
      } as unknown as import('express').Request;
      const result = await controller.getMe(req);
      expect(result.full_name).toBeNull();
    });
  });
});
