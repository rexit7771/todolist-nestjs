import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import * as path from 'path';

const timestampFormat = winston.format.timestamp({
  format: () => {
    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const date = [
      pad(now.getDate()),
      pad(now.getMonth() + 1),
      now.getFullYear(),
    ].join('-');
    const time = [
      pad(now.getHours()),
      pad(now.getMinutes()),
      pad(now.getSeconds()),
    ].join('.');
    return `${date}, ${time}`;
  },
});

// nest-winston mengirim stack sebagai ARRAY, contohnya [trace] atau [undefined].
// Winston sendiri (format.errors) mengirimnya sebagai string biasa.
function normalizeStack(stack: unknown): string | undefined {
  if (Array.isArray(stack)) {
    const joined = stack
      .filter((s): s is string => typeof s === 'string')
      .join('\n');
    return joined || undefined;
  }
  return typeof stack === 'string' ? stack : undefined;
}

const lineFormat = winston.format.printf((info) => {
  // Semua field selain `level` bertipe `unknown`, jadi dipersempit (narrowing) dulu
  const timestamp = String(info.timestamp);
  const message = String(info.message);
  const context = typeof info.context === 'string' ? info.context : undefined;
  const trace = normalizeStack(info.stack);

  // context = nama class pemanggil, misalnya [TasksService]
  const ctx = context ? ` [${context}]` : '';
  const line = `[${timestamp}] ${info.level}${ctx}: ${message}`;
  return trace && !message.includes(trace) ? `${line}\n${trace}` : line;
});

// Context log internal Nest saat startup. Isinya hanya informasi wiring
// (module dimuat, route dipetakan), jadi cukup tampil di level debug.
const NEST_INTERNAL_CONTEXTS = new Set([
  'NestFactory',
  'InstanceLoader',
  'RoutesResolver',
  'RouterExplorer',
  'NestApplication',
]);

// Transport memfilter level berdasarkan symbol ini, bukan `info.level`.
// Sama dengan `LEVEL` dari package `triple-beam`.
const LEVEL = Symbol.for('level');

const demoteNestInternals = winston.format((info) => {
  if (
    info.level === 'info' &&
    typeof info.context === 'string' &&
    NEST_INTERNAL_CONTEXTS.has(info.context)
  ) {
    info.level = 'debug'; // yang ditampilkan di baris log
    info[LEVEL] = 'debug'; // yang dipakai transport untuk memfilter
  }
  return info;
});

export const winstonConfig: winston.LoggerOptions = {
  exitOnError: true,
  // Format di level logger berjalan SEBELUM transport memfilter level,
  // jadi penurunan level di sini ikut menentukan log masuk ke file atau tidak.
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    demoteNestInternals(),
  ),
  transports: [
    new winston.transports.Console({
      level: 'debug',
      handleExceptions: true,
      handleRejections: true,
      format: winston.format.combine(
        timestampFormat,
        winston.format.colorize(),
        lineFormat,
      ),
    }),
    new DailyRotateFile({
      dirname: path.join(process.cwd(), 'logs'),
      filename: '%DATE%.log',
      datePattern: 'MMMM/DD-MM-YYYY',
      level: 'info',
      maxFiles: '60d',
      handleExceptions: true,
      handleRejections: true,
      format: winston.format.combine(timestampFormat, lineFormat),
    }),
  ],
};
