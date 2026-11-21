# 06 · Middleware

**Middleware** adalah fungsi yang dijalankan **paling awal** untuk setiap request, sebelum guard, pipe, dan controller. Konsepnya sama persis dengan middleware Express: menerima `req`, `res`, dan `next()`.

| | Middleware | Guard |
| --- | --- | --- |
| Kapan jalan | paling awal | setelah middleware |
| Tahu handler mana yang akan dipanggil? | **tidak** | ya (lewat `ExecutionContext`) |
| Cocok untuk | logging, CORS, request ID, parsing | autentikasi, otorisasi |
| Cara meneruskan request | memanggil `next()` | `return true` |

Middleware tidak tahu controller atau method mana yang akan menangani request. Karena itu pengecekan auth lebih cocok di guard, sedangkan hal umum seperti logging cocok di middleware.

---

## 1. `HttpLoggerMiddleware`

**File:** [httpLogger.middleware.ts](../src/common/httpLogger.middleware.ts)

```ts
@Injectable()
export class HttpLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(req: Request, res: Response, next: NextFunction) {
    const start = Date.now();
    res.on('finish', () => {
      const msg = `${req.method} ${req.originalUrl} ${res.statusCode} - ${Date.now() - start}ms`;
      if (res.statusCode >= 500) this.logger.error(msg);
      else if (res.statusCode >= 400) this.logger.warn(msg);
      else this.logger.log(msg);
    });
    next();
  }
}
```

Langkah-langkahnya:

1. Catat waktu mulai.
2. **Daftarkan listener** ke event `finish`. Event ini dipicu setelah response selesai dikirim, sehingga status code dan durasinya sudah diketahui.
3. Panggil `next()` supaya request lanjut ke guard dan controller.

Hal yang perlu dicatat:

- **Kalau `next()` lupa dipanggil, request menggantung** sampai timeout, karena tidak ada tahap berikutnya yang dijalankan.
- Status code baru final **setelah** controller selesai, dan bahkan setelah exception filter mengubah exception menjadi 404/500. Karena itu logging dilakukan di `finish`, bukan langsung di `use()`.
- `req.originalUrl` dipakai, bukan `req.url`, karena `req.url` bisa berubah kalau ada routing bertingkat. `originalUrl` selalu berisi URL asli beserta query string-nya.
- Level log disesuaikan dengan status: 5xx `error`, 4xx `warn`, sisanya `log` (detail level di [bab 08](08-logging.md)).
- Middleware class ditandai `@Injectable()`, jadi ia **bisa memakai DI**. Misalnya, ia bisa meng-inject `ConfigService`.

---

## 2. Mendaftarkan middleware

**File:** [app.module.ts](../src/app.module.ts)

```ts
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(HttpLoggerMiddleware).forRoutes('*');
  }
}
```

- Berbeda dengan provider, middleware **tidak** didaftarkan di `@Module({...})`. Middleware didaftarkan lewat method `configure()` dari interface `NestModule`.
- `forRoutes('*')` berarti semua route. Bisa juga dibatasi, misalnya `forRoutes('tasks')`, `forRoutes(TasksController)`, atau `forRoutes({ path: 'tasks', method: RequestMethod.POST })`.
- `.exclude(...)` dipakai untuk mengecualikan route tertentu.

Kenapa tidak memakai `app.use(...)` di `main.ts` saja? `app.use()` menerima middleware Express biasa, yang **tidak** bisa memakai DI Nest. Dengan `consumer.apply()`, Nest yang membuat instance middleware, sehingga dependency bisa di-inject.

---

## Jebakan yang saya temui

- **Request yang ditolak guard tetap tercatat.** Middleware jalan lebih dulu dan mendaftarkan listener `finish` sebelum guard menolak. Jadi request tanpa token tercatat sebagai `warn [HTTP]: GET /tasks 401 - 2ms`. Ini justru berguna.
- **404 tercatat dua kali.** Kalau feedback tidak ditemukan, `FeedbackService` mencatat `error`, lalu middleware mencatat `warn ... 404` untuk request yang sama. Lebih baik service mencatat 404 sebagai `warn`, atau tidak mencatatnya sama sekali (lihat [bab 08](08-logging.md#jebakan-yang-saya-temui)).
- **Request yang dibatalkan client.** Kalau client memutus koneksi sebelum response selesai, `finish` tidak pernah dipicu, sehingga request itu tidak tercatat. Event `close` dipicu dalam kedua kasus.

---

## Latihan berikutnya

1. **Request ID.** Buat middleware yang membuat ID unik (`crypto.randomUUID()`), menaruhnya di header response `X-Request-Id`, lalu ikut menuliskannya di baris log `HttpLoggerMiddleware`. Ini sangat membantu saat mencari satu request di file log.
2. **Functional middleware.** Tulis ulang `HttpLoggerMiddleware` sebagai fungsi biasa `(req, res, next) => {...}`, lalu bandingkan: apa yang hilang kalau tidak memakai class?
3. Kecualikan route tertentu dari logging dengan `.exclude(...)`.
4. **Interceptor** (konsep berikutnya): buat `LoggingInterceptor` yang mencatat durasi eksekusi **handler** saja. Bandingkan hasilnya dengan durasi dari middleware. Interceptor jalan setelah guard dan tahu handler mana yang dipanggil.

## Referensi

- [NestJS: Middleware](https://docs.nestjs.com/middleware)
- [NestJS: Request lifecycle](https://docs.nestjs.com/faq/request-lifecycle)
- [NestJS: Interceptors](https://docs.nestjs.com/interceptors)
