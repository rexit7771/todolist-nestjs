# 02 · Controller → Service → Repo

Setiap module fitur di repo ini dibagi menjadi tiga lapisan. Masing-masing punya satu tanggung jawab, jadi saat mencari "di mana kode untuk X?", jawabannya selalu jelas.

| Lapisan | Tanggung jawab | Tidak boleh |
| --- | --- | --- |
| **Controller** | routing, membaca parameter dan body, memasang guard dan pipe | berisi logika bisnis atau memanggil Prisma |
| **Service** | aturan bisnis, pengecekan, melempar exception HTTP | tahu soal request/response Express |
| **Repo** | query ke database lewat `PrismaService` | melempar exception HTTP |

```text
HTTP request
   │
   ▼
TasksController.findById(userId, id)     ← "route ini memanggil method apa?"
   │
   ▼
TasksService.findById(id, userId)        ← "task-nya ada? milik user ini?"
   │
   ▼
TaskRepo.findById(id)                    ← "SELECT ... FROM Task WHERE id = ?"
   │
   ▼
PrismaService → PostgreSQL
```

---

## 1. Controller

**File:** [tasks.controller.ts](../src/modules/tasks/tasks.controller.ts), [feedback.controller.ts](../src/modules/feedback/feedback.controller.ts)

```ts
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController {
  constructor(private readonly taskService: TasksService) {}

  @Get(':id')
  findById(
    @CurrentUser('id') userId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    if (id <= 0) throw new BadRequestException('ID harus lebih dari 0');
    return this.taskService.findById(id, userId);
  }
}
```

- `@Controller('tasks')` menjadi **prefix route**. `@Get(':id')` menambahkan sisanya, jadi route lengkapnya `GET /tasks/:id`.
- Decorator method (`@Get`, `@Post`, `@Patch`, `@Put`, `@Delete`) menentukan HTTP method-nya.
- Decorator parameter (`@Param`, `@Body`, `@CurrentUser`) menentukan **dari mana** nilai argumen diambil.
- **Nilai yang di-`return` otomatis menjadi response.** Object dan array dikirim sebagai JSON. Promise ditunggu dulu, jadi tidak perlu `await`.
- Status default-nya `201` untuk `POST` dan `200` untuk method lain. Bisa diubah dengan `@HttpCode(204)`.

---

## 2. Service

**File:** [tasks.service.ts](../src/modules/tasks/tasks.service.ts), [feedback.service.ts](../src/modules/feedback/feedback.service.ts), [auth.service.ts](../src/modules/auth/auth.service.ts)

```ts
async findById(id: number, userId: number) {
  const task = await this.taskRepo.findById(id);
  if (!task) throw new NotFoundException('Task Not Found');
  if (userId !== task.createdBy) {
    throw new ForbiddenException("You're unauthorized to get this task");
  }
  return task;
}
```

Service adalah tempat **aturan bisnis** dan **exception HTTP**. Nest punya exception bawaan untuk status yang umum:

| Exception | Status | Dipakai di repo ini untuk |
| --- | --- | --- |
| `BadRequestException` | 400 | validasi gagal, `id <= 0` |
| `UnauthorizedException` | 401 | token tidak ada atau salah, login gagal |
| `ForbiddenException` | 403 | task milik user lain |
| `NotFoundException` | 404 | task atau feedback tidak ditemukan |
| `ConflictException` | 409 | email sudah terdaftar |

Saat exception ini dilempar, *exception filter* bawaan Nest mengubahnya menjadi response JSON:

```json
{ "statusCode": 404, "message": "Task Not Found", "error": "Not Found" }
```

### Pola "cek dulu, baru ubah"

```ts
// FeedbackService
async updateById(id: number, dto: UpdateFeedback) {
  await this.getById(id);                    // lempar 404 kalau tidak ada
  return this.feedbackRepo.updateById(id, dto);
}
```

Kenapa perlu dicek dulu? Kalau langsung memanggil `prisma.feedback.update()` untuk ID yang tidak ada, Prisma melempar error-nya sendiri (kode `P2025`). Error itu bukan `HttpException`, jadi Nest mengubahnya menjadi **500 Internal Server Error**, padahal seharusnya 404.

---

## 3. Repo

**File:** [tasks.repo.ts](../src/modules/tasks/tasks.repo.ts), [feedback.repo.ts](../src/modules/feedback/feedback.repo.ts), [auth.repo.ts](../src/modules/auth/auth.repo.ts)

```ts
@Injectable()
export class TaskRepo {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: number) {
    return this.prisma.task.findUnique({ where: { id } });
  }
}
```

Repo adalah **satu-satunya** lapisan yang menyentuh `PrismaService`. Hasilnya:

- Service bisa di-test tanpa database: cukup mock repo-nya.
- Kalau suatu saat Prisma diganti (misalnya ke TypeORM), yang berubah hanya file `*.repo.ts`.
- Repo mengembalikan `null` kalau data tidak ada. Memutuskan bahwa `null` berarti 404 adalah tugas service.

> Dokumentasi resmi Nest biasanya hanya memakai Controller → Service, dan service langsung memanggil ORM. Lapisan Repo di repo ini adalah pilihan desain tambahan, bukan kewajiban dari Nest.

---

## Jebakan yang saya temui

- **Validasi di controller.** `TasksController.findById` mengecek `id <= 0` sendiri, sedangkan `update` dan `delete` tidak. Pengecekan seperti ini lebih cocok dijadikan pipe, supaya konsisten untuk semua route (lihat [bab 04](04-pipes.md)).
- **`Number(id)` yang tidak perlu.** `TasksController.update` masih membungkus `id` dengan `Number(...)`, padahal `ParseIntPipe` sudah mengubahnya menjadi number.
- **Login mengembalikan string polos.** `AuthService.login` me-return token sebagai string, sehingga Express mengirimnya sebagai teks, bukan JSON. Kebanyakan client lebih suka bentuk `{ "accessToken": "..." }`.
- **Pengecekan ganda.** `TasksService.update` dan `delete` mengecek pemilik lagi setelah `findById` sudah melakukannya (detail di [bab 05](05-guard-dan-auth.md#jebakan-yang-saya-temui)).
- **Race condition kecil.** "Cek dulu, baru ubah" butuh dua query. Kalau data terhapus di antara keduanya, `update` tetap gagal dengan `P2025` dan menghasilkan 500. Untuk project belajar ini tidak masalah, tapi perlu disadari.

---

## Latihan berikutnya

1. Ubah response login menjadi `{ accessToken: string }`, lalu sesuaikan collection Bruno.
2. Buat `DELETE` mengembalikan `204 No Content` dengan `@HttpCode(HttpStatus.NO_CONTENT)`.
3. Pindahkan pengecekan `id > 0` dari controller ke pipe (bab 04), lalu hapus `Number(id)`.
4. **Exception filter untuk Prisma.** Buat `@Catch(Prisma.PrismaClientKnownRequestError)` yang mengubah `P2025` menjadi 404 dan `P2002` (unique constraint) menjadi 409. Setelah itu, pertimbangkan apakah pola "cek dulu" masih diperlukan.
5. Tambahkan fitur baru dari nol (misalnya `Category`) dengan pola yang sama: module, controller, service, repo, dto.

## Referensi

- [NestJS: Controllers](https://docs.nestjs.com/controllers)
- [NestJS: Exception filters](https://docs.nestjs.com/exception-filters)
- [Prisma: Error reference](https://www.prisma.io/docs/orm/reference/error-reference)
