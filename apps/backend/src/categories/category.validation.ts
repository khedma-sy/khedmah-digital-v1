import { BadRequestException } from '@nestjs/common';

export function validateCategoryCode(value: unknown): string {
  if (typeof value !== 'string') throw new BadRequestException('categoryCode must be a string.');
  const code = value.trim();
  if (!/^[a-z][a-z0-9_]{1,49}$/.test(code)) {
    throw new BadRequestException('categoryCode must be a canonical lowercase category code.');
  }
  return code;
}
