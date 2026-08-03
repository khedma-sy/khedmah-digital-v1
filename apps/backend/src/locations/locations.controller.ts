import { Controller, Get, Inject, Param } from '@nestjs/common';
import { validateLocationCode } from './location.validation';
import { LocationsService } from './locations.service';

@Controller('locations')
export class LocationsController {
  constructor(@Inject(LocationsService) private readonly locations: LocationsService) {}

  @Get('cities')
  async listCities() {
    return { cities: this.locations.listCities() };
  }

  @Get('countries')
  async listCountries() {
    return { countries: this.locations.listCountries() };
  }

  @Get('cities/:code')
  async getCity(@Param('code') code: string) {
    return { city: this.locations.getCity(validateLocationCode({ code }).code) };
  }
}
