# 08 · Logging dengan winston

Nest punya logger bawaan (`ConsoleLogger`) yang hanya menulis ke konsol. Repo ini menggantinya dengan **winston**, supaya log juga tersimpan ke file yang dirotasi setiap hari, dengan format yang sama untuk semua sumber log.

| Istilah | Artinya |
| --- | --- |
| **Level** | Tingkat kepentingan log. Di winston (dari paling penting): `error`, `warn`, `info`, `http`, `verbose`, `debug`, `silly`. |
| **Transport** | Tujuan log, misalnya konsol atau file. Setiap transport punya level minimum sendiri. |
| **Format** | Fungsi yang mengolah object log (menambah timestamp, memberi warna, menyusun baris teks). |
| **Context** | Label sumber log, misalnya `[TasksService]` atau `[HTTP]`. |

```text
new Logger('TasksService').log('...')     (kode aplikasi)
Log internal Nest (InstanceLoader, ...)
ExceptionsHandler (error 500)
             │
             ▼
nest-winston (LoggerService)  ──►  winston logger
                                     │  format level logger: errors + demoteNestInternals
                                     ├──►  Console    (level debug, berwarna)
                                     └──►  DailyRotateFile (level info, logs/<Bulan>/DD-MM-YYYY.log)
```

---

## 1. Mengganti logger Nest

**File:** [main.ts](../src/main.ts)

```ts
const app = await NestFactory.create(AppModule, {
  logger: WinstonModule.createLogger(winstonConfig),
});
```

- `WinstonModule.createLogger()` dari `nest-winston` membuat object yang mengimplementasikan interface `LoggerService` milik Nest, tetapi di baliknya memakai winston.
- Logger dipasang **di dalam** `NestFactory.create`, yaitu **sebelum** module dibangun. Karena itu log startup (`InstanceLoader`, `RouterExplorer`) dan error 500 dari `ExceptionsHandler` juga lewat winston.
- Repo ini tidak memakai `WinstonModule.forRoot()` atau meng-inject `WINSTON_MODULE_PROVIDER`. Cara itu baru aktif setelah module dibangun, sehingga log startup terlewat.

### Menulis log dari kode sendiri

**File:** [feedback.service.ts](../src/modules/feedback/feedback.service.ts), [httpLogger.middleware.ts](../src/common/httpLogger.middleware.ts)

```ts
private readonly logger = new Logger(FeedbackService.name);

this.logger.log('...');               // → level info
this.logger.warn('...');
this.logger.error('Gagal', err.stack);
this.logger.debug('...');
```

`Logger` dari `@nestjs/common` adalah **perantara**: ia meneruskan semua log ke logger yang sedang aktif (di sini winston). Keuntungannya:

- Kode aplikasi tidak bergantung langsung pada winston. Kalau suatu saat logger diganti, kode service tidak perlu diubah.
- `FeedbackService.name` menjadi context, dan muncul sebagai `[FeedbackService]` di log.
- Unit test tidak perlu me-mock logger.

Perhatikan: `logger.log()` di Nest dipetakan ke level `info` di winston.

---

## 2. Konfigurasi winston

**File:** [winston.config.ts](../src/configs/logger/winston.config.ts)

### Dua transport

```ts
transports: [
  new winston.transports.Console({ level: 'debug', format: combine(timestampFormat, colorize(), lineFormat), ... }),
  new DailyRotateFile({
    dirname: path.join(process.cwd(), 'logs'),
    filename: '%DATE%.log',
    datePattern: 'MMMM/DD-MM-YYYY',   // → logs/November/21-11-2026.log
    level: 'info',
    maxFiles: '60d',
    ...
  }),
],
```

| Transport | Level minimum | Tujuan |
| --- | --- | --- |
| Console | `debug` | semua log tampil di terminal saat development |
| DailyRotateFile | `info` | file baru setiap hari, disimpan 60 hari, tanpa log `debug` |

`datePattern` mengandung `/`, sehingga nama bulan menjadi **sub-folder**.

### Format satu baris

```text
[21-11-2026, 10.15.42] info [HTTP]: GET /tasks 200 - 5ms
[21-11-2026, 10.15.50] warn [HTTP]: GET /feedback/99 404 - 3ms
```

Baris ini disusun oleh `lineFormat` (`winston.format.printf`). Kalau ada stack trace, trace-nya ditulis di baris berikutnya.

### Menurunkan log startup Nest ke `debug`

Setiap kali aplikasi start, termasuk setiap restart dalam mode `start:dev`, Nest menulis puluhan baris `InstanceLoader` dan `RouterExplorer`. Kalau baris-baris itu masuk ke file, file log cepat penuh. Format `demoteNestInternals` menurunkannya dari `info` ke `debug`, sehingga tetap tampil di konsol tetapi tidak masuk file:

```ts
const LEVEL = Symbol.for('level');

const demoteNestInternals = winston.format((info) => {
  if (info.level === 'info' && typeof info.context === 'string' && NEST_INTERNAL_CONTEXTS.has(info.context)) {
    info.level = 'debug';    // yang ditampilkan
    info[LEVEL] = 'debug';   // yang dipakai transport untuk memfilter
  }
  return info;
});
```

Dua hal penting di sini:

1. **Ada dua "level" di object log.** `info.level` adalah teks yang ditampilkan (dan bisa diberi warna oleh `colorize`). `info[Symbol.for('level')]` adalah level asli yang dipakai transport untuk memfilter. Kalau hanya `info.level` yang diubah, baris log tetap masuk file, hanya labelnya yang berubah.
2. **Format ini dipasang di level logger, bukan di transport.** Format di level logger berjalan **sebelum** setiap transport memeriksa level, sehingga perubahan level ikut menentukan log mana yang masuk file.

---

## Jebakan yang saya temui

- **Stack trace hilang kalau mengirim object `Error`.** `nest-winston` mengirim `stack` dalam bentuk **array** (`[trace]`), sedangkan `format.errors` winston mengirim string. `normalizeStack()` menangani keduanya, tetapi hanya mengambil isi yang berupa string. Jadi tulis `logger.error(msg, err.stack)`, **bukan** `logger.error(msg, err)`. Kesalahan ini masih ada di `.catch` bootstrap di `main.ts`.
- **Tipe `unknown` di `printf`.** Semua field `info` kecuali `level` bertipe `unknown`. Field-nya harus dipersempit dengan `typeof` atau `String()`. Kalau memakai cast `as`, aturan ESLint `restrict-template-expressions` dan `no-base-to-string` gagal.
- **404 dicatat sebagai `error`.** `FeedbackService.getById` memanggil `logger.error` saat feedback tidak ditemukan. 404 adalah kesalahan client yang wajar, jadi `warn` lebih cocok. Lagipula middleware HTTP sudah mencatatnya sebagai `warn`, sehingga sekarang satu request tercatat dua kali.
- **Folder `logs/` relatif terhadap `process.cwd()`.** Kalau aplikasi dijalankan dari folder lain, log ditulis ke tempat yang berbeda. Di Docker, `/app/logs` disimpan di volume `app-logs`.

---

## Latihan berikutnya

1. Perbaiki `.catch` di `main.ts` menjadi `logger.error('Failed to start Server', err instanceof Error ? err.stack : String(err))`, lalu uji dengan sengaja mengosongkan `JWT_SECRET`.
2. Ubah log "not found" di `FeedbackService` menjadi `warn`, atau hapus saja, lalu pikirkan kapan log di service benar-benar menambah informasi dibanding log HTTP.
3. Tambahkan transport file khusus `error` (misalnya `logs/<Bulan>/DD-MM-YYYY.error.log`) dengan `level: 'error'`.
4. Buat level konsol bisa diatur lewat env, misalnya `LOG_LEVEL=info` di production.
5. Coba format JSON (`winston.format.json()`) untuk file log, lalu pikirkan kenapa format JSON lebih disukai alat seperti Loki atau ELK.
6. Gabungkan dengan latihan request ID di [bab 06](06-middleware.md#latihan-berikutnya), sehingga semua log dari satu request punya ID yang sama.

## Referensi

- [NestJS: Logger](https://docs.nestjs.com/techniques/logger)
- [nest-winston](https://github.com/gremo/nest-winston)
- [winston](https://github.com/winstonjs/winston)
- [winston-daily-rotate-file](https://github.com/winstonjs/winston-daily-rotate-file)
