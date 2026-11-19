import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { TaskRepo } from './tasks.repo';

@Injectable()
export class TasksService {
  constructor(private readonly taskRepo: TaskRepo) {}

  async findAll(userId: number) {
    return this.taskRepo.findAll(userId);
  }

  async findById(id: number) {
    const task = await this.taskRepo.findById(id);
    if (!task) throw new NotFoundException('Task Not Found');
    return task;
  }

  async create(createTaskDto: CreateTaskDto, createdBy: number) {
    return this.taskRepo.create(createTaskDto, createdBy);
  }

  async update(id: number, updateTaskDto: UpdateTaskDto) {
    await this.findById(id);
    return this.taskRepo.update(id, updateTaskDto);
  }

  async delete(id: number) {
    await this.findById(id);
    return this.taskRepo.delete(id);
  }
}
