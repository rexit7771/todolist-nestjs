import { IsNotEmpty, IsString } from 'class-validator';

export class CreateTaskDto {
  @IsString({ message: 'Nama tugas harus string' })
  @IsNotEmpty({ message: 'Nama tugas tidak boleh kosong' })
  title!: string;
}
