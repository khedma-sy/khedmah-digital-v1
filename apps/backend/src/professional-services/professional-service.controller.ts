import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { ProfessionalServiceService } from './professional-service.service';
@Controller('professional-services')
export class ProfessionalServiceController{
 constructor(@Inject(ProfessionalServiceService)private readonly service:ProfessionalServiceService){}
 @Post('requests')create(@Headers('cookie')c:string|undefined,@Body()b:Record<string,unknown>){return this.service.create(c,b).then(request=>({request}));}
 @Get('requests/mine')mine(@Headers('cookie')c:string|undefined){return this.service.mine(c).then(requests=>({requests}));}
 @Get('opportunities')opportunities(@Headers('cookie')c:string|undefined,@Query('businessId')b:string){return this.service.opportunities(c,b).then(requests=>({requests}));}
 @Get('jobs')jobs(@Headers('cookie')c:string|undefined,@Query('businessId')b:string){return this.service.jobs(c,b).then(requests=>({requests}));}
 @Post('requests/:id/offers')offer(@Headers('cookie')c:string|undefined,@Param('id')id:string,@Query('businessId')b:string,@Body()v:Record<string,unknown>){return this.service.offer(c,id,b,v).then(offer=>({offer}));}
 @Post('requests/:id/offers/:offerId/accept')accept(@Headers('cookie')c:string|undefined,@Param('id')id:string,@Param('offerId')o:string){return this.service.accept(c,id,o).then(offer=>({offer}));}
 @Patch('requests/:id/status')action(@Headers('cookie')c:string|undefined,@Param('id')id:string,@Body()v:Record<string,unknown>){return this.service.action(c,id,v).then(request=>({request}));}
 @Post('requests/:id/warranty/revisit')revisit(@Headers('cookie')c:string|undefined,@Param('id')id:string,@Body()v:Record<string,unknown>){return this.service.revisit(c,id,v.reason);}
 @Post('requests/:id/rating')rate(@Headers('cookie')c:string|undefined,@Param('id')id:string,@Body()v:Record<string,unknown>){return this.service.rate(c,id,v);}
}
