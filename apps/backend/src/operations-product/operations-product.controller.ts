import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ChangeUserStatusRequest, CreateIncidentRequest, CreateOperationsChangeRequest, RollbackRequest, TransitionIncidentRequest } from './dto/operations-product.dto';
import { OperationsProductService } from './operations-product.service';
@Controller('admin/operations-product')
export class OperationsProductController {
  constructor(@Inject(OperationsProductService) private readonly service: OperationsProductService) {}
  @Get('overview') async overview(@Headers('cookie') cookie: string | undefined) { return { operationsProduct: await this.service.overview(cookie) }; }
  @Get('smart-admin-report') async smartAdminReport(@Headers('cookie') cookie: string | undefined) { return { smartAdminReport: await this.service.smartAdminReport(cookie) }; }
  @Get('users') async users(@Headers('cookie') cookie:string|undefined,@Query('q')query?:string){return{users:await this.service.listUsers(cookie,query??'')}}
  @Patch('users/:id/status') async changeUserStatus(@Headers('cookie')cookie:string|undefined,@Param('id')id:string,@Body()body:ChangeUserStatusRequest){return this.service.changeUserStatus(cookie,id,body.status,body.reason)}
  @Get('inventory') async inventory(@Headers('cookie') cookie: string | undefined) { return { resources: await this.service.inventory(cookie) }; }
  @Get('history') async history(@Headers('cookie') cookie: string | undefined) { return this.service.histories(cookie); }
  @Post('changes') async requestChange(@Headers('cookie') cookie: string | undefined, @Body() body: CreateOperationsChangeRequest) { return { change: await this.service.requestChange(cookie, body) }; }
  @Post('incidents') async createIncident(@Headers('cookie') cookie: string | undefined, @Body() body: CreateIncidentRequest) { return { incident: await this.service.createIncident(cookie, body) }; }
  @Patch('incidents/:id') async transitionIncident(@Headers('cookie')cookie:string|undefined,@Param('id')id:string,@Body()body:TransitionIncidentRequest){return{incident:await this.service.transitionIncident(cookie,id,body)}}
  @Post('rollbacks') async rollback(@Headers('cookie') cookie: string | undefined, @Body() body: RollbackRequest) { return { change: await this.service.rollback(cookie, body) }; }
}
