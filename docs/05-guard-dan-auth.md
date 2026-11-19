# 05 · Guard, Autentikasi & `@CurrentUser()`

Bab ini membahas bagaimana aplikasi tahu **siapa** yang mengirim request (autentikasi), dan **boleh tidaknya** orang itu mengakses data tertentu (otorisasi).

| Istilah | Pertanyaannya | Status HTTP kalau gagal | Di repo ini |
| --- | --- | --- | --- |
| **Autentikasi** | "Kamu siapa?" | `401 Unauthorized` | `JwtAuthGuard` |
| **Otorisasi** | "Kamu boleh melakukan ini?" | `403 Forbidden` | pengecekan pemilik di `TasksService` |

Alurnya secara keseluruhan:

```text
1. POST /auth/register   → simpan user, password di-hash
2. POST /auth/login      → cek password, kembalikan JWT
3. GET  /tasks           → header "Authorization: Bearer <JWT>"
       │
       ├─ JwtAuthGuard   → verifikasi JWT, isi request.user = { id, email }
       ├─ @CurrentUser('id') → ambil id dari request.user
       └─ TasksService   → ambil hanya task dengan createdBy = id
```

---

## 1. Register & login

**File:** [auth.service.ts](../src/modules/auth/auth.service.ts) (`AuthService.register`, `AuthService.login`), [auth.repo.ts](../src/modules/auth/auth.repo.ts)

### Register

```ts
const existingUser = await this.authRepo.findByEmail(dto.email);
if (existingUser) throw new ConflictException('Email sudah terdaftar');

const hashedPassword = await hash(dto.password, 12);
```

- **Password tidak pernah disimpan apa adanya.** `hash()` dari `bcryptjs` menghasilkan hash satu arah. Angka `12` adalah *cost factor*: makin besar, makin lambat proses hash-nya, dan makin mahal juga bagi penyerang untuk menebak password dengan brute force.
- **`ConflictException` (409)** dipakai karena request-nya valid, tapi bentrok dengan data yang sudah ada.
- Response register tidak membawa hash password. Ini diatur di repo dengan Prisma `omit`:

  ```ts
  // AuthRepo.create
  return this.prisma.user.create({
    data: createUser,
    omit: { password: withoutPassword },
  });
  ```

### Login

```ts
if (!existingUser) throw new UnauthorizedException('Invalid email / password');
const isPasswordMatched = await compare(dto.password, existingUser.password);
if (!isPasswordMatched) throw new UnauthorizedException('Invalid email / password');

return this.jwt.signAsync({ id: existingUser.id, email: existingUser.email });
```

- **Pesan error sengaja dibuat sama** untuk "email tidak ada" dan "password salah". Kalau pesannya berbeda, penyerang bisa menebak email mana saja yang terdaftar (*user enumeration*).
- `compare()` meng-hash password yang dikirim dengan *salt* yang tersimpan di dalam hash lama, lalu membandingkan hasilnya.
- **Payload JWT** berisi `{ id, email }`. Isi payload ini nanti muncul lagi sebagai `request.user`. JWT hanya ditandatangani, tidak dienkripsi, jadi siapa pun yang memegang token bisa membaca isinya. Jangan pernah menaruh data rahasia di payload.

---

## 2. Mengonfigurasi `JwtModule` dengan `registerAsync`

**File:** [auth.module.ts](../src/modules/auth/auth.module.ts)

```ts
JwtModule.registerAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (config: ConfigService) => ({
    secret: config.getOrThrow<string>('JWT_SECRET'),
    signOptions: {
      expiresIn: Number(config.getOrThrow<string>('JWT_EXPIRES_IN')),
    },
  }),
}),
```

- `JwtModule` adalah **dynamic module**: module yang bisa dikonfigurasi saat di-import. Versi `register({...})` menerima nilai langsung. Versi `registerAsync` menerima **factory** yang boleh meminta dependency lewat `inject`.
- `registerAsync` dipakai di sini karena `JWT_SECRET` dibaca dari `ConfigService`, dan `ConfigService` baru bisa didapat lewat DI. Kalau ditulis `register({ secret: process.env.JWT_SECRET })`, ada risiko nilainya dibaca sebelum `.env` selesai dimuat.
- `getOrThrow` membuat aplikasi **gagal start** kalau variabelnya tidak ada. Ini lebih baik daripada aplikasi jalan dengan secret `undefined`.
- `JwtService` hasil konfigurasi ini dipakai di dua tempat: `AuthService` untuk **membuat** token (`signAsync`), dan `JwtAuthGuard` untuk **memverifikasi** token (`verifyAsync`).

---

## 3. Guard: `JwtAuthGuard`

**File:** [jwt-auth.guard.ts](../src/modules/auth/guards/jwt-auth.guard.ts)

### Konsep

Guard adalah class yang mengimplementasikan `CanActivate`. Nest memanggil `canActivate()` **sebelum** method controller dijalankan:

- return `true` → request lanjut ke pipe lalu ke controller.
- return `false` → Nest otomatis melempar `ForbiddenException` (403).
- melempar exception sendiri → exception itu yang dikirim ke client.

Karena guard menerima `ExecutionContext`, guard tahu **handler mana** yang akan dijalankan. Middleware tidak tahu hal itu. Inilah alasan pengecekan auth ditaruh di guard, bukan di middleware.

### Di repo ini

```ts
async canActivate(context: ExecutionContext): Promise<boolean> {
  const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
  const authorization = request.headers.authorization;

  if (!authorization) throw new UnauthorizedException('Token tidak ditemukan');

  const [type, token] = authorization.split(' ');
  if (type !== 'Bearer' || !token)
    throw new UnauthorizedException('Format token tidak valid');

  try {
    const payload = await this.jwtService.verifyAsync<{ id: number; email: string }>(token);
    request.user = payload;
    return true;
  } catch {
    throw new UnauthorizedException('Token tidak valid');
  }
}
```

Hal-hal yang perlu dicatat:

- `context.switchToHttp().getRequest()` mengambil object request Express. `ExecutionContext` sengaja dibuat umum supaya guard yang sama juga bisa dipakai untuk WebSocket atau microservice.
- Guard ini **melempar `UnauthorizedException` (401)**, bukan `return false`. Kalau `return false`, client menerima 403, padahal masalahnya adalah "belum login", bukan "tidak berhak".
- `verifyAsync` mengecek dua hal sekaligus: tanda tangan token (dibuat dengan `JWT_SECRET` yang sama atau tidak) dan masa berlakunya (`exp`). Kalau salah satunya gagal, fungsi ini melempar error, dan error itu ditangkap lalu diubah menjadi 401.
- `request.user = payload` adalah "titipan" untuk tahap berikutnya. Guard yang mengisinya, dan `@CurrentUser()` yang membacanya.

### Memasang guard

```ts
@UseGuards(JwtAuthGuard)
@Controller('tasks')
export class TasksController { ... }
```

Ada tiga tingkat pemasangan guard:

| Tingkat | Cara | Contoh di repo |
| --- | --- | --- |
| Satu method | `@UseGuards()` di atas method | – |
| Satu controller | `@UseGuards()` di atas class | `TasksController`, `FeedbackController` |
| Seluruh aplikasi | provider `APP_GUARD` atau `app.useGlobalGuards()` | – (lihat latihan) |

---

## 4. Memakai guard di module lain

**File:** [auth.module.ts](../src/modules/auth/auth.module.ts), [tasks.module.ts](../src/modules/tasks/tasks.module.ts), [feedback.module.ts](../src/modules/feedback/feedback.module.ts)

```ts
// AuthModule
providers: [AuthService, AuthRepo, JwtAuthGuard],
exports: [JwtAuthGuard, JwtModule],

// TasksModule dan FeedbackModule
imports: [PrismaModule, AuthModule],
```

Ada detail yang mudah terlewat di sini. Saat menulis `@UseGuards(JwtAuthGuard)` (dengan class, bukan instance), Nest **membuat instance guard di dalam module milik controller itu**, yaitu `TasksModule`. Constructor guard butuh `JwtService`, jadi **`JwtService` harus bisa ditemukan dari `TasksModule`**.

Yang membuat ini berhasil adalah `exports: [JwtModule]` di `AuthModule`. Ini contoh **re-export**: `TasksModule` meng-import `AuthModule`, dan karena `AuthModule` meng-export `JwtModule`, `TasksModule` ikut mendapat `JwtService`.

Coba buktikan sendiri: hapus `JwtModule` dari `exports` di `AuthModule`. Aplikasi akan gagal start dengan error sejenis *"Nest can't resolve dependencies of the JwtAuthGuard (?)... JwtService"*.

---

## 5. Custom decorator `@CurrentUser()`

**File:** [currentUser.decorator.ts](../src/modules/auth/decorators/currentUser.decorator.ts), [tasks.controller.ts](../src/modules/tasks/tasks.controller.ts)

### Konsep

`createParamDecorator` membuat decorator parameter sendiri, seperti `@Body()` atau `@Param()` bawaan Nest. Fungsinya menerima dua argumen:

- `data`: nilai yang ditulis di dalam kurung decorator, misalnya `'id'` pada `@CurrentUser('id')`.
- `ctx`: `ExecutionContext`, sama seperti di guard.

### Di repo ini

```ts
export const CurrentUser = createParamDecorator(
  (data: keyof JwtUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user: JwtUser }>();
    const user = request.user;
    return data ? user[data] : user;
  },
);
```

Cara pakainya di controller:

```ts
@Get()
findAll(@CurrentUser('id') userId: number) {
  return this.taskService.findAll(userId);
}
```

Kenapa tidak pakai `@Req() req` lalu `req.user.id` saja?

- **Controller tidak bergantung pada Express.** Controller cukup minta "id user", tanpa tahu dari mana asalnya.
- **Lebih mudah di-test.** Saat unit test, kita cukup memanggil `controller.findAll(1)`, tanpa perlu membuat object request palsu.
- **Bertipe.** `data: keyof JwtUser` membuat TypeScript menolak `@CurrentUser('nama')` karena field itu tidak ada di `JwtUser`.

---

## 6. Otorisasi: hanya pemilik yang boleh

**File:** [tasks.service.ts](../src/modules/tasks/tasks.service.ts), [tasks.repo.ts](../src/modules/tasks/tasks.repo.ts), [schema.prisma](../prisma/schema.prisma)

Guard hanya menjawab "kamu siapa". Pertanyaan "task ini milikmu atau bukan" dijawab di **service**, karena itu aturan bisnis dan butuh data dari database.

Ada dua pola yang dipakai.

**a. Filter langsung di query** untuk list:

```ts
// TaskRepo.findAll
return this.prisma.task.findMany({ where: { createdBy: userId }, ... });
```

**b. Ambil dulu, lalu cek pemiliknya** untuk satu item:

```ts
// TasksService.findById
const task = await this.taskRepo.findById(id);
if (!task) throw new NotFoundException('Task Not Found');
if (userId !== task.createdBy) throw new ForbiddenException(...);
```

`update` dan `delete` memanggil `findById` lebih dulu, jadi pengecekan pemiliknya ikut terbawa.

Di sisi database, relasinya didefinisikan di `schema.prisma`:

```prisma
createdBy Int
creator   User @relation(fields: [createdBy], references: [id], onDelete: Cascade)
@@index([createdBy])
```

`onDelete: Cascade` berarti task ikut terhapus kalau user-nya dihapus. `@@index` mempercepat query `where: { createdBy }`.

---

## Jebakan yang saya temui

- **`JWT_EXPIRES_IN` harus dalam detik.** Nilainya dibungkus `Number(...)`, jadi `"1h"` berubah menjadi `NaN`.
- **`@CurrentUser()` hanya berfungsi di route yang dijaga `JwtAuthGuard`.** Tanpa guard, `request.user` bernilai `undefined`, sehingga `user[data]` melempar `TypeError`, dan client menerima 500, bukan 401.
- **Urutan eksekusi: middleware jalan sebelum guard.** Karena itu `HttpLoggerMiddleware` tetap mencatat request yang ditolak guard, dan request itu tercatat sebagai `warn ... 401`.
- **Ada pengecekan pemilik yang tidak pernah berjalan.** `update` dan `delete` mengecek `task.createdBy !== userId` lagi, padahal `findById` sudah melempar 403 lebih dulu. Kodenya tidak salah, tapi tidak berguna.
- **Unit test bisa lulus karena kebetulan.** Setelah pengecekan pemilik ditambahkan, `tasks.service.spec.ts` masih memanggil `service.update(1, dto)` tanpa `userId`, dan data mock-nya tidak punya `createdBy`. `undefined !== undefined` bernilai `false`, jadi test lulus walaupun skenarionya tidak lagi realistis.

---

## Latihan berikutnya

1. **Perbaiki test ownership.** Di `tasks.service.spec.ts`, kirim `userId`, beri mock `createdBy`, lalu tambahkan satu test yang mengharapkan `ForbiddenException`.
2. **Hapus pengecekan ganda** di `TasksService.update` dan `TasksService.delete`.
3. **403 atau 404?** Saat ini, user lain bisa tahu bahwa task dengan ID tertentu *ada* (dapat 403, bukan 404). Coba ubah repo menjadi `findFirst({ where: { id, createdBy: userId } })` dan selalu kembalikan 404. Lalu pikirkan kelebihan dan kekurangan kedua pendekatan.
4. **Guard global + `@Public()`.** Daftarkan `JwtAuthGuard` sebagai `APP_GUARD`, buat decorator `@Public()` dengan `SetMetadata`, lalu baca metadata itu di guard memakai `Reflector`, supaya `/auth/register` dan `/auth/login` tetap terbuka. Ini memperkenalkan konsep **metadata + Reflector**.
5. **Role-based guard.** Tambahkan field `role` di `User`, decorator `@Roles('admin')`, dan `RolesGuard`. Lalu coba urutkan beberapa guard: `@UseGuards(JwtAuthGuard, RolesGuard)`.
6. **Bandingkan dengan Passport.** Baca bagian *Authentication* di dokumentasi Nest (`@nestjs/passport` + `passport-jwt`). Catat apa saja yang dikerjakan Passport untukmu, dan apa saja yang sekarang kamu tulis sendiri.

## Referensi

- [NestJS: Guards](https://docs.nestjs.com/guards)
- [NestJS: Authentication](https://docs.nestjs.com/security/authentication)
- [NestJS: Custom decorators](https://docs.nestjs.com/custom-decorators)
- [NestJS: Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules)
