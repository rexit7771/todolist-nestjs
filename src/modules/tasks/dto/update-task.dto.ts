import { IsBoolean } from 'class-validator';

export class UpdateTaskDto {
  @IsBoolean({ message: 'completed harus berupa boolean' })
  completed!: boolean;
}
