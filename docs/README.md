# Catatan Belajar NestJS

Catatan konsep-konsep NestJS yang saya pelajari lewat project ini. Setiap contoh diambil dari kode di repo ini, jadi bisa langsung dibuka dan dicoba.

## Pola setiap bab

1. **Konsepnya apa.** Penjelasan singkat dengan bahasa sendiri.
2. **Di repo ini.** Link ke file yang jadi contoh, plus potongan kode pendek.
3. **Jebakan yang saya temui.** Hal-hal yang sempat bikin bingung atau error.
4. **Latihan berikutnya.** Ide untuk memperdalam konsepnya.

> Link di sini menunjuk ke **file** dan **nama class/method**, bukan nomor baris, karena nomor baris cepat berubah. Kalau perlu menunjuk kode versi tertentu, pakai permalink GitHub ke commit-nya.

## Daftar isi

Urutannya kira-kira sama dengan urutan sebuah request diproses, dari module sampai database.

| # | Bab | Status |
| --- | --- | --- |
| 01 | [Module & dependency injection](01-module-dan-di.md) | ✅ |
| 02 | [Controller → Service → Repo](02-controller-service-repo.md) | ✅ |
| 03 | [DTO & `ValidationPipe` (termasuk `PartialType`)](03-dto-dan-validation-pipe.md) | ✅ |
| 04 | [Pipes (`ParseIntPipe`)](04-pipes.md) | ✅ |
| 05 | [Guard, autentikasi & `@CurrentUser()`](05-guard-dan-auth.md) | ✅ |
| 06 | [Middleware (`HttpLoggerMiddleware`)](06-middleware.md) | ✅ |
| 07 | [Prisma, migrations & PostgreSQL](07-prisma.md) | ✅ |
| 08 | [Logging dengan winston](08-logging.md) | ✅ |
| 09 | [Unit testing dengan mock](09-unit-testing.md) | ✅ |
| 10 | [Docker & Docker Compose](10-docker-dan-compose.md) | ✅ |

## Gambaran besar: perjalanan sebuah request

```text
Request masuk
   │
   ▼
Middleware        HttpLoggerMiddleware            (bab 06)
   │
   ▼
Guard             JwtAuthGuard                    (bab 05)
   │
   ▼
Interceptor       (belum dipakai di repo ini)
   │
   ▼
Pipe              ValidationPipe, ParseIntPipe    (bab 03, 04)
   │
   ▼
Controller        TasksController                 (bab 02)
   │
   ▼
Service           TasksService                    (bab 02)
   │
   ▼
Repo → Prisma     TaskRepo → PrismaService        (bab 07)
```

Kalau salah satu tahap melempar exception (misalnya guard melempar `UnauthorizedException`), tahap sesudahnya tidak dijalankan. Exception itu lalu diubah oleh *exception filter* bawaan Nest menjadi response JSON.
