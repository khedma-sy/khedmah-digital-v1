import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';

export class ReportValidationError extends BadRequestException {
  constructor() { super('Invalid report submission.'); }
}
export class ReportTargetUnavailableError extends NotFoundException {
  constructor() { super('Report target is not publicly available.'); }
}
export class ReportAlreadyOpenError extends ConflictException {
  constructor() { super('An open report already exists for this target.'); }
}
