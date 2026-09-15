import { Body, Controller, Get, Header, Headers, Inject, Param, Post } from '@nestjs/common';
import { readSessionToken } from '../identity/session-cookie';
import { BillingService } from './billing.service';

@Controller('billing')
export class BillingController{
  constructor(@Inject(BillingService) private readonly billing:BillingService){}
  @Get('plans') plans(){return this.billing.plans();}
  @Get('me') @Header('Cache-Control','private, no-store') me(@Headers('cookie') cookie:string|undefined){return this.billing.me(readSessionToken(cookie));}
  @Get('promo/active') @Header('Cache-Control','private, no-store') promo(@Headers('cookie') cookie:string|undefined){return this.billing.activePromo(readSessionToken(cookie));}
  @Post('quote') @Header('Cache-Control','private, no-store') quote(@Headers('cookie') cookie:string|undefined,@Body() body:unknown){return this.billing.quote(readSessionToken(cookie),body);}
  @Post('orders') @Header('Cache-Control','private, no-store') order(@Headers('cookie') cookie:string|undefined,@Body() body:unknown){return this.billing.createOrder(readSessionToken(cookie),body);}
  @Post('orders/:id/cancel') @Header('Cache-Control','private, no-store') cancel(@Headers('cookie') cookie:string|undefined,@Param('id') id:string){return this.billing.cancelOrder(readSessionToken(cookie),id);}
}

@Controller('admin/billing')
export class BillingAdminController{
  constructor(@Inject(BillingService) private readonly billing:BillingService){}
  @Get('orders/pending') @Header('Cache-Control','private, no-store') pending(@Headers('cookie') cookie:string|undefined){return this.billing.pendingOrders(readSessionToken(cookie));}
  @Post('orders/:id/mark-paid') @Header('Cache-Control','private, no-store') markPaid(@Headers('cookie') cookie:string|undefined,@Param('id') id:string,@Body() body:unknown){return this.billing.markPaid(readSessionToken(cookie),id,body);}
}
