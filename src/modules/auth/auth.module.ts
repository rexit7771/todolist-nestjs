import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthRepo } from './auth.repo';
import { PrismaModule } from '../../configs/prisma/prisma.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { StringValue } from 'ms';

/**
 * JWT_EXPIRES_IN accepts two formats:
 * - digits only ("3600") -> number of seconds
 * - ms format ("5h", "7d", "30m") -> passed through as a string
 * A digit-only string must not be passed as a string: jsonwebtoken would read it as milliseconds.
 */
function parseExpiresIn(raw: string): number | StringValue {
  return /^\d+$/.test(raw) ? Number(raw) : (raw as StringValue);
}

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: parseExpiresIn(
            config.getOrThrow<string>('JWT_EXPIRES_IN'),
          ),
        },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AuthRepo, JwtAuthGuard],
  exports: [JwtAuthGuard, JwtModule],
})
export class AuthModule {}
