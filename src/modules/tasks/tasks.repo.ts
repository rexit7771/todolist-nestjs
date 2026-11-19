import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../configs/prisma/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';

@Injectable()
export class TaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(userId: number) {
    return this.prisma.task.findMany({
      where: { createdBy: userId },
      omit: { createdBy: true },
      include: {
        creator: {
          select: { id: true, email: true },
        },
      },
    });
  }

  async findById(id: number) {
    return this.prisma.task.findUnique({
      where: { id },
    });
  }

  async create(dto: CreateTaskDto, createdBy: number) {
    return this.prisma.task.create({
      data: { title: dto.title, createdBy },
    });
  }

  async update(id: number, dto: UpdateTaskDto) {
    return this.prisma.task.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: number) {
    return this.prisma.task.delete({ where: { id } });
  }
}
