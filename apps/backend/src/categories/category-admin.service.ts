import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { IdentityRepository } from '../identity/identity.repository';
import { IdentityService } from '../identity/identity.service';
import { CategoryRepository } from './category.repository';
import type { Category, CategoryStatus } from './category.types';
import { validateCategoryCode } from './category.validation';

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new BadRequestException('Category payload is invalid.');
  return value as Record<string, unknown>;
}
function requiredText(value: unknown, field: string, max = 80): string {
  if (typeof value !== 'string') throw new BadRequestException(`${field} is invalid.`);
  const normalized=value.trim(); if(!normalized || normalized.length>max) throw new BadRequestException(`${field} is invalid.`); return normalized;
}
function optionalText(value: unknown, field: string, max = 80): string | undefined {
  if (value===undefined || value===null || value==='') return undefined;
  return requiredText(value,field,max);
}
function boolean(value: unknown, field:string, fallback:boolean): boolean {
  if(value===undefined) return fallback; if(typeof value!=='boolean') throw new BadRequestException(`${field} is invalid.`); return value;
}
function integer(value: unknown, field:string, fallback:number): number {
  if(value===undefined) return fallback; if(!Number.isSafeInteger(value)||Number(value)<0||Number(value)>100000) throw new BadRequestException(`${field} is invalid.`); return Number(value);
}
function status(value:unknown,fallback:CategoryStatus):CategoryStatus{
  if(value===undefined)return fallback;if(value!=='active'&&value!=='inactive')throw new BadRequestException('status is invalid.');return value;
}
function visual(value:unknown,fallback='briefcase'){
  const key=requiredText(value??fallback,'visualKey',50);if(!/^[a-z0-9_-]+$/.test(key))throw new BadRequestException('visualKey is invalid.');return key;
}

@Injectable()
export class CategoryAdminService {
  constructor(
    @Inject(CategoryRepository) private readonly repository:CategoryRepository,
    @Inject(IdentityService) private readonly identity:IdentityService,
    @Inject(IdentityRepository) private readonly identities:IdentityRepository
  ){}

  private async requireAdmin(sessionToken:string|undefined){
    const user=await this.identity.getCurrentUser(sessionToken);const roles=await this.identities.findAdminRoles(user.id);
    if(!roles.some(role=>role==='bootstrap_admin'||role==='category_admin')) throw new ForbiddenException('Category administration access denied.');
    return user.id;
  }

  async list(sessionToken:string|undefined){await this.requireAdmin(sessionToken);return {categories:await this.repository.listAll()};}

  async create(sessionToken:string|undefined,value:unknown){
    await this.requireAdmin(sessionToken);const body=object(value);const code=validateCategoryCode(body.code);
    if(await this.repository.findByCode(code)) throw new ConflictException('Category code already exists.');
    const parentCode=body.parentCode===undefined||body.parentCode===null||body.parentCode===''?undefined:validateCategoryCode(body.parentCode);
    if(parentCode===code) throw new BadRequestException('Category cannot be its own parent.');
    if(parentCode&&!await this.repository.findByCode(parentCode)) throw new BadRequestException('Parent category was not found.');
    const category:Category={code,nameAr:requiredText(body.nameAr,'nameAr'),nameEn:optionalText(body.nameEn,'nameEn'),parentCode,visualKey:visual(body.visualKey),isFeatured:boolean(body.isFeatured,'isFeatured',false),status:status(body.status,'active'),sortOrder:integer(body.sortOrder,'sortOrder',100)};
    return {category:await this.repository.create(category)};
  }

  async update(sessionToken:string|undefined,codeValue:unknown,value:unknown){
    await this.requireAdmin(sessionToken);const code=validateCategoryCode(codeValue);const current=await this.repository.findByCode(code);if(!current)throw new NotFoundException('Category was not found.');
    const body=object(value);let parentCode=current.parentCode;
    if(Object.prototype.hasOwnProperty.call(body,'parentCode')) parentCode=body.parentCode===null||body.parentCode===''?undefined:validateCategoryCode(body.parentCode);
    if(parentCode===code) throw new BadRequestException('Category cannot be its own parent.');
    if(parentCode){
      if(!await this.repository.findByCode(parentCode)) throw new BadRequestException('Parent category was not found.');
      const visited=new Set([code]);let cursor: string|undefined=parentCode;
      while(cursor){if(visited.has(cursor))throw new BadRequestException('Category hierarchy cannot contain cycles.');visited.add(cursor);cursor=(await this.repository.findByCode(cursor))?.parentCode;}
    }
    const nextStatus=status(body.status,current.status);
    if(current.status==='active'&&nextStatus==='inactive'&&await this.repository.activeChildCount(code)>0) throw new ConflictException('Deactivate active child categories first.');
    const next:Category={
      code,
      nameAr:body.nameAr===undefined?current.nameAr:requiredText(body.nameAr,'nameAr'),
      nameEn:body.nameEn===undefined?current.nameEn:optionalText(body.nameEn,'nameEn'),
      parentCode,
      visualKey:body.visualKey===undefined?current.visualKey:visual(body.visualKey),
      isFeatured:boolean(body.isFeatured,'isFeatured',current.isFeatured),
      status:nextStatus,
      sortOrder:integer(body.sortOrder,'sortOrder',current.sortOrder)
    };
    const saved=await this.repository.save(next);if(!saved)throw new NotFoundException('Category was not found.');return {category:saved};
  }
}
