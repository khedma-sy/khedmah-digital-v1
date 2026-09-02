import { Body,Controller,Get,Headers,Inject,Param,Patch,Post,Query } from '@nestjs/common';
import { PromotionService } from './promotion.service';
@Controller('promotions')
export class PromotionController{
 constructor(@Inject(PromotionService)private readonly service:PromotionService){}
 @Get()async list(@Query('businessId')businessId?:string,@Query('cityCode')cityCode?:string,@Query('q')q?:string){return{promotions:await this.service.list({businessId,cityCode,q})};}
 @Get('mine')async mine(@Headers('cookie')c?:string){return{promotions:await this.service.mine(c)};}
 @Get('claims/mine')async claims(@Headers('cookie')c?:string){return{claims:await this.service.myClaims(c)};}
 @Get('scan/:code')async scan(@Param('code')code:string){return this.service.resolve(code.toUpperCase());}
 @Post('business/:businessId/code')code(@Headers('cookie')c:string|undefined,@Param('businessId')b:string){return this.service.businessCode(c,b);}
 @Post('business/:businessId')create(@Headers('cookie')c:string|undefined,@Param('businessId')b:string,@Body()body:Record<string,unknown>){return this.service.create(c,b,body);}
 @Post(':id/claim')async claim(@Headers('cookie')c:string|undefined,@Param('id')id:string){return{claim:await this.service.claim(c,id)};}
 @Post('business/:businessId/redeem')async redeem(@Headers('cookie')c:string|undefined,@Param('businessId')b:string,@Body()body:{code?:string}){return{claim:await this.service.redeem(c,b,String(body.code??'').toUpperCase())};}
 @Post(':id/deactivate')deactivate(@Headers('cookie')c:string|undefined,@Param('id')id:string){return this.service.deactivate(c,id);}
}
@Controller('admin/promotions')
export class AdminPromotionController{
 constructor(@Inject(PromotionService)private readonly service:PromotionService){}
 @Get('pending')async pending(@Headers('cookie')c?:string){return{promotions:await this.service.pending(c)};}
 @Patch(':id/moderation')async review(@Headers('cookie')c:string|undefined,@Param('id')id:string,@Body()b:{status:'approved'|'rejected';reason?:string}){return{promotion:await this.service.review(c,id,b.status,b.reason)};}
}
