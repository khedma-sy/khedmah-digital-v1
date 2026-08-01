import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest } from './dto/operations-product.dto';
import { OperationsProductService } from './operations-product.service';
@Controller('admin/operations-product')
export class OperationsProductController {
  constructor(@Inject(OperationsProductService) private readonly service: OperationsProductService) {}
  @Get('overview') async overview(@Headers('cookie') cookie: string | undefined) { return { operationsProduct: await this.service.overview(cookie) }; }
  @Get('inventory') async inventory(@Headers('cookie') cookie: string | undefined) { return { resources: await this.service.inventory(cookie) }; }
  @Get('history') async history(@Headers('cookie') cookie: string | undefined) { return this.service.histories(cookie); }
  @Post('changes') async requestChange(@Headers('cookie') cookie: string | undefined, @Body() body: CreateOperationsChangeRequest) { return { change: await this.service.requestChange(cookie, body) }; }
  @Post('incidents') async createIncident(@Headers('cookie') cookie: string | undefined, @Body() body: CreateIncidentRequest) { return { incident: await this.service.createIncident(cookie, body) }; }
  @Post('rollbacks') async rollback(@Headers('cookie') cookie: string | undefined, @Body() body: RollbackRequest) { return { change: await this.service.rollback(cookie, body) }; }
}
