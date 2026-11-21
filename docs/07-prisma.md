# 07 · Prisma, Migrations & PostgreSQL

Bab ini membahas cara aplikasi berbicara dengan database: Prisma sebagai ORM, cara Prisma dibungkus menjadi provider Nest, dan cara skema database diubah dengan aman lewat migrations.

| Istilah | Artinya |
| --- | --- |
| **Schema** (`schema.prisma`) | Definisi model (tabel), kolom, dan relasi. Sumber kebenaran untuk struktur database. |
| **Prisma Client** | Kode TypeScript yang **di-generate** dari schema. Isinya method bertipe seperti `prisma.task.findMany()`. |
| **Driver adapter** | Penghubung Prisma Client dengan driver database JavaScript. Di sini `@prisma/adapter-pg`, yang memakai driver `pg`. |
| **Migration** | File SQL yang mencatat satu perubahan schema. Disimpan di git dan dijalankan berurutan. |

```text
schema.prisma ──generate──►  generated/prisma  (Prisma Client, gitignored)
      │
      └──migrate dev──►  prisma/migrations/<timestamp>_<nama>/migration.sql  ──►  PostgreSQL
```

---

## 1. Schema dan relasi

**File:** [schema.prisma](../prisma/schema.prisma)

```prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "postgresql"
}

model Task {
  id        Int      @id @default(autoincrement())
  title     String
  completed Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  createdBy Int
  creator   User     @relation(fields: [createdBy], references: [id], onDelete: Cascade)

  @@index([createdBy])
}

model User {
  ...
  tasks     Task[]
}
```

- `createdBy` adalah **kolom asli** di tabel (foreign key). `creator` dan `tasks` adalah **field relasi**: keduanya tidak menjadi kolom, tapi memungkinkan query seperti `include: { creator: true }`.
- `@updatedAt` diisi otomatis oleh Prisma setiap kali baris di-update.
- `onDelete: Cascade` berarti saat user dihapus, semua task miliknya ikut terhapus.
- `@@index([createdBy])` mempercepat `where: { createdBy }`. PostgreSQL **tidak** otomatis membuat index untuk kolom foreign key.
- Di Prisma 7, `datasource` tidak lagi berisi `url`. URL database dibaca dari [prisma7.config.ts](../prisma7.config.ts).

---

## 2. Prisma 7: generator baru dan driver adapter

**File:** [prisma.service.ts](../src/configs/prisma/prisma.service.ts), [prisma7.config.ts](../prisma7.config.ts)

```ts
import { PrismaClient } from '../../../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
    super({ adapter });
  }

  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

- Generator `prisma-client` (yang baru) menulis **kode TypeScript** ke `generated/prisma/`, yang di-import seperti file biasa, bukan dari `node_modules/@prisma/client`. Karena folder itu ada di luar `src/`, hasil build ada di `dist/src/main.js`, bukan di `dist/main.js`.
- Prisma 7 memakai **driver adapter**: koneksi ke Postgres dilakukan oleh driver `pg` (JavaScript), bukan oleh engine Rust seperti versi lama.
- `PrismaService extends PrismaClient` berarti service ini **adalah** Prisma Client, sehingga repo bisa langsung menulis `this.prisma.task.findMany()`.
- `OnModuleInit` dan `OnModuleDestroy` adalah **lifecycle hook** Nest. `onModuleInit` dipanggil setelah module selesai dibuat, sehingga koneksi dibuka saat startup dan error koneksi langsung ketahuan.
- `prisma7.config.ts` hanya dipakai oleh **CLI** Prisma (`generate`, `migrate`, `studio`). File ini meng-import `dotenv/config` untuk membaca `.env`, dan tidak ikut di-build (dikecualikan di `tsconfig.build.json`).

---

## 3. Query di repo

**File:** [tasks.repo.ts](../src/modules/tasks/tasks.repo.ts), [auth.repo.ts](../src/modules/auth/auth.repo.ts)

```ts
// TaskRepo.findAll
return this.prisma.task.findMany({
  where: { createdBy: userId },
  omit: { createdBy: true },
  include: { creator: { select: { id: true, email: true } } },
});
```

| Opsi | Fungsinya |
| --- | --- |
| `where` | filter |
| `select` | ambil **hanya** field yang disebut |
| `omit` | ambil semua field **kecuali** yang disebut |
| `include` | ikut sertakan relasi (JOIN) |

`select: { id, email }` di dalam `include` penting: tanpa itu, **hash password** user ikut terkirim di response.

`AuthRepo.create` memakai `omit: { password: true }` supaya response register tidak membawa hash password.

---

## 4. Migrations

**Folder:** [prisma/migrations/](../prisma/migrations/)

```text
prisma/migrations/
├── 20261118094537_setup/migration.sql             ← tabel Task, User, Feedback
├── 20261118114819_task_created_by/migration.sql   ← kolom createdBy + FK + index
└── migration_lock.toml                            ← provider: postgresql
```

| Perintah | Kapan dipakai | Yang dilakukan |
| --- | --- | --- |
| `prisma migrate dev --name x` | saat development, setelah mengubah schema | membuat file SQL baru, menerapkannya, lalu menjalankan generator |
| `prisma migrate deploy` | di server/production, termasuk sebelum `docker compose up` | hanya menerapkan migration yang belum dijalankan |
| `prisma generate` | setelah clone, atau setelah schema berubah | hanya membuat ulang Prisma Client |
| `prisma db push` | prototyping cepat | menyamakan database dengan schema **tanpa** membuat file migration |

Semua perintah di atas perlu `--config prisma7.config.ts`, karena nama file config-nya tidak standar.

Prisma mencatat migration yang sudah diterapkan di tabel `_prisma_migrations`. Karena itu `migrate deploy` aman dijalankan berulang kali: yang sudah dijalankan akan dilewati.

**Kenapa pindah dari `db push` ke migrations?** `db push` tidak meninggalkan jejak. Dengan migrations, setiap perubahan tersimpan sebagai SQL di git, bisa di-review, dan bisa diterapkan dengan urutan yang sama di laptop maupun server.

---

## Jebakan yang saya temui

- **Menambah kolom `NOT NULL` ke tabel yang sudah berisi data.** Migration `task_created_by` sendiri memberi peringatan: *"Added the required column `createdBy` to the `Task` table without a default value. This is not possible if the table is not empty."* Di database yang sudah ada task-nya, migration ini gagal. Solusi umumnya ada tiga langkah: tambah kolom sebagai nullable, isi datanya, lalu ubah menjadi `NOT NULL`.
- **Lupa `prisma generate`.** Setelah clone, `prisma.service.ts` gagal di-compile karena folder `generated/` belum ada (folder itu ada di `.gitignore`).
- **ESLint di editor basi setelah generate.** VS Code bisa terus melaporkan `no-unsafe-call` pada model baru. Solusinya **ESLint: Restart ESLint Server**, bukan mengubah kode.
- **`onModuleDestroy` tidak dipanggil saat Ctrl+C atau `docker stop`.** Hook ini hanya berjalan kalau `app.close()` dipanggil, atau kalau `app.enableShutdownHooks()` dipasang di `main.ts` supaya Nest mendengarkan sinyal `SIGTERM`/`SIGINT`. Saat ini `enableShutdownHooks()` belum dipasang.
- **`process.env.DATABASE_URL!`.** `PrismaService` membaca env langsung, bukan lewat `ConfigService`. Tanda `!` hanya membungkam TypeScript. Kalau variabelnya kosong, error baru muncul saat koneksi pertama.
- **`dev.db` masih ada di git**, padahal sekarang memakai PostgreSQL. File itu sisa dari masa SQLite.

---

## Latihan berikutnya

1. Pasang `app.enableShutdownHooks()` di `main.ts`, tambahkan `Logger` di `onModuleInit`/`onModuleDestroy`, lalu lihat log-nya saat menekan Ctrl+C.
2. Inject `ConfigService` ke `PrismaService` dan pakai `config.getOrThrow('DATABASE_URL')`.
3. **Relasi baru:** hubungkan `Feedback` ke `User` (`createdBy`), buat migration-nya dengan `migrate dev`, lalu buka file SQL yang dihasilkan sebelum di-commit.
4. **Migration aman untuk data lama:** latih pola tiga langkah (nullable → isi data → `NOT NULL`) dengan `migrate dev --create-only`, lalu edit SQL-nya sendiri sebelum diterapkan.
5. **Transaksi:** pakai `this.prisma.$transaction([...])` untuk operasi yang harus berhasil atau gagal bersama-sama, misalnya menghapus user beserta data terkaitnya.
6. Hapus `dev.db` dari git (`git rm --cached dev.db`).

## Referensi

- [NestJS: Prisma recipe](https://docs.nestjs.com/recipes/prisma)
- [NestJS: Lifecycle events](https://docs.nestjs.com/fundamentals/lifecycle-events)
- [Prisma: Migrate](https://www.prisma.io/docs/orm/prisma-migrate)
- [Prisma: Relations](https://www.prisma.io/docs/orm/prisma-schema/data-model/relations)
