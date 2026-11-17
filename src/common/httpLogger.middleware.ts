import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';

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
