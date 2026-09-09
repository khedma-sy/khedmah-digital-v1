import { Body, Controller, Get, Header, Headers, Inject, Param, Post } from '@nestjs/common';
import { readSessionToken } from '../identity/session-cookie';
import { TaxiTripService } from './taxi-trip.service';

@Controller('taxi')
export class TaxiTripController {
  constructor(@Inject(TaxiTripService) private readonly trips:TaxiTripService) {}
  @Post('rider/quotes') @Header('Cache-Control','private, no-store')
  quote(@Headers('cookie') cookie:string|undefined,@Body() body:unknown){return this.trips.quote(readSessionToken(cookie),body);}
  @Post('rider/trips') @Header('Cache-Control','private, no-store')
  place(@Headers('cookie') cookie:string|undefined,@Body() body:unknown){return this.trips.place(readSessionToken(cookie),body);}
  @Get('rider/trips/active') @Header('Cache-Control','private, no-store')
  riderActive(@Headers('cookie') cookie:string|undefined){return this.trips.active(readSessionToken(cookie),'customer');}
  @Get('rider/trips/:id') @Header('Cache-Control','private, no-store')
  riderRead(@Headers('cookie') cookie:string|undefined,@Param('id') id:string){return this.trips.read(readSessionToken(cookie),'customer',id);}
  @Post('rider/trips/:id/actions') @Header('Cache-Control','private, no-store')
  riderCommand(@Headers('cookie') cookie:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.trips.command(readSessionToken(cookie),'customer',id,body);}
  @Post('rider/trips/:id/consent') @Header('Cache-Control','private, no-store')
  consent(@Headers('cookie') cookie:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.trips.consent(readSessionToken(cookie),id,body);}
  @Get('driver/offers') @Header('Cache-Control','private, no-store')
  offers(@Headers('cookie') cookie:string|undefined){return this.trips.offers(readSessionToken(cookie));}
  @Get('driver/trips/active') @Header('Cache-Control','private, no-store')
  driverActive(@Headers('cookie') cookie:string|undefined){return this.trips.active(readSessionToken(cookie),'driver');}
  @Get('driver/trips/:id') @Header('Cache-Control','private, no-store')
  driverRead(@Headers('cookie') cookie:string|undefined,@Param('id') id:string){return this.trips.read(readSessionToken(cookie),'driver',id);}
  @Post('driver/trips/:id/actions') @Header('Cache-Control','private, no-store')
  driverCommand(@Headers('cookie') cookie:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.trips.command(readSessionToken(cookie),'driver',id,body);}
  @Get('driver/trips/:id/authorization') @Header('Cache-Control','private, no-store')
  authorization(@Headers('cookie') cookie:string|undefined,@Param('id') id:string){return this.trips.authorization(readSessionToken(cookie),id);}
}
