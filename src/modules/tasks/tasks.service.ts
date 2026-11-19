import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskRepo } from './tasks.repo';

@Injectable()
export class TasksService {
  constructor(private readonly taskRepo: TaskRepo) {}

  async findAll(userId: number) {
    return this.taskRepo.findAll(userId);
  }

  async findById(id: number, userId: number) {
    const task = await this.taskRepo.findById(id);
    if (!task) throw new NotFoundException('Task Not Found');
    if (userId !== task.createdBy) {
      throw new ForbiddenException("You're unauthorized to get this task");
    }
    return task;
  }

  async create(createTaskDto: CreateTaskDto, createdBy: number) {
    return this.taskRepo.create(createTaskDto, createdBy);
  }

  async update(id: number, updateTaskDto: UpdateTaskDto, userId: number) {
    const task = await this.findById(id, userId);
    if (task.createdBy !== userId) {
      throw new ForbiddenException("You're unauthorized to update this task");
    }
    return this.taskRepo.update(id, updateTaskDto);
  }

  async delete(id: number, userId: number) {
    const task = await this.findById(id, userId);
    if (task.createdBy !== userId) {
      throw new ForbiddenException("You're unauthorized to delete this task");
    }
    return this.taskRepo.delete(id);
  }
}
