/**
 * The global validation pipe is configured directly in `AppModule` under the
 * `APP_PIPE` token from `@nestjs/core`. This module is kept only as a
 * re-export so existing imports keep resolving.
 */
export { ValidationPipe } from '@nestjs/common';
