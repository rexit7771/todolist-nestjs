import { Module } from '@nestjs/common';
import { FeedbackController } from './feedback.controller';
import { FeedbackService } from './feedback.service';
import { FeedbackRepo } from './feedback.repo';
import { PrismaModule } from '../../configs/prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [FeedbackController],
  providers: [FeedbackService, FeedbackRepo, PrismaModule],
})
export class FeedbackModule {}
