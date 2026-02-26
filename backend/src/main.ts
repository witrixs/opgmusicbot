import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import * as dotenv from 'dotenv';

/**
 * Точка входа в приложение
 * Инициализирует NestJS приложение и запускает бота
 */
async function bootstrap() {
  // Загружаем переменные окружения
  dotenv.config();
  
  const app = await NestFactory.create(AppModule);

  // REST API для Angular фронтенда
  app.setGlobalPrefix('api');

  // CORS для dev-сервера Angular (по умолчанию разрешаем всем, но можно сузить через CORS_ORIGIN)
  const corsOrigin = process.env.CORS_ORIGIN;
  app.enableCors({
    origin: corsOrigin ? corsOrigin.split(',').map((s) => s.trim()) : true,
  });

  await app.listen(3000);
  console.log('Discord bot is starting...');
}
bootstrap();
