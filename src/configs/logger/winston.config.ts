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

export const winstonConfig: winston.LoggerOptions = {
  exitOnError: true,
  format: winston.format.errors({ stack: true }),
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
