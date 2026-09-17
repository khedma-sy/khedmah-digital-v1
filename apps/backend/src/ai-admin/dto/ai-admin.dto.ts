import { IsBoolean } from 'class-validator';

export class SetAiAdminEnabledRequest {
  @IsBoolean()
  readonly enabled!: boolean;
}
