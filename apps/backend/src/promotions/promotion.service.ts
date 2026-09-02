import { BadRequestException,ForbiddenException,Inject,Injectable,NotFoundException } from '@nestjs/common';
import { randomBytes,randomUUID } from 'node:crypto';
import { BusinessProfileRepository } from '../business-profiles/business-profile.repository';
import { IdentityService } from '../identity/identity.service';
import { readSessionToken } from '../identity/session-cookie';
import { OperationsRbacService } from '../operations-product/operations-rbac.service';
import { evaluatePromotionAutoModeration } from './promotion-auto-moderation';
import { PromotionRepository } from './promotion.repository';
import type { Promotion } from './promotion.types';
import { finalPrice,validatePromotion } from './promotion.validation';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const redemption=()=>Array.from(randomBytes(10),b=>alphabet[b%alphabet.length]).join('');
@Injectable()
export class PromotionService{
 constructor(@Inject(PromotionRepository)private readonly repo:PromotionRepository,@Inject(BusinessProfileRepository)private readonly businesses:BusinessProfileRepository,@Inject(IdentityService)private readonly identity:IdentityService,@Inject(OperationsRbacService)private readonly rbac:OperationsRbacService){}
 private async actor(cookie?:string){return this.identity.getCurrentUser(readSessionToken(cookie));}
 async businessCode(cookie:string|undefined,businessId:string){const a=await this.actor(cookie),b=await this.businesses.findById(businessId);if(!b)throw new NotFoundException('Business was not found.');if(b.ownerUserId!==a.id)throw new ForbiddenException('Access denied.');const code=await this.repo.codeForBusiness(businessId,`KHD-${randomBytes(6).toString('hex').toUpperCase()}`);return{code,businessProfileId:businessId};}
 async resolve(code:string){if(!/^KHD-[A-F0-9]{12}$/.test(code))throw new NotFoundException('Khedmah code was not found.');const business=await this.repo.resolveCode(code);if(!business)throw new NotFoundException('Khedmah code was not found.');return{...business,promotions:await this.repo.listPublic({businessId:business.businessProfileId})};}
 async create(cookie:string|undefined,businessId:string,body:Record<string,unknown>){const a=await this.actor(cookie),b=await this.businesses.findById(businessId);if(!b)throw new NotFoundException('Business was not found.');if(b.ownerUserId!==a.id)throw new ForbiddenException('Access denied.');const v=validatePromotion(body),now=new Date().toISOString();const base:Promotion={id:randomUUID(),businessProfileId:businessId,businessName:b.name,ownerUserId:a.id,...v,finalPrice:finalPrice(v.discountType,v.originalPrice,v.discountValue),redeemedCount:0,status:'active',moderationStatus:'pending',createdAt:now,updatedAt:now};const decision=evaluatePromotionAutoModeration(base,b),p={...base,moderationStatus:decision.approved?'approved' as const:'pending' as const,moderationPolicyVersion:decision.policyVersion};await this.repo.insert(p,decision.approved);return{promotion:p,moderation:{autoApproved:decision.approved,reasons:decision.reasons}};}
 async mine(cookie?:string){const a=await this.actor(cookie);return this.repo.listMine(a.id);}
 list(filters:{businessId?:string;cityCode?:string;q?:string}){return this.repo.listPublic(filters);}
 async deactivate(cookie:string|undefined,id:string){const a=await this.actor(cookie),p=await this.repo.find(id);if(!p)throw new NotFoundException('Promotion was not found.');if(p.ownerUserId!==a.id)throw new ForbiddenException('Access denied.');await this.repo.deactivate(id,a.id);return{deactivated:true};}
 async claim(cookie:string|undefined,id:string){const a=await this.actor(cookie),p=await this.repo.find(id);if(!p)throw new NotFoundException('Promotion was not found.');const c=await this.repo.issueClaim(id,a.id,randomUUID(),redemption());if(!c)throw new BadRequestException('Promotion is unavailable or your usage limit was reached.');return c;}
 async myClaims(cookie?:string){const a=await this.actor(cookie);return this.repo.listClaims(a.id);}
 async redeem(cookie:string|undefined,businessId:string,code:string){const a=await this.actor(cookie),b=await this.businesses.findById(businessId);if(!b||b.ownerUserId!==a.id)throw new ForbiddenException('Access denied.');if(!/^[A-Z2-9]{10}$/.test(code))throw new BadRequestException('Redemption code is invalid.');const receipt=await this.repo.redeem(a.id,businessId,code);if(!receipt)throw new BadRequestException('Code is invalid, expired, or already redeemed.');return receipt;}
 async pending(cookie?:string){await this.admin(cookie);return this.repo.pending();}
 async review(cookie:string|undefined,id:string,status:'approved'|'rejected',reason?:string){const a=await this.admin(cookie);if(!['approved','rejected'].includes(status))throw new BadRequestException('Status is invalid.');if(status==='rejected'&&(!reason||reason.trim().length<5))throw new BadRequestException('Rejection reason is required.');const p=await this.repo.review(id,status,reason?.trim(),a.id);if(!p)throw new BadRequestException('Promotion is not pending.');return p;}
 private async admin(cookie?:string){const a=await this.actor(cookie);this.rbac.assert(a.email,'security.manage');return a;}
}
