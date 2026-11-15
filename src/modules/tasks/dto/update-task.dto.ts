import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateTaskDto {
  @IsBoolean({ message: 'completed harus berupa boolean' })
  @IsOptional()
  @IsNotEmpty()
  completed?: boolean;

  @IsString({ message: 'title harus string' })
  @IsOptional()
  @IsNotEmpty()
  title?: string;
}
