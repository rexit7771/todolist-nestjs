import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../configs/prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class AuthRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: {
        email,
      },
    });
  }

  async create(createUser: CreateUserDto) {
    return this.prisma.user.create({
      data: createUser,
    });
  }
}
