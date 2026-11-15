import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateFeedbackDto } from './dto/createFeedback.dto';
import { FeedbackRepo } from './feedback.repo';

@Injectable()
export class FeedbackService {
  constructor(private readonly feedbackRepo: FeedbackRepo) {}

  create(dto: CreateFeedbackDto) {
    this.feedbackRepo.create(dto);
    return dto;
  }

  getAll() {
    return this.feedbackRepo.getAll();
  }

  getById(id: number) {
    const feedback = this.feedbackRepo.getById(id);
    if (!feedback) throw new NotFoundException('Feedback tidak ditemukan');
    return feedback;
  }
}
