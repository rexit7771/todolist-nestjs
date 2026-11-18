import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { BadRequestException, Logger, ValidationPipe } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { winstonConfig } from './configs/logger/winston.config';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger(winstonConfig),
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const firstError = errors[0];
        const message = Object.values(firstError.constraints ?? {})[0];

        return new BadRequestException(message);
      },
    }),
  );

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  new Logger('Bootstrap').log(`Server listening on port ${port}`);
}
bootstrap().catch((err) => {
  new Logger('Bootstrap').error('Failed to start Server', err);
  process.exit(1);
});
