import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRepo } from './feedback.repo';

@Module({
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRepo],
})
export class FeedbackModule {}
