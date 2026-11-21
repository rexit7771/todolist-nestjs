# 03 · DTO & `ValidationPipe`

Bab ini membahas cara memastikan body request bentuknya benar **sebelum** sampai ke controller.

| Istilah | Artinya |
| --- | --- |
| **DTO** (*Data Transfer Object*) | Class yang menggambarkan bentuk data yang masuk. Di repo ini, setiap DTO ada di folder `dto/`. |
| **class-validator** | Library dengan decorator seperti `@IsString()` dan `@Min(1)` untuk aturan validasi. |
| **class-transformer** | Library yang mengubah object JSON biasa menjadi instance class DTO, supaya decorator di atas bisa dibaca. |
| **`ValidationPipe`** | Pipe bawaan Nest yang menyatukan keduanya: ubah body menjadi DTO, validasi, lalu tolak kalau gagal. |

Alurnya:

```text
body JSON  ──►  plainToInstance(CreateTaskDto, body)  ──►  validate()
                                                              │
                                   error? ── ya ──►  exceptionFactory  ──►  400
                                      │
                                    tidak
                                      ▼
                       TasksController.create(userId, dto)
```

---

## 1. Menulis DTO

**File:** [create-task.dto.ts](../src/modules/tasks/dto/create-task.dto.ts), [createFeedback.dto.ts](../src/modules/feedback/dto/createFeedback.dto.ts), [create-user.dto.ts](../src/modules/auth/dto/create-user.dto.ts)

```ts
export class CreateFeedbackDto {
  @IsNotEmpty({ message: 'Nama wajib diisi' })
  @IsString({ message: 'Nama wajib string' })
  name!: string;

  @IsNotEmpty({ message: 'Rating wajib diisi' })
  @IsInt({ message: 'Rating wajib angka bulat' })
  @Min(1, { message: 'Rating minimal 1' })
  @Max(5, { message: 'Rating maksimal 5' })
  rating!: number;
}
```

- **DTO harus berupa `class`, bukan `interface` atau `type`.** Interface hilang saat compile, sedangkan class tetap ada saat runtime, sehingga decorator-nya bisa dibaca oleh `ValidationPipe`.
- Tanda `!` (*definite assignment*) memberi tahu TypeScript bahwa field ini pasti terisi, walaupun tidak diisi di constructor. Field-nya diisi oleh class-transformer.
- Setiap decorator bisa diberi `{ message: '...' }`. Dari sinilah pesan error berbahasa Indonesia berasal.
- DTO **sekaligus** menjadi tipe parameter di controller: `@Body() dto: CreateFeedbackDto`. Satu class dipakai untuk dua hal, yaitu tipe TypeScript dan aturan validasi.

---

## 2. `ValidationPipe` global

**File:** [main.ts](../src/main.ts)

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    exceptionFactory: (errors) => {
      const firstError = errors[0];
      const message = Object.values(firstError.constraints ?? {})[0];
      return new BadRequestException(message);
    },
  }),
);
```

| Opsi | Efeknya |
| --- | --- |
| `whitelist: true` | Field yang **tidak punya decorator** di DTO dibuang dari body. |
| `forbidNonWhitelisted: true` | Daripada dibuang diam-diam, field asing seperti itu langsung ditolak dengan 400. |
| `exceptionFactory` | Mengatur bentuk error. Bawaannya, Nest mengirim **array** semua pesan error. Di sini hanya pesan pertama yang dikirim, sebagai string. |

Contoh: `POST /tasks` dengan body `{ "title": "Belajar", "isAdmin": true }` ditolak dengan 400, karena `isAdmin` tidak ada di `CreateTaskDto`. Ini melindungi dari *mass assignment*, yaitu client yang menyelipkan field yang tidak seharusnya bisa ia atur. Contoh lain: mengirim `createdBy` milik user lain.

`useGlobalPipes` memasang pipe untuk **semua** route. Alternatifnya: pasang di level method/controller dengan `@UsePipes()`, atau di satu parameter saja, misalnya `@Body(new ValidationPipe())`.

---

## 3. DTO turunan dengan `PartialType`

**File:** [update-task.dto.ts](../src/modules/tasks/dto/update-task.dto.ts)

```ts
export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsBoolean({ message: 'completed harus berupa boolean' })
  @IsOptional()
  completed?: boolean;
}
```

`PartialType(CreateTaskDto)` dari `@nestjs/mapped-types` membuat class baru yang:

- punya semua field `CreateTaskDto` (`title`), beserta **semua decorator validasinya**;
- membuat setiap field opsional (ditambah `@IsOptional()`).

Hasilnya, `title` di PATCH tetap divalidasi `@IsString` dan `@IsNotEmpty` **kalau dikirim**, dan boleh tidak dikirim sama sekali. Aturan validasi `title` hanya ditulis sekali, di `CreateTaskDto`.

Mapped types lain yang tersedia:

| Fungsi | Hasilnya |
| --- | --- |
| `PartialType(A)` | semua field A jadi opsional |
| `PickType(A, ['x'])` | hanya field `x` dari A |
| `OmitType(A, ['x'])` | semua field A kecuali `x` |
| `IntersectionType(A, B)` | gabungan field A dan B |

`@IsOptional()` berarti: kalau nilainya `undefined` atau `null`, **lewati semua validasi lain** untuk field itu.

---

## Jebakan yang saya temui

- **`@nestjs/mapped-types` v12 hanya tersedia sebagai ESM.** Aplikasinya tetap jalan (Node 22+/24 bisa `require()` ESM), tetapi Jest gagal memuat file yang meng-import `UpdateTaskDto`. Detailnya di [bab 09](09-unit-testing.md).
- **Pesan error yang salah salin.** `UpdateFeedback` memakai pesan `'name wajib dikirim'` untuk field `message`. Copy-paste DTO adalah sumber bug yang klasik, dan ini salah satu alasan mapped types berguna.
- **Penamaan tidak konsisten.** `UpdateFeedback` tidak memakai akhiran `Dto` seperti DTO lain, dan `FeedbackDto` sudah tidak dipakai di mana pun.
- **`@IsNotEmpty` + `@IsOptional` bersamaan.** Di `UpdateTaskDto`, `@IsNotEmpty()` pada `completed` tidak menambah apa-apa: `@IsOptional` sudah melewati `undefined`/`null`, dan nilai lain sudah ditangkap `@IsBoolean`.
- **Mana yang dianggap pesan "pertama"?** `exceptionFactory` mengambil constraint pertama dari object `constraints`. Kalau beberapa aturan gagal bersamaan (misalnya `title` tidak dikirim, sehingga `@IsString` dan `@IsNotEmpty` sama-sama gagal), pesan yang muncul ditentukan oleh urutan internal class-validator. Coba kirim body kosong untuk melihat pesan mana yang keluar.
- **`constraints` bisa kosong.** Untuk DTO bertingkat (`@ValidateNested`), error-nya ada di `children`, bukan di `constraints`. Akibatnya `message` bernilai `undefined` dan client hanya menerima "Bad Request".
- **Tanpa `transform: true`, handler tidak menerima instance DTO.** Setelah validasi, `ValidationPipe` mengembalikan object biasa (yang sudah dibersihkan oleh `whitelist`), bukan instance `CreateTaskDto`. Untuk body JSON hal ini jarang jadi masalah, tetapi penting kalau DTO punya method atau getter.

---

## Latihan berikutnya

1. **Refactor `UpdateFeedback`** menjadi `UpdateFeedbackDto`. Pakai `IntersectionType(PickType(CreateFeedbackDto, ['rating']), PartialType(OmitType(CreateFeedbackDto, ['rating'])))`: `rating` tetap wajib, field lain opsional. Jangan lupa mengubah `PUT` menjadi `PATCH` kalau semantiknya memang jadi update sebagian.
2. Hapus `FeedbackDto` yang tidak terpakai.
3. Coba `transform: true` di `ValidationPipe`, lalu `console.log(dto instanceof CreateTaskDto)` di controller, sebelum dan sesudah opsi itu dipasang.
4. Ubah `exceptionFactory` supaya mengembalikan **semua** pesan dalam bentuk `{ field: pesan }`. Pikirkan mana yang lebih berguna untuk frontend.
5. Buat **custom validator** sendiri dengan `@ValidatorConstraint`, misalnya `@IsNotBlank()` yang menolak string berisi spasi saja.

## Referensi

- [NestJS: Validation](https://docs.nestjs.com/techniques/validation)
- [NestJS: Mapped types](https://docs.nestjs.com/techniques/validation#mapped-types)
- [class-validator](https://github.com/typestack/class-validator)
