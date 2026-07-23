import { BadRequestException } from '@nestjs/common';

export class AnalyticsValidationError extends BadRequestException {
  constructor() {
    super('Analytics event validation failed.');
  }
}
