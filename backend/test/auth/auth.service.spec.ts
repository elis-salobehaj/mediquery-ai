import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from '@/auth/auth.service';
import { DatabaseService } from '@/database/database.service';
import { JwtService } from '@nestjs/jwt';
import { vi, describe, beforeEach, beforeAll, it, expect } from 'vitest';

// Mock argon2 so we don't do real password hashing in unit tests
vi.mock('argon2', () => ({
  hash: vi.fn().mockResolvedValue('hashed-pass'),
  verify: vi.fn().mockResolvedValue(false), // default: password mismatch
}));

// Import the mocked module so tests can control its return values
import * as argon2 from 'argon2';

describe('AuthService', () => {
  let service: AuthService;
  let dbService: {
    pg: {
      select: ReturnType<typeof vi.fn>;
      insert: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
  };
  let jwtService: { sign: ReturnType<typeof vi.fn> };

  // Build a fluent Drizzle chain mock for select queries
  const makeSelectChain = (result: unknown[]) => ({
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        execute: vi.fn().mockResolvedValue(result),
      }),
    }),
  });

  // Build a fluent chain for insert (supports .values().execute() and .values().onConflictDoNothing().execute())
  const makeInsertChain = (result: unknown[] = []) => {
    const chain: Record<string, unknown> = {
      execute: vi.fn().mockResolvedValue(result),
    };
    for (const m of ['values', 'onConflictDoNothing', 'returning']) {
      chain[m] = vi.fn().mockReturnValue(chain);
    }
    return chain;
  };

  const dbUser = {
    id: 'u1',
    username: 'admin',
    hashedPassword: 'hashed-pass',
    role: 'admin',
    email: 'admin@test.com',
    fullName: 'Admin User',
    isActive: true,
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    dbService = {
      pg: {
        select: vi.fn().mockReturnValue(makeSelectChain([])),
        insert: vi.fn().mockReturnValue(makeInsertChain()),
        update: vi.fn().mockReturnValue({
          set: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              execute: vi.fn().mockResolvedValue([]),
            }),
          }),
        }),
      },
    };

    jwtService = { sign: vi.fn().mockReturnValue('mock-token') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: DatabaseService, useValue: dbService },
        { provide: JwtService, useValue: jwtService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ─── login ──────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('signs a JWT and returns access_token with role and username', async () => {
      const mockUser = {
        id: '1',
        username: 'admin',
        role: 'admin',
        email: null,
        fullName: null,
        isActive: true,
      };
      const result = await service.login(mockUser);
      expect(result).toHaveProperty('access_token', 'mock-token');
      expect(result.role).toBe('admin');
      expect(result.username).toBe('admin');
      expect(jwtService.sign).toHaveBeenCalled();
    });
  });

  // ─── validateUser ────────────────────────────────────────────────────────────

  describe('validateUser', () => {
    it('returns null when user not found in the database', async () => {
      const user = await service.validateUser('ghost', 'pass');
      expect(user).toBeNull();
    });

    it('returns null when the password does not match', async () => {
      dbService.pg.select.mockReturnValue(makeSelectChain([dbUser]));
      vi.mocked(argon2.verify).mockResolvedValueOnce(false);
      const result = await service.validateUser('admin', 'wrongpass');
      expect(result).toBeNull();
    });

    it('returns user (without hashedPassword) when credentials are valid', async () => {
      dbService.pg.select.mockReturnValue(makeSelectChain([dbUser]));
      vi.mocked(argon2.verify).mockResolvedValueOnce(true);
      const result = await service.validateUser('admin', 'correctpass');
      expect(result).not.toBeNull();
      expect(result!.username).toBe('admin');
      expect(result).not.toHaveProperty('hashedPassword');
    });
  });

  // ─── getUserById ─────────────────────────────────────────────────────────────

  describe('getUserById', () => {
    it('returns user without hashedPassword when found', async () => {
      dbService.pg.select.mockReturnValue(makeSelectChain([dbUser]));
      const result = await service.getUserById('u1');
      expect(result).not.toBeNull();
      expect(result!.username).toBe('admin');
      expect(result).not.toHaveProperty('hashedPassword');
    });

    it('returns null when user not found', async () => {
      const result = await service.getUserById('nonexistent');
      expect(result).toBeNull();
    });
  });

  // ─── createUser ──────────────────────────────────────────────────────────────

  describe('createUser', () => {
    it('returns true when user is created successfully', async () => {
      const success = await service.createUser(
        'newuser',
        'pass',
        'New User',
        'new@test.com',
      );
      expect(success).toBe(true);
      expect(dbService.pg.insert).toHaveBeenCalled();
    });

    it('returns false when the DB throws (e.g. duplicate username)', async () => {
      dbService.pg.insert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          execute: vi
            .fn()
            .mockRejectedValue(new Error('unique constraint violation')),
        }),
      });
      const success = await service.createUser('existing', 'pass');
      expect(success).toBe(false);
    });
  });

  // ─── isTokenBlacklisted ───────────────────────────────────────────────────────

  describe('isTokenBlacklisted', () => {
    it('returns false when token is not in the blacklist', async () => {
      const result = await service.isTokenBlacklisted('clean-token');
      expect(result).toBe(false);
    });

    it('returns true when token exists in the blacklist', async () => {
      dbService.pg.select.mockReturnValue(
        makeSelectChain([
          { token: 'blacklisted-token', expiresAt: new Date().toISOString() },
        ]),
      );
      const result = await service.isTokenBlacklisted('blacklisted-token');
      expect(result).toBe(true);
    });
  });

  // ─── blacklistToken ───────────────────────────────────────────────────────────

  describe('blacklistToken', () => {
    it('inserts token without throwing', async () => {
      const expiresAt = new Date(Date.now() + 3600_000);
      await expect(
        service.blacklistToken('some-token', expiresAt),
      ).resolves.not.toThrow();
      expect(dbService.pg.insert).toHaveBeenCalled();
    });

    it('swallows DB errors silently', async () => {
      dbService.pg.insert.mockReturnValueOnce({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            execute: vi.fn().mockRejectedValue(new Error('DB error')),
          }),
        }),
      });
      await expect(
        service.blacklistToken('tok', new Date()),
      ).resolves.not.toThrow();
    });
  });

  // ─── seedAdmin ────────────────────────────────────────────────────────────────

  describe('seedAdmin', () => {
    it('does not insert when admin already exists', async () => {
      dbService.pg.select.mockReturnValue(makeSelectChain([dbUser]));
      await service.seedAdmin();
      expect(dbService.pg.insert).not.toHaveBeenCalled();
    });

    it('inserts admin user when none exists', async () => {
      // select returns [] → admin not found
      await service.seedAdmin();
      expect(dbService.pg.insert).toHaveBeenCalled();
    });
  });
});
