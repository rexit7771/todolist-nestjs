import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/currentUser.decorator';

@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly taskService: TasksService) {}

  @Get()
  findAll(@CurrentUser('id') userId: number) {
    return this.taskService.findAll(userId);
  }

  @Get(':id')
  // * ParseIntPipe: mengubah string -> int, tolak non angka, menerima 0 kebawah
  findById(@Param('id', ParseIntPipe) id: number) {
    if (id <= 0) throw new BadRequestException('ID harus lebih dari 0');
    return this.taskService.findById(Number(id));
  }

  @Post()
  create(
    @CurrentUser('id') userId: number,
    @Body() createTaskDto: CreateTaskDto,
  ) {
    return this.taskService.create(createTaskDto, userId);
  }

  @Patch(':id')
  update(
    @Param('id', ParseIntPipe) id: string,
    @Body() updateTaskDto: UpdateTaskDto,
  ) {
    return this.taskService.update(Number(id), updateTaskDto);
  }

  @Delete(':id')
  delete(@Param('id', ParseIntPipe) id: string) {
    return this.taskService.delete(Number(id));
  }
}
