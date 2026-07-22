import { Body, Controller, Delete, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import { AddOrganizationMemberRequest, CreateOrganizationRequest, UpdateOrganizationMemberRequest, UpdateOrganizationRequest } from './dto/organization.dto';
import { OrganizationService } from './organization.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizationService: OrganizationService) {}

  @Post()
  create(@Headers('cookie') cookieHeader: string | undefined, @Body() body: CreateOrganizationRequest) {
    return { organization: this.organizationService.create(cookieHeader, body) };
  }

  @Get('my')
  mine(@Headers('cookie') cookieHeader: string | undefined) {
    return { organizations: this.organizationService.listMine(cookieHeader) };
  }

  @Get(':id')
  details(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { organization: this.organizationService.getDetails(cookieHeader, id) };
  }

  @Patch(':id')
  update(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: UpdateOrganizationRequest) {
    return { organization: this.organizationService.update(cookieHeader, id, body) };
  }

  @Get(':id/members')
  members(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string) {
    return { members: this.organizationService.listMembers(cookieHeader, id) };
  }

  @Post(':id/members')
  addMember(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Body() body: AddOrganizationMemberRequest) {
    return { member: this.organizationService.addMember(cookieHeader, id, body) };
  }

  @Patch(':id/members/:memberId')
  updateMember(
    @Headers('cookie') cookieHeader: string | undefined,
    @Param('id') id: string,
    @Param('memberId') memberId: string,
    @Body() body: UpdateOrganizationMemberRequest
  ) {
    return { member: this.organizationService.updateMember(cookieHeader, id, memberId, body) };
  }

  @Delete(':id/members/:memberId')
  removeMember(@Headers('cookie') cookieHeader: string | undefined, @Param('id') id: string, @Param('memberId') memberId: string) {
    return this.organizationService.removeMember(cookieHeader, id, memberId);
  }
}
