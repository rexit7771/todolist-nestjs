import { Injectable } from '@nestjs/common';
import { CreateFeedbackDto } from './dto/createFeedback.dto';
import { PrismaService } from '../../configs/prisma/prisma.service';
import { UpdateFeedback } from './dto/updateFeedback.dto';

@Injectable()
export class FeedbackRepo {
  constructor(private readonly prismaService: PrismaService) {}

  async create(dto: CreateFeedbackDto) {
    return await this.prismaService.feedback.create({ data: dto });
  }

  async getAll() {
    return await this.prismaService.feedback.findMany();
  }

  async getById(id: number) {
    return await this.prismaService.feedback.findUnique({ where: { id } });
  }

  async updateById(id: number, dto: UpdateFeedback) {
    return await this.prismaService.feedback.update({
      where: { id },
      data: dto,
    });
  }

  async deleteById(id: number) {
    return await this.prismaService.feedback.delete({ where: { id } });
  }
}
