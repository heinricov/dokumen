import { BadRequestException, Injectable, PipeTransform } from '@nestjs/common';
import type { Type } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

@Injectable()
export class DtoValidationPipe implements PipeTransform {
  constructor(private readonly schema: Type<object>) {}

  async transform(value: unknown): Promise<object> {
    const instance = plainToInstance(this.schema, value);
    const errors = await validate(instance, {
      whitelist: true,
      forbidNonWhitelisted: true,
      stopAtFirstError: false,
    });

    if (errors.length > 0) {
      throw new BadRequestException(this.collectMessages(errors));
    }

    return instance;
  }

  private collectMessages(errors: ValidationError[], parent = ''): string[] {
    const messages: string[] = [];
    for (const error of errors) {
      const property = parent ? `${parent}.${error.property}` : error.property;
      if (error.constraints) {
        messages.push(...Object.values(error.constraints));
      }
      if (error.children?.length) {
        messages.push(...this.collectMessages(error.children, property));
      }
    }
    return messages;
  }
}

export function validateDto<T extends object>(
  schema: Type<T>,
): DtoValidationPipe {
  return new DtoValidationPipe(schema);
}
