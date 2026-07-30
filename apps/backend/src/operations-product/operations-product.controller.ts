import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest } from './dto/operations-product.dto';
import { OperationsProductService } from './operations-product.service';
@Controller('admin/operations-product')
export class OperationsProductController {
  constructor(@Inject(OperationsProductService) private readonly service: OperationsProductService) {}
  @Get('overview') overview(@Headers('cookie') cookie: string | undefined) { return { operationsProduct: this.service.overview(cookie) }; }
  @Get('inventory') inventory(@Headers('cookie') cookie: string | undefined) { return { resources: this.service.inventory(cookie) }; }
  @Get('history') history(@Headers('cookie') cookie: string | undefined) { return this.service.histories(cookie); }
  @Post('changes') requestChange(@Headers('cookie') cookie: string | undefined, @Body() body: CreateOperationsChangeRequest) { return { change: this.service.requestChange(cookie, body) }; }
  @Post('incidents') createIncident(@Headers('cookie') cookie: string | undefined, @Body() body: CreateIncidentRequest) { return { incident: this.service.createIncident(cookie, body) }; }
  @Post('rollbacks') rollback(@Headers('cookie') cookie: string | undefined, @Body() body: RollbackRequest) { return { change: this.service.rollback(cookie, body) }; }
}
