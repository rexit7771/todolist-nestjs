# todolist-nestjs

REST API todo-list sederhana (ditambah modul feedback) yang saya buat untuk belajar [NestJS](https://nestjs.com). Project ini mencakup komponen inti NestJS: module, dependency injection, controller/service, validasi DTO, guard, autentikasi JWT, logging, dan Prisma sebagai ORM.

> Ini project belajar, bukan kode yang siap untuk production.

## Tech stack

- **NestJS 11** (Express) + TypeScript
- **Prisma 7** + **SQLite** (melalui driver adapter `better-sqlite3`)
- Autentikasi **JWT** (`@nestjs/jwt`) dengan hashing password memakai **bcryptjs**
- **class-validator** untuk validasi request
- **winston** (melalui `nest-winston`) untuk logging ke konsol dan ke file log yang dirotasi harian
- **Jest** untuk testing, **Bruno** untuk mencoba request API

## Memulai

### 1. Install dependency

```bash
npm install
```

### 2. Buat file `.env`

```env
DATABASE_URL="file:./dev.db"
JWT_SECRET="change-me"
JWT_EXPIRES_IN=3600   # dalam detik
PORT=3001
```

### 3. Siapkan database

File config Prisma bernama `prisma7.config.ts`, jadi harus disebutkan secara eksplisit:

```bash
npx prisma generate --config prisma7.config.ts   # generate Prisma client
npx prisma db push  --config prisma7.config.ts   # buat/sinkronkan tabel di dev.db
```

Jalankan `prisma generate` lagi setiap kali kamu mengubah `prisma/schema.prisma`.

> **Tips VS Code:** kalau ESLint menampilkan `Unsafe call of a type that could not be resolved` pada `this.prismaService.<model>` tepat setelah kamu menambah model, artinya server ESLint masih memakai cache tipe yang lama. Jalankan **ESLint: Restart ESLint Server** dari Command Palette.

### 4. Jalankan aplikasi

```bash
npm run start:dev    # mode watch
npm run start        # mode biasa
npm run build && npm run start:prod
```

API berjalan di `http://localhost:3001` (atau sesuai `PORT` yang kamu atur; default-nya 3000).

## Logging

Logger bawaan Nest diganti dengan [winston](https://github.com/winstonjs/winston) melalui [`nest-winston`](https://github.com/gremo/nest-winston) di `main.ts`. Hasilnya, log internal Nest, setiap request HTTP, dan log dari service memakai format yang sama:

```text
[17-11-2026, 10.15.42] info [HTTP]: GET /tasks 200 - 5ms
[17-11-2026, 10.15.50] warn [HTTP]: GET /feedback/99 404 - 3ms
```

| Output | Level | Lokasi |
| --- | --- | --- |
| Konsol (berwarna) | `debug` ke atas | terminal |
| File log (dirotasi harian, disimpan 60 hari) | `info` ke atas | `logs/<Bulan>/DD-MM-YYYY.log` |

Log startup bawaan Nest (`[NestFactory]`, `[InstanceLoader]`, `[RoutesResolver]`, `[RouterExplorer]`, `[NestApplication]`) diturunkan ke level `debug`. Log itu tetap tampil di konsol tapi tidak masuk ke file, supaya file log tidak penuh setiap kali aplikasi restart dalam mode `start:dev`.

Untuk menulis log dari kode sendiri, pakai `Logger` dari Nest (nama class akan muncul sebagai context):

```ts
private readonly logger = new Logger(TasksService.name);

this.logger.log('Task dibuat');
this.logger.error('Gagal', err.stack);
```

Konfigurasinya ada di [`src/configs/logger/winston.config.ts`](src/configs/logger/winston.config.ts), dan logging request ada di [`src/common/httpLogger.middleware.ts`](src/common/httpLogger.middleware.ts).

## API

| Method | Endpoint | Auth | Body |
| --- | --- | --- | --- |
| POST | `/auth/register` | – | `{ "email": "a@b.com", "password": "secret1" }` |
| POST | `/auth/login` | – | `{ "email": "a@b.com", "password": "secret1" }` → mengembalikan JWT |
| GET | `/tasks` | Bearer | – |
| GET | `/tasks/:id` | Bearer | – |
| POST | `/tasks` | Bearer | `{ "title": "Belajar NestJS" }` |
| PATCH | `/tasks/:id` | Bearer | `{ "completed": true, "title": "Belanja" }` (keduanya opsional) |
| DELETE | `/tasks/:id` | Bearer | – |
| GET | `/feedback` | Bearer | – |
| GET | `/feedback/:id` | Bearer | – |
| POST | `/feedback` | Bearer | `{ "name": "Budi", "message": "Mantap", "rating": 5 }` |
| PUT | `/feedback/:id` | Bearer | `{ "name": "Budi", "message": "Mantap", "rating": 4 }` (semua field wajib) |
| DELETE | `/feedback/:id` | Bearer | – |

`rating` harus berupa bilangan bulat dari 1 sampai 5.

Route yang diproteksi membutuhkan header `Authorization: Bearer <token>` (pakai token dari `/auth/login`).

Contoh:

```bash
curl -X POST http://localhost:3001/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@b.com","password":"secret1"}'

curl http://localhost:3001/tasks -H "Authorization: Bearer <token>"
```

Collection [Bruno](https://www.usebruno.com/) yang siap pakai ada di [`api-docs/todolist-netsjs`](api-docs/todolist-netsjs).

## Struktur project

```text
src/
├── main.ts                   # bootstrap + ValidationPipe global
├── app.module.ts             # root module + middleware logger HTTP
├── common/                   # HttpLoggerMiddleware
├── configs/
│   ├── prisma/               # PrismaModule & PrismaService
│   └── logger/               # config winston
└── modules/
    ├── auth/                 # register, login, JwtAuthGuard
    │   ├── dto/
    │   └── guards/
    ├── tasks/                # CRUD task (diproteksi)
    │   └── dto/
    └── feedback/             # CRUD feedback (diproteksi)
        └── dto/
prisma/schema.prisma          # model database (User, Task, Feedback)
api-docs/                     # collection API Bruno
```

Setiap module fitur mengikuti pola **Controller → Service → Repository**:

- **Controller**: menangani route, parameter, dan guard
- **Service**: logika bisnis dan error
- **Repository**: akses database melalui Prisma

## Script

| Perintah | Keterangan |
| --- | --- |
| `npm run start:dev` | Jalankan dalam mode watch |
| `npm run build` | Compile ke `dist/` |
| `npm run lint` | Lint & perbaikan otomatis |
| `npm run format` | Format dengan Prettier |
| `npm test` | Unit test |
| `npm run test:e2e` | End-to-end test |
| `npm run test:cov` | Coverage test |

## Yang sudah saya pelajari

- [x] Module, controller, provider & dependency injection
- [x] DTO + `ValidationPipe` (whitelist, pesan error kustom)
- [x] Pipe bawaan (`ParseIntPipe`)
- [x] Integrasi Prisma sebagai service yang bisa di-inject
- [x] Hashing password dengan bcryptjs
- [x] Autentikasi JWT dengan guard `CanActivate` buatan sendiri
- [x] Konfigurasi module secara async dengan `ConfigService`
- [x] Memakai ulang guard dari module lain (`AuthModule` meng-export → `FeedbackModule` meng-import)
- [x] Perbedaan `imports` / `providers` / `exports` di `@Module` (module masuk ke `imports`, bukan `providers`; provider bersifat privat sampai di-export)
- [x] Trade-off `@Global()`: lebih ringkas, tapi dependensi module jadi tidak terlihat di `imports` dan module lebih sulit di-test/dipakai ulang secara terpisah
- [x] Mengizinkan edit judul task
- [x] Unit test service dengan repository yang di-mock (`useValue` + `jest.fn()`)
- [x] Mengganti logger Nest dengan winston (`nest-winston`, file yang dirotasi harian)
- [x] Logging request dengan middleware (`NestModule.configure` + `MiddlewareConsumer`)

## Langkah selanjutnya / TODO

- [x] Hubungkan task ke user (relasi `Task.createdBy` → `User`, `GET /tasks` & `POST /tasks` memakai user yang login)
- [x] Cek kepemilikan task di `GET` / `PATCH` / `DELETE /tasks/:id` (403 kalau task milik user lain)
- [x] Sembunyikan hash password di response register (Prisma `omit` di `AuthRepo`)
- [x] Custom decorator `@CurrentUser()`
- [x] Refactor DTO update dengan `PartialType`
- [ ] Terapkan `PickType` & `PartialType` di DTO update feedback: `rating` lewat `PickType` (tetap wajib), `message` lewat `PartialType` (jadi optional), digabung dengan `IntersectionType`
- [ ] Tulis unit test untuk service dan controller lainnya (auth, feedback)
- [ ] Pakai Prisma migrations, bukan `db push`
- [ ] Dokumentasi Swagger / OpenAPI

### Eksplorasi lanjutan: module & dependency injection

- [ ] **Dynamic module**: buat sendiri modul dengan `register()` / `forRoot()` / `registerAsync()` (seperti `JwtModule.registerAsync` yang sudah dipakai), misalnya `PrismaModule.forRoot({ url })`, untuk memahami `DynamicModule`
- [ ] **Custom provider**: coba keempat bentuknya (`useClass`, `useValue`, `useFactory` + `inject`, `useExisting`) dan injection token non-class (`@Inject('TOKEN')`). Latihan: interface `FeedbackRepository` dengan dua implementasi (Prisma & in-memory), lalu tukar lewat module saja tanpa mengubah service
- [ ] **Lifecycle hooks**: `onModuleInit`, `onModuleDestroy`, `onApplicationBootstrap`, `enableShutdownHooks()` untuk menutup koneksi Prisma dengan rapi. Tambahkan `Logger` di setiap hook untuk melihat urutan eksekusinya
- [ ] **Circular dependency**: buat skenario `TasksService` ↔ `FeedbackService`, lihat error-nya, perbaiki dengan `forwardRef()`, lalu bandingkan dengan solusi yang lebih baik (pisahkan logika bersama ke modul ketiga)
- [ ] **Injection scope** (opsional): `Scope.DEFAULT` (singleton), `REQUEST`, `TRANSIENT`, dan bagaimana scope `REQUEST` "menular" ke provider yang bergantung padanya

## Referensi

- [Dokumentasi NestJS](https://docs.nestjs.com)
- [Dokumentasi Prisma](https://www.prisma.io/docs)
