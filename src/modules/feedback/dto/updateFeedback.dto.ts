import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class UpdateFeedback {
  @IsNotEmpty({ message: 'name wajib dikirim' })
  @IsString({ message: 'name wajib string' })
  name!: string;

  @IsNotEmpty({ message: 'name wajib dikirim' })
  @IsString({ message: 'name wajib string' })
  message!: string;

  @IsNotEmpty({ message: 'rating wajib dikirim' })
  @IsInt({ message: 'rating wajib angka bulat' })
  @Max(5, { message: 'rating maksimal 5' })
  @Min(1, { message: 'rating minimal 1' })
  rating!: number;
}
