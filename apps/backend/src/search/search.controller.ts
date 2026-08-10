import { Controller, Get, Inject, Query } from '@nestjs/common';
import { PublicSearchRequest } from './dto/search.dto';
import { SearchService } from './search.service';

@Controller('search')
export class SearchController {
  constructor(@Inject(SearchService) private readonly searchService: SearchService) {}

  @Get()
  async search(
    @Query('q') q?: string,
    @Query('categoryCode') categoryCode?: string,
    @Query('cityCode') cityCode?: string,
    @Query('page') page?: string,
    @Query('type') type?: string,
    @Query('map') map?: string,
    @Query('boundaries') boundaries?: string,
    @Query('latitude') latitude?: string,
    @Query('longitude') longitude?: string,
    @Query('south') south?: string,
    @Query('west') west?: string,
    @Query('north') north?: string,
    @Query('east') east?: string
  ) {
    const query: PublicSearchRequest = { q, categoryCode, cityCode, page, type, map, boundaries, latitude, longitude, south, west, north, east };
    return await this.searchService.search(query);
  }
}
