import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFeedbackDto } from './dto/createFeedback.dto';
import { FeedbackRepo } from './feedback.repo';
import { UpdateFeedback } from './dto/updateFeedback.dto';

@Injectable()
export class FeedbackService {
  constructor(private readonly feedbackRepo: FeedbackRepo) {}

  async create(dto: CreateFeedbackDto) {
    return this.feedbackRepo.create(dto);
  }

  async getAll() {
    return this.feedbackRepo.getAll();
  }

  async getById(id: number) {
    const feedback = await this.feedbackRepo.getById(id);
    if (!feedback) throw new NotFoundException('Feedback tidak ditemukan');
    return feedback;
  }

  async updateById(id: number, dto: UpdateFeedback) {
    await this.getById(id);
    return this.feedbackRepo.updateById(id, dto);
  }

  async deleteById(id: number) {
    await this.getById(id);
    return this.feedbackRepo.deleteById(id);
  }
}
