import { Body, Controller, Get, Header, Headers, Inject, Param, Patch, Post } from '@nestjs/common';
import { readSessionToken } from '../identity/session-cookie';
import { CategoryAdminService } from './category-admin.service';

@Controller('admin/categories')
export class CategoryAdminController {
  constructor(@Inject(CategoryAdminService) private readonly categories:CategoryAdminService){}

  @Get() @Header('Cache-Control','private, no-store')
  list(@Headers('cookie') cookie:string|undefined){return this.categories.list(readSessionToken(cookie));}

  @Post() @Header('Cache-Control','private, no-store')
  create(@Headers('cookie') cookie:string|undefined,@Body() body:unknown){return this.categories.create(readSessionToken(cookie),body);}

  @Patch(':code') @Header('Cache-Control','private, no-store')
  update(@Headers('cookie') cookie:string|undefined,@Param('code') code:string,@Body() body:unknown){return this.categories.update(readSessionToken(cookie),code,body);}
}
