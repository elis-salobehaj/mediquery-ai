import {
  Body,
  Controller,
  Get,
  HttpException,
  HttpStatus,
  Post,
  Request,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request as ExpressRequest } from 'express';
import { AuthService } from '@/auth/auth.service';
import { getAuthenticatedUser } from '@/common/request-utils';
import type { LoginFormBody, ValidatedUser } from '@/common/types';
import { UserCreateDto } from './dto/user.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('token')
  async login(@Body() body: LoginFormBody) {
    // A simplified version matching OAuth2PasswordRequestForm
    const user = await this.authService.validateUser(body.username, body.password);
    if (!user) {
      throw new UnauthorizedException('Incorrect username or password');
    }
    return this.authService.login(user);
  }

  @Post('register')
  async register(@Body() userDto: UserCreateDto) {
    const success = await this.authService.createUser(
      userDto.username,
      userDto.password,
      userDto.fullName,
      userDto.email,
    );
    if (!success) {
      throw new HttpException('Username already registered', HttpStatus.BAD_REQUEST);
    }
    const user = await this.authService.validateUser(userDto.username, userDto.password);
    if (!user) {
      throw new HttpException('Registration failed', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return this.authService.login(user);
  }

  @Post('guest')
  async loginGuest() {
    const guest = await this.authService.createGuestUser();
    const user: ValidatedUser = {
      id: guest.id,
      username: guest.username,
      email: null,
      fullName: null,
      role: 'user',
      isActive: true,
    };
    return this.authService.login(user);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  async logout(@Request() req: ExpressRequest) {
    const auth = req.headers.authorization;
    if (!auth) throw new UnauthorizedException('Missing token');

    const token = auth.replace('Bearer ', '');
    // In production, we'd extract 'exp' from token to set proper TTL
    const expiresAt = new Date(Date.now() + 1 * 60 * 60 * 1000); // 1h default
    await this.authService.blacklistToken(token, expiresAt);
    return { message: 'Successfully logged out' };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async getMe(@Request() req: ExpressRequest) {
    const authenticatedUser = getAuthenticatedUser(req);
    const user = await this.authService.getUserById(authenticatedUser.id);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return {
      username: user.username,
      email: user.email,
      full_name: user.fullName || null,
      disabled: !user.isActive,
      role: user.role,
    };
  }
}
