import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import type { ValidatedUser } from '@/common/types';
import { DatabaseService } from '@/database/database.service';
import { tokenBlacklist, users } from '@/database/schema';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly db: DatabaseService,
  ) {}

  async seedAdmin() {
    const existing = await this.db.pg
      .select()
      .from(users)
      .where(eq(users.username, 'admin'))
      .execute();
    if (existing.length === 0) {
      const hashedPassword = await argon2.hash('admin');
      await this.db.pg
        .insert(users)
        .values({
          username: 'admin',
          hashedPassword,
          fullName: 'System Admin',
          email: 'admin@mediquery.ai',
          role: 'admin',
        })
        .execute();
      console.log("Created default 'admin' user with password 'admin'");
    }
  }

  async getUserById(id: string) {
    const user = await this.db.pg.select().from(users).where(eq(users.id, id)).execute();
    if (user.length > 0) {
      const { hashedPassword: _hashedPassword, ...result } = user[0];
      return result;
    }
    return null;
  }

  async validateUser(username: string, pass: string): Promise<ValidatedUser | null> {
    const user = await this.db.pg
      .select()
      .from(users)
      .where(eq(users.username, username))
      .execute();
    if (user.length > 0) {
      const isMatch = await argon2.verify(user[0].hashedPassword, pass);
      if (isMatch) {
        const { hashedPassword: _hashedPassword, ...result } = user[0];
        return {
          id: result.id,
          username: result.username,
          email: result.email,
          fullName: result.fullName,
          role: result.role ?? 'user',
          isActive: result.isActive,
        };
      }
    }
    return null;
  }

  async login(user: ValidatedUser) {
    const payload = {
      sub: user.username,
      id: user.id,
      username: user.username,
      role: user.role,
    };
    return {
      access_token: this.jwtService.sign(payload),
      token_type: 'bearer',
      role: user.role,
      username: user.username,
    };
  }

  async createUser(
    username: string,
    pass: string,
    fullName?: string,
    email?: string,
  ): Promise<boolean> {
    const hashedPassword = await argon2.hash(pass);
    try {
      await this.db.pg
        .insert(users)
        .values({
          username,
          hashedPassword,
          fullName: fullName || null,
          email: email || null,
        })
        .execute();
      return true;
    } catch (e) {
      console.error(`Failed to create user: ${e}`);
      return false;
    }
  }

  async createGuestUser(): Promise<{ username: string; id: string }> {
    const { v4: uuidv4 } = await import('uuid');
    const { randomBytes } = await import('node:crypto');
    const guestName = `guest_${uuidv4().slice(0, 8)}`;
    const password = randomBytes(16).toString('hex');
    await this.createUser(guestName, password, 'Guest User');
    // Fetch the newly-created row so we can return its real UUID.
    const created = await this.db.pg
      .select()
      .from(users)
      .where(eq(users.username, guestName))
      .execute();
    return { username: guestName, id: created[0].id };
  }

  async blacklistToken(token: string, expiresAt: Date) {
    try {
      await this.db.pg
        .insert(tokenBlacklist)
        .values({
          token,
          expiresAt: expiresAt.toISOString(),
        })
        .onConflictDoNothing()
        .execute();
    } catch (e) {
      console.error(`Failed to blacklist token: ${e}`);
    }
  }

  async isTokenBlacklisted(token: string): Promise<boolean> {
    const result = await this.db.pg
      .select()
      .from(tokenBlacklist)
      .where(eq(tokenBlacklist.token, token))
      .execute();
    return result.length > 0;
  }
}
