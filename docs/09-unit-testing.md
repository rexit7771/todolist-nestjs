# 09 · Unit Testing dengan Mock

**Unit test** menguji satu class secara terpisah. Semua dependency-nya diganti dengan **mock**, yaitu object palsu yang perilakunya kita atur sendiri. Di sinilah dependency injection ([bab 01](01-module-dan-di.md)) benar-benar terasa manfaatnya: `TasksService` tidak tahu, dan tidak peduli, apakah `TaskRepo` yang diterimanya asli atau palsu.

| Jenis test | Yang diuji | Database? | File di repo |
| --- | --- | --- | --- |
| **Unit** | satu class, dependency di-mock | tidak | `src/**/*.spec.ts` (`npm test`) |
| **E2E** | aplikasi utuh lewat HTTP | ya | `test/*.e2e-spec.ts` (`npm run test:e2e`) |

---

## 1. Pola dasar: `Test.createTestingModule` + `useValue`

**File:** [tasks.service.spec.ts](../src/modules/tasks/tasks.service.spec.ts)

```ts
describe('TasksService', () => {
  let service: TasksService;
  let taskRepo: { findById: jest.Mock; update: jest.Mock };

  beforeEach(async () => {
    taskRepo = { findById: jest.fn(), update: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [TasksService, { provide: TaskRepo, useValue: taskRepo }],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });
});
```

- `Test.createTestingModule({...})` membuat **module Nest mini** khusus untuk test, dengan sistem DI yang sama seperti aplikasi asli.
- `{ provide: TaskRepo, useValue: taskRepo }` adalah **custom provider**: "kalau ada yang meminta `TaskRepo`, berikan object `taskRepo` ini". `TasksService` jadi menerima mock, tanpa `PrismaService` dan tanpa database.
- `.compile()` menjalankan proses DI. Kalau ada dependency yang tidak tersedia, error-nya muncul di sini.
- `module.get(TasksService)` mengambil instance yang sudah dibuat.
- `beforeEach` membuat module baru untuk setiap test, supaya mock dari satu test tidak memengaruhi test lain.

### Mengatur dan memeriksa mock

```ts
it('should update a task', async () => {
  taskRepo.findById.mockResolvedValue(existingTask);   // atur: findById mengembalikan Promise berisi task
  taskRepo.update.mockResolvedValue(updatedTask);

  const result = await service.update(1, { title: 'Belanja' });

  expect(taskRepo.update).toHaveBeenCalledWith(1, { title: 'Belanja' });  // periksa: dipanggil dengan argumen ini
  expect(result).toEqual(updatedTask);
});

it('should throw not found exception', async () => {
  taskRepo.findById.mockResolvedValue(null);

  await expect(service.update(2, { title: 'Belanja' })).rejects.toThrow(NotFoundException);
  expect(taskRepo.update).not.toHaveBeenCalled();
});
```

Polanya selalu **Arrange → Act → Assert**: atur mock, panggil method, lalu periksa hasil dan interaksinya.

| Fungsi Jest | Kegunaan |
| --- | --- |
| `jest.fn()` | membuat fungsi palsu yang mencatat setiap pemanggilan |
| `.mockResolvedValue(x)` | fungsi mengembalikan `Promise.resolve(x)` |
| `.mockRejectedValue(e)` | fungsi mengembalikan `Promise.reject(e)` |
| `toHaveBeenCalledWith(...)` | memeriksa argumen pemanggilan |
| `rejects.toThrow(Class)` | memeriksa bahwa Promise gagal dengan exception tertentu |

---

## 2. Kondisi test di repo saat ini

Hasil `npx jest` per 21-11-2026: **5 dari 8 suite gagal**.

| Spec | Status | Penyebab |
| --- | --- | --- |
| `tasks.service.spec.ts` | ✅ lulus | tapi lulus karena kebetulan (lihat jebakan) |
| `tasks.controller.spec.ts` | ❌ | Jest tidak bisa memuat `@nestjs/mapped-types` (ESM) |
| `auth.controller.spec.ts`, `auth.service.spec.ts`, `feedback.controller.spec.ts` | ❌ | Jest tidak bisa memuat `@nestjs/jwt` (ESM) |
| `feedback.service.spec.ts` | ❌ | *"Nest can't resolve dependencies of the FeedbackService (?)"*, karena `FeedbackRepo` tidak di-mock |
| `test/app.e2e-spec.ts` | ❌ (belum dijalankan) | masih mengharapkan `GET /` → "Hello World!", route yang sudah tidak ada |

Sebagian besar spec masih berupa **scaffold** dari Nest CLI. Isinya hanya `expect(service).toBeDefined()`, tanpa mock.

---

## Jebakan yang saya temui

- **Test lulus karena kebetulan.** Setelah pengecekan pemilik ditambahkan, signature-nya menjadi `update(id, dto, userId)`. Test masih memanggil `service.update(1, dto)` tanpa `userId`, dan `existingTask` tidak punya `createdBy`. Pengecekan `task.createdBy !== userId` menjadi `undefined !== undefined`, yaitu `false`, sehingga test lulus. Jest juga tidak memprotes kurangnya argumen. Kemungkinan karena `isolatedModules: true` di `tsconfig.json` membuat `ts-jest` hanya men-transpile, tanpa mengecek tipe. Untuk memastikan, jalankan `npx tsc --noEmit`. Pelajarannya: **test yang hijau belum tentu menguji skenario yang benar.**
- **Paket ESM-only di Jest.** `@nestjs/mapped-types` v12 dan `@nestjs/jwt` v12 hanya tersedia sebagai ES Module. Aplikasi tetap berjalan karena Node 22+/24 bisa `require()` ESM, tetapi Jest menjalankan test sebagai CommonJS dan gagal dengan *"Must use import to load ES Module"*. Pilihan solusinya:
  - me-mock module tersebut di spec dengan `jest.mock('@nestjs/jwt', ...)`;
  - mengizinkan `ts-jest` men-transform paket itu lewat `transformIgnorePatterns`;
  - memakai versi lama yang masih CommonJS;
  - menjalankan Jest dalam mode ESM.
- **Scaffold yang tidak pernah di-update.** `providers: [FeedbackService]` tanpa `FeedbackRepo` pasti gagal di `.compile()`. Pesan errornya adalah contoh nyata error DI dari bab 01.
- **Membuat mock dengan cast.** Kalau menulis `{ provide: TaskRepo, useValue: {} as TaskRepo }`, TypeScript diam saja walaupun method-nya tidak ada. Lebih aman mendefinisikan tipe mock secara eksplisit, seperti `{ findById: jest.Mock; ... }` di spec yang sekarang.

---

## Latihan berikutnya

1. **Perbaiki `tasks.service.spec.ts`.** Kirim `userId`, beri `existingTask` field `createdBy`, lalu tambahkan test baru: *"should throw ForbiddenException when task belongs to another user"*.
2. **Tulis `feedback.service.spec.ts`** dengan mock `FeedbackRepo`. Uji `getById` (ada dan tidak ada), dan pastikan `updateById` tidak memanggil `repo.updateById` kalau feedback tidak ditemukan.
3. **Tulis `auth.service.spec.ts`.** Mock `AuthRepo` dan `JwtService` (`{ provide: JwtService, useValue: { signAsync: jest.fn() } }`). Untuk `bcryptjs`, pakai `jest.mock('bcryptjs')`. Uji register dengan email duplikat (409) dan login dengan password salah (401). Selesaikan dulu masalah ESM `@nestjs/jwt`.
4. **Controller test.** Uji bahwa `TasksController.findAll(1)` memanggil `taskService.findAll(1)`. Di sini terlihat manfaat `@CurrentUser()`: controller cukup dipanggil dengan angka biasa.
5. **E2E test sungguhan.** Ganti `app.e2e-spec.ts` dengan alur register → login → `POST /tasks` → `GET /tasks` memakai `supertest` dan database test terpisah. Pakai `overrideGuard(JwtAuthGuard)` kalau ingin melewati auth di sebagian test.
6. Jalankan `npm run test:cov` dan lihat bagian mana yang belum tersentuh test.

## Referensi

- [NestJS: Testing](https://docs.nestjs.com/fundamentals/testing)
- [Jest: Mock functions](https://jestjs.io/docs/mock-functions)
- [Jest: ECMAScript modules](https://jestjs.io/docs/ecmascript-modules)
