import { BadRequestException } from '@nestjs/common';
import type { DiscountType } from './promotion.types';

const text=(v:unknown,min:number,max:number,name:string)=>{if(typeof v!=='string'||v.trim().length<min||v.trim().length>max)throw new BadRequestException(`${name} is invalid.`);return v.trim();};
const number=(v:unknown,min:number,max:number,name:string)=>{const n=Number(v);if(!Number.isFinite(n)||n<min||n>max)throw new BadRequestException(`${name} is invalid.`);return n;};
export function validatePromotion(v:Record<string,unknown>){
 const discountType=v.discountType as DiscountType;if(!['percentage','fixed_amount'].includes(discountType))throw new BadRequestException('Discount type is invalid.');
 const originalPrice=number(v.originalPrice,0.01,999999999999.99,'Original price'),discountValue=number(v.discountValue,0.01,999999999999.99,'Discount value');
 if(discountType==='percentage'&&discountValue>90)throw new BadRequestException('Percentage discount cannot exceed 90%.');
 if(discountType==='fixed_amount'&&discountValue>=originalPrice)throw new BadRequestException('Fixed discount must be below the original price.');
 const startsAt=new Date(String(v.startsAt)),endsAt=new Date(String(v.endsAt));if(!Number.isFinite(startsAt.getTime())||!Number.isFinite(endsAt.getTime())||endsAt<=startsAt)throw new BadRequestException('Promotion period is invalid.');
 if(endsAt.getTime()<=Date.now())throw new BadRequestException('Promotion must end in the future.');
 const currency=v.currency as 'SYP'|'USD';if(currency!=='SYP'&&currency!=='USD')throw new BadRequestException('Currency is invalid.');
 return{titleAr:text(v.titleAr,4,120,'Title'),descriptionAr:text(v.descriptionAr,10,1000,'Description'),discountType,originalPrice,discountValue,currency,startsAt:startsAt.toISOString(),endsAt:endsAt.toISOString(),totalLimit:number(v.totalLimit,1,100000,'Total limit'),perUserLimit:number(v.perUserLimit??1,1,5,'Per-user limit')};
}
export function finalPrice(type:DiscountType,original:number,value:number){return Math.max(0,type==='percentage'?original*(1-value/100):original-value);}
