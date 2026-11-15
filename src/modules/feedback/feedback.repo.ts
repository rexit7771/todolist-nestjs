import { Injectable } from '@nestjs/common';
import { CreateFeedbackDto } from './dto/createFeedback.dto';
import { FeedbackDto } from './dto/feedback.dto';

@Injectable()
export class FeedbackRepo {
  private readonly feedbacks: FeedbackDto[] = [];
  private nextId = 1;

  create(dto: CreateFeedbackDto) {
    this.feedbacks.push({ id: this.nextId, ...dto });
    this.nextId++;
    return { id: this.nextId + 1, ...dto };
  }

  getAll() {
    return this.feedbacks;
  }

  getById(id: number) {
    const feedback = this.feedbacks.find((feedback) => feedback.id === id);
    return feedback;
  }
}
