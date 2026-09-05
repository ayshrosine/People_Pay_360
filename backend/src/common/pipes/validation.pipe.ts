import { ValidationPipe, BadRequestException } from '@nestjs/common';
import { ValidationError } from 'class-validator';

export class CustomValidationPipe {
  constructor() {
    return new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (errors: ValidationError[]) => {
        const messages = errors.map(
          error => `${Object.values(error.constraints || {}).join(', ')}`,
        );
        return new BadRequestException({
          message: 'Validation failed',
          errors: messages,
        });
      },
    });
  }
}
