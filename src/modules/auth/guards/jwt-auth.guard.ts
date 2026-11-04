import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

interface AuthenticatedRequest extends Request {
  user?: {
    id: number;
    email: string;
  };
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const authorization = request.headers.authorization;

    if (!authorization)
      throw new UnauthorizedException('Token tidak ditemukan');

    const [type, token] = authorization.split(' ');

    if (type !== 'Bearer' || !token)
      throw new UnauthorizedException('Format token tidak valid');

    try {
      const payload = await this.jwtService.verifyAsync<{
        id: number;
        email: string;
      }>(token);

      request.user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Token tidak valid');
    }
  }
}
