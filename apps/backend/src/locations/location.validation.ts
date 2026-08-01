import { BadRequestException } from '@nestjs/common';
import { LocationCodeRequest } from './dto/location.dto';

export function validateLocationCode(request: LocationCodeRequest) {
  if (typeof request.code !== 'string') {
    throw new BadRequestException('code must be a string.');
  }

  const code = request.code.trim();
  if (code.length < 2 || code.length > 50) {
    throw new BadRequestException('code must be between 2 and 50 characters.');
  }

  return { code };
}
