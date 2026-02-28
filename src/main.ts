import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';
import { join } from 'path';
import { existsSync } from 'fs';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SpaFallbackFilter } from './spa-fallback.filter';

/**
 * Точка входа в приложение
 * Инициализирует NestJS приложение и запускает бота
 */
async function bootstrap() {
  // Загружаем переменные окружения
  dotenv.config();

  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // REST API для Angular фронтенда
  app.setGlobalPrefix('api');

  // CORS для dev-сервера Angular (по умолчанию разрешаем всем, но можно сузить через CORS_ORIGIN)
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
  });

  // Раздача собранного фронта (web/dist) с бэкенда + SPA fallback для / и /dashboard
  const possiblePaths = [
    join(__dirname, '..', 'web', 'dist', 'frontend-opgbot', 'browser'),
    join(process.cwd(), 'web', 'dist', 'frontend-opgbot', 'browser'),
  ];
  const clientPath = possiblePaths.find((p) => existsSync(p)) ?? null;
  if (clientPath) {
    app.useStaticAssets(clientPath);
    app.useGlobalFilters(new SpaFallbackFilter(clientPath));
    console.log('Serving frontend from', clientPath);
  }

  await app.listen(3000);
  console.log('Discord bot is starting...');
}
bootstrap();
