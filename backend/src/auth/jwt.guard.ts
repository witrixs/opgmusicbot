import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * Guard для защиты endpoints через JWT.
 * Используется как `@UseGuards(JwtAuthGuard)`.
 */
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}

