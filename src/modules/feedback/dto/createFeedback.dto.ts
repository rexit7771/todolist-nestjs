import { IsInt, IsNotEmpty, IsString, Max, Min } from 'class-validator';

export class CreateFeedbackDto {
  @IsNotEmpty({ message: 'Nama wajib diisi' })
  @IsString({ message: 'Nama wajib string' })
  name!: string;

  @IsNotEmpty({ message: 'Message wajib diisi' })
  @IsString({ message: 'Message wajib string' })
  message!: string;

  @IsNotEmpty({ message: 'Rating wajib diisi' })
  @IsInt({ message: 'Rating wajib angka bulat' })
  @Min(1, { message: 'Rating minimal 1' })
  @Max(5, { message: 'Rating maksimal 5' })
  rating!: number;
}
