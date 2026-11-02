import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';
import { PrismaModule } from '../../configs/prisma/prisma.module';
import { TaskRepo } from './tasks.repo';

@Module({
  imports: [PrismaModule],
  controllers: [TasksController],
  providers: [TasksService, TaskRepo],
})
export class TasksModule {}
