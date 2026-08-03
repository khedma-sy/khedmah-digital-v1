import { Body, Controller, Get, Headers, Inject, Post } from '@nestjs/common';
import { BootstrapAdminRequest, BootstrapAdminResult, BootstrapAdminService } from './bootstrap-admin.service';

@Controller('admin/bootstrap')
export class BootstrapAdminController {
  constructor(@Inject(BootstrapAdminService) private readonly bootstrapAdmin: BootstrapAdminService) {}

  @Get('status')
  async status(): Promise<{ available: boolean }> {
    return { available: await this.bootstrapAdmin.isBootstrapAvailable() };
  }

  @Post()
  async bootstrap(
    @Headers('x-bootstrap-secret') secret: string | undefined,
    @Body() body: BootstrapAdminRequest
  ): Promise<BootstrapAdminResult> {
    return this.bootstrapAdmin.bootstrap(secret, body);
  }
}
