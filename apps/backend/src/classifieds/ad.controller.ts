import { Body, Controller, Get, Headers, Inject, Param, Patch, Post, Query } from '@nestjs/common';
import { assessAdForModeration } from './ad-moderation-assessment';
import { AdService } from './ad.service';

@Controller('classifieds')
export class AdController {
  constructor(@Inject(AdService) private readonly ads: AdService) {}

  @Get()
  async list(@Query('q') q?: string, @Query('categoryCode') categoryCode?: string, @Query('cityCode') cityCode?: string) {
    return { ads: await this.ads.listPublic({ q, categoryCode, cityCode }) };
  }

  @Get('mine')
  async mine(@Headers('cookie') cookie: string | undefined) { return { ads: await this.ads.listMine(cookie) }; }

  @Get('quota')
  async quota(@Headers('cookie') cookie: string | undefined) { return this.ads.quota(cookie); }

  @Post()
  async create(@Headers('cookie') cookie: string | undefined, @Body() body: unknown) { return { ad: await this.ads.create(cookie, body) }; }

  @Patch(':id')
  async update(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return { ad: await this.ads.update(cookie, id, body) };
  }

  @Post(':id/submit')
  async submit(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return { ad: await this.ads.submit(cookie, id, body) };
  }

  @Post(':id/deactivate')
  async deactivate(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return { ad: await this.ads.deactivate(cookie, id, body) };
  }

  @Post(':id/reactivate')
  async reactivate(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return { ad: await this.ads.reactivate(cookie, id, body) };
  }

  @Get('mine/:id')
  async mineById(@Headers('cookie') cookie: string | undefined, @Param('id') id: string) {
    return { ad: await this.ads.getMine(cookie, id) };
  }

  @Get(':id')
  async get(@Param('id') id: string) { return { ad: await this.ads.getPublic(id) }; }
}

@Controller('admin/classifieds')
export class AdminAdController {
  constructor(@Inject(AdService) private readonly ads: AdService) {}

  @Get('pending')
  async pending(@Headers('cookie') cookie: string | undefined) {
    const ads = await this.ads.listPending(cookie);
    const priorityRank = { elevated: 0, standard: 1 } as const;
    const assessedAds = ads.map((ad, fifoIndex) => ({
      ad: { ...ad, smartAdmin: assessAdForModeration(ad) },
      fifoIndex
    }));
    assessedAds.sort((left, right) => {
      const priorityDelta = priorityRank[left.ad.smartAdmin.priority] - priorityRank[right.ad.smartAdmin.priority];
      return priorityDelta !== 0 ? priorityDelta : left.fifoIndex - right.fifoIndex;
    });
    return { ads: assessedAds.map(({ ad }) => ad) };
  }

  @Patch(':id/moderation')
  async moderate(@Headers('cookie') cookie: string | undefined, @Param('id') id: string, @Body() body: unknown) {
    return { ad: await this.ads.moderate(cookie, id, body) };
  }
}
