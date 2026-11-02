import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateUserDto } from './dto/create-user.dto';
import { AuthRepo } from './auth.repo';
import { compare, hash } from 'bcrypt';
import { JwtService } from '@nestjs/jwt';

@Injectable()
export class AuthService {
  constructor(
    private readonly authRepo: AuthRepo,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: CreateUserDto) {
    const existingUser = await this.authRepo.findByEmail(dto.email);

    if (existingUser) {
      throw new ConflictException('Email sudah terdaftar');
    }

    const hashedPassword = await hash(dto.password, 12);

    return this.authRepo.create({
      email: dto.email,
      password: hashedPassword,
    });
  }

  async login(dto: CreateUserDto) {
    const existingUser = await this.authRepo.findByEmail(dto.email);
    if (!existingUser)
      throw new UnauthorizedException('Invalid email / password');

    const isPasswordMatched = await compare(
      dto.password,
      existingUser.password,
    );

    if (!isPasswordMatched) {
      throw new UnauthorizedException('Invalid email / password');
    }

    const token = await this.jwt.signAsync({
      id: existingUser.id,
      email: existingUser.email,
    });

    return token;
  }
}
