import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import type { JwtAlgorithm } from '@/common/types';
import { ConfigModule } from '@/config/config.module';
import { ConfigService } from '@/config/config.service';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';

@Module({
  imports: [
    ConfigModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.get('JWT_SECRET_KEY'),
        signOptions: {
          expiresIn: `${config.get('ACCESS_TOKEN_EXPIRE_MINUTES')}m`,
          algorithm: config.get('JWT_ALGORITHM') as JwtAlgorithm,
        },
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtAuthGuard],
  exports: [AuthService, JwtModule, JwtAuthGuard],
})
export class AuthModule {}
