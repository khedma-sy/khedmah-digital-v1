import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from '@nestjs/common';
import { ReviewProviderReportRequest, SubmitProviderReportRequest } from './dto/report.dto';
import { ReportService } from './report.service';

@Controller('businesses/:businessProfileId/reports')
export class BusinessReportController {
  constructor(@Inject(ReportService) private readonly reports: ReportService) {}
  @Post() submit(@Headers('cookie') cookie: string | undefined, @Param('businessProfileId') id: string, @Body() body: SubmitProviderReportRequest) {
    return this.reports.submit(cookie, { type: 'business', id }, body).then((report) => ({ report }));
  }
}

@Controller('professionals/:professionalProfileId/reports')
export class ProfessionalReportController {
  constructor(@Inject(ReportService) private readonly reports: ReportService) {}
  @Post() submit(@Headers('cookie') cookie: string | undefined, @Param('professionalProfileId') id: string, @Body() body: SubmitProviderReportRequest) {
    return this.reports.submit(cookie, { type: 'professional', id }, body).then((report) => ({ report }));
  }
}

@Controller('admin/reports')
export class AdminReportController {
  constructor(@Inject(ReportService) private readonly reports: ReportService) {}
  @Get() async list(@Headers('cookie') cookie: string | undefined) { return { reports: await this.reports.listForModeration(cookie) }; }
  @Patch(':reportId') async review(@Headers('cookie') cookie: string | undefined, @Param('reportId') id: string, @Body() body: ReviewProviderReportRequest) {
    return { report: await this.reports.review(cookie, id, body) };
  }
}
