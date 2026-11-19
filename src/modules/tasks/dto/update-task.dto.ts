import { PartialType } from '@nestjs/mapped-types';
import { IsBoolean, IsNotEmpty, IsOptional } from 'class-validator';
import { CreateTaskDto } from './create-task.dto';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsBoolean({ message: 'completed harus berupa boolean' })
  @IsOptional()
  @IsNotEmpty()
  completed?: boolean;
}
