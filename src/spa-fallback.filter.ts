import {
  ExceptionFilter,
  Catch,
  NotFoundException,
  ArgumentsHost,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { join, resolve } from 'path';
import { existsSync } from 'fs';

/**
 * Для не-API запросов при 404 отдаём index.html (SPA fallback).
 */
@Catch(NotFoundException)
export class SpaFallbackFilter implements ExceptionFilter {
  private readonly clientPath: string | null;

  constructor(clientPath?: string) {
    if (clientPath) {
      this.clientPath = clientPath;
    } else {
      const p = join(__dirname, '..', 'web', 'dist', 'frontend-opgbot', 'browser');
      this.clientPath = existsSync(p) ? p : null;
    }
  }

  catch(exception: NotFoundException, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    if (!req.path.startsWith('/api') && this.clientPath) {
      const indexPath = resolve(this.clientPath, 'index.html');
      return res.status(200).sendFile(indexPath);
    }

    res.status(404).json({
      message: exception.message,
      error: 'Not Found',
      statusCode: 404,
    });
  }
}
