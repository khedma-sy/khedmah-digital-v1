import { Controller, Get, Header, Headers, Inject } from '@nestjs/common';
import { readSessionToken } from '../identity/session-cookie';
import { TaxiAccessService } from './taxi-access.service';

@Controller('taxi')
export class TaxiAccessController {
  constructor(@Inject(TaxiAccessService) private readonly accessService: TaxiAccessService) {}

  @Get('rider/access')
  @Header('Cache-Control', 'private, no-store')
  rider(@Headers('cookie') cookie: string | undefined) {
    return this.accessService.access(readSessionToken(cookie), 'customer');
  }

  @Get('driver/access')
  @Header('Cache-Control', 'private, no-store')
  driver(@Headers('cookie') cookie: string | undefined) {
    return this.accessService.access(readSessionToken(cookie), 'driver');
  }
}
