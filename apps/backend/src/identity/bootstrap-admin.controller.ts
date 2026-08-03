import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { BootstrapAdminService } from './bootstrap-admin.service';

@Controller('admin/bootstrap')
export class BootstrapAdminController {
  constructor(@Inject(BootstrapAdminService) private readonly bootstrapAdmin: BootstrapAdminService) {}

  /**
   * POST /admin/bootstrap
   *
   * One-time endpoint to initialise the first platform administrator.
   * Requires the BOOTSTRAP_ADMIN_TOKEN environment variable to match
   * the token provided in the request body. Automatically becomes a
   * no-op after the first successful execution.
   */
  @Post()
  @HttpCode(HttpStatus.OK)
  async bootstrap(@Body() body: { token?: string }): Promise<{ status: string; adminId?: string }> {
    const result = await this.bootstrapAdmin.execute(body.token ?? '');
    return { status: result.status, adminId: result.adminId };
  }
}
