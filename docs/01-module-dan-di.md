# 01 · Module & Dependency Injection

Bab ini membahas dua hal yang jadi fondasi semua bab lain: **module** (cara Nest mengelompokkan kode) dan **dependency injection** (cara Nest membuat object dan memberikannya ke class yang membutuhkan).

| Istilah | Artinya |
| --- | --- |
| **Provider** | Class yang dibuat dan dikelola Nest, biasanya ditandai `@Injectable()`. Contoh: `TasksService`, `TaskRepo`, `PrismaService`. |
| **Module** | Class dengan `@Module()` yang menyatakan provider dan controller apa saja yang dimilikinya, dan apa yang dibagikan ke module lain. |
| **Injector / DI container** | Bagian dari Nest yang membuat instance provider dan memberikannya lewat constructor. |
| **Token** | "Kunci" untuk mencari provider. Biasanya class-nya sendiri, misalnya `TaskRepo`. |

---

## 1. Dependency injection lewat constructor

**File:** [tasks.service.ts](../src/modules/tasks/tasks.service.ts), [tasks.repo.ts](../src/modules/tasks/tasks.repo.ts)

```ts
@Injectable()
export class TasksService {
  constructor(private readonly taskRepo: TaskRepo) {}
}
```

`TasksService` tidak pernah menulis `new TaskRepo(...)`. Ia hanya **menyatakan** butuh `TaskRepo`, dan Nest yang menyediakannya. Rantainya:

```text
TasksController  butuh  TasksService
TasksService     butuh  TaskRepo
TaskRepo         butuh  PrismaService
```

Nest membaca rantai ini, lalu membuat instance dari ujung paling bawah: `PrismaService` → `TaskRepo` → `TasksService` → `TasksController`.

**Bagaimana Nest tahu tipe parameter constructor?** TypeScript biasanya menghapus informasi tipe saat compile. Opsi `emitDecoratorMetadata: true` di [tsconfig.json](../tsconfig.json) membuat TypeScript menyimpan tipe parameter constructor sebagai metadata, untuk class yang punya decorator. Nest membaca metadata itu lewat `reflect-metadata`. Inilah alasan `@Injectable()` tetap perlu ditulis, walaupun kelihatannya "tidak melakukan apa-apa".

**Kenapa repot memakai DI?**

- **Mudah di-test.** Di unit test, `TaskRepo` bisa diganti dengan object palsu tanpa mengubah `TasksService` (lihat [bab 09](09-unit-testing.md)).
- **Satu instance dipakai bersama.** Secara default provider bersifat *singleton*: satu instance untuk seluruh aplikasi. Jadi hanya ada satu `PrismaService`, dan hanya ada satu pool koneksi database.

---

## 2. Anatomi `@Module()`

**File:** [auth.module.ts](../src/modules/auth/auth.module.ts), [tasks.module.ts](../src/modules/tasks/tasks.module.ts), [prisma.module.ts](../src/configs/prisma/prisma.module.ts)

```ts
@Module({
  imports: [PrismaModule, AuthModule],    // module lain yang export-nya ingin saya pakai
  controllers: [TasksController],         // controller milik module ini
  providers: [TasksService, TaskRepo],    // provider milik module ini
  exports: [],                            // provider yang boleh dipakai module lain
})
export class TasksModule {}
```

| Properti | Isinya | Catatan |
| --- | --- | --- |
| `imports` | **module** | bukan class service |
| `controllers` | controller | controller tidak bisa di-export |
| `providers` | provider milik module ini | bersifat **privat** sampai di-export |
| `exports` | provider atau module | yang boleh dipakai oleh module yang meng-import |

Aturan pentingnya: **provider bersifat privat secara default.** `PrismaService` didaftarkan di `PrismaModule`, lalu di-export:

```ts
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

Setelah itu, setiap module yang meng-import `PrismaModule` bisa meng-inject `PrismaService`. Module juga singleton, jadi `TasksModule`, `AuthModule`, dan `FeedbackModule` semuanya mendapat **instance `PrismaService` yang sama**.

### Re-export

`AuthModule` meng-export `JwtModule`, yaitu sebuah module, bukan provider:

```ts
exports: [JwtAuthGuard, JwtModule],
```

Ini disebut *re-export*. Module yang meng-import `AuthModule` ikut mendapat semua yang di-export `JwtModule`, termasuk `JwtService`. Inilah yang membuat `JwtAuthGuard` bisa berjalan di `TasksModule` dan `FeedbackModule` (detailnya di [bab 05](05-guard-dan-auth.md#4-memakai-guard-di-module-lain)).

---

## 3. Root module dan module global

**File:** [app.module.ts](../src/app.module.ts), [main.ts](../src/main.ts)

```ts
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TasksModule,
    AuthModule,
    JwtModule,
    FeedbackModule,
  ],
})
export class AppModule implements NestModule { ... }
```

- `AppModule` adalah **root module**. `NestFactory.create(AppModule)` di `main.ts` mulai membangun aplikasi dari sini, lalu menelusuri semua `imports`.
- `ConfigModule.forRoot({ isGlobal: true })` adalah contoh **dynamic module** (module yang dikonfigurasi saat di-import), dan sekaligus **module global**. Karena global, `ConfigService` bisa di-inject di mana saja tanpa meng-import `ConfigModule` lagi.
- `PrismaModule` sengaja **tidak** dibuat global. Setiap module fitur meng-import-nya sendiri, jadi dari daftar `imports` saja sudah kelihatan module mana yang memakai database.

| | Module global | Module biasa |
| --- | --- | --- |
| Kelebihan | ringkas, tidak perlu import berulang | ketergantungan terlihat jelas di `imports` |
| Kekurangan | ketergantungan jadi "tersembunyi" | lebih banyak baris import |
| Cocok untuk | hal yang benar-benar dipakai di mana-mana (config, logger) | sebagian besar module |

---

## Jebakan yang saya temui

- **Menaruh module di `providers`.** Commit `0425fd2` ("delete PrismaModule from Providers") memperbaiki kesalahan ini. Module masuk ke `imports`, provider masuk ke `providers`. Kalau tertukar, Nest akan error, atau provider-nya terdaftar dengan cara yang tidak dimaksud.
- **Mendaftarkan provider yang sama di dua module.** Kalau `PrismaService` ditulis langsung di `providers` milik `TasksModule` *dan* `FeedbackModule`, Nest membuat **dua instance** dengan dua pool koneksi. Cara yang benar: daftarkan sekali di satu module, export, lalu import module tersebut.
- **Import yang tidak berguna.** `AppModule` meng-import `JwtModule` polos (tanpa `register`). Import itu tidak melakukan apa-apa, karena `JwtModule` yang terkonfigurasi sudah disediakan oleh `AuthModule`.
- **Pesan error DI.** Kalau muncul *"Nest can't resolve dependencies of the X (?). Please make sure that the argument Y at index [0] is available in the Z module"*, bacanya begini: "class X butuh Y, tapi Y tidak ditemukan dari dalam module Z". Biasanya penyebabnya lupa `exports` di module asal, atau lupa `imports` di module Z.
- **Sisa scaffold.** `app.controller.ts` dan `app.service.ts` masih ada di `src/`, tapi tidak didaftarkan di `AppModule`, jadi Nest mengabaikannya.

---

## Latihan berikutnya

1. **Hapus `JwtModule` dari `imports` `AppModule`**, lalu pastikan aplikasi tetap berjalan normal.
2. **Lihat error DI dengan mata sendiri.** Hapus `PrismaModule` dari `imports` `TasksModule`, jalankan `npm run start:dev`, baca pesan errornya, lalu kembalikan.
3. **Custom provider.** Coba keempat bentuknya: `useClass`, `useValue`, `useFactory` + `inject`, dan `useExisting`. Latihannya: buat interface `FeedbackRepository` dengan dua implementasi (Prisma dan in-memory), lalu tukar implementasinya hanya dengan mengubah module, tanpa menyentuh service. Karena interface hilang saat runtime, kamu perlu token string atau symbol dan `@Inject('FEEDBACK_REPO')`.
4. **Dynamic module sendiri.** Buat `PrismaModule.forRoot({ url })` yang mengembalikan `DynamicModule`, meniru cara kerja `ConfigModule.forRoot` dan `JwtModule.registerAsync`.
5. **Circular dependency.** Buat `TasksService` dan `FeedbackService` saling membutuhkan, lihat error-nya, perbaiki dengan `forwardRef()`, lalu bandingkan dengan solusi yang lebih bersih: pindahkan logika bersama ke module ketiga.

## Referensi

- [NestJS: Modules](https://docs.nestjs.com/modules)
- [NestJS: Providers](https://docs.nestjs.com/providers)
- [NestJS: Custom providers](https://docs.nestjs.com/fundamentals/custom-providers)
- [NestJS: Dynamic modules](https://docs.nestjs.com/fundamentals/dynamic-modules)
