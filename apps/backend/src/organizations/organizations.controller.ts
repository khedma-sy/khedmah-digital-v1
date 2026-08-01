import { Body, Controller, Delete, Get, Headers, Inject, Param, Patch, Post } from '@nestjs/common';
import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(@Inject(OrganizationService) private readonly organizationService: OrganizationService) {}

  @Post()
  async create(@Headers('cookie') cookieHeader: string | undefined, @Body() body: CreateOrganizationRequest) {
    return { organization: await this.organizationService.create(cookieHeader, body) };
  }

  @Get('my')
  async mine(@Headers('cookie') cookieHeader: string | undefined) {
    return { organizations: await this.organizationService.listMine(cookieHeader) };
  }

  @Get(':id')
  async details(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { organization: await this.organizationService.getDetails(cookieHeader, id) };
  }

  @Patch(':id')
  async update(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: UpdateOrganizationRequest) {
    return { organization: await this.organizationService.update(cookieHeader, id, body) };
  }

  @Get(':id/members')
  async members(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { members: await this.organizationService.listMembers(cookieHeader, id) };
  }

  @Post(':id/members')
  async addMember(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: AddOrganizationMemberRequest) {
    return { member: await this.organizationService.addMember(cookieHeader, id, body) };
  }

  @Patch(':id/members/:memberId')
  async updateMember(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateOrganizationMemberRequest
  ) {
    return { member: await this.organizationService.updateMember(cookieHeader, id, memberId, body) };
  }

  @Delete(':id/members/:memberId')
  async removeMember(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.organizationService.removeMember(cookieHeader, id, memberId);
  }
}
