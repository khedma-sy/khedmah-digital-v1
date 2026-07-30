import { IsIn, IsString, Length } from 'class-validator';
export class CreateOperationsChangeRequest {
  @IsIn(['google-cloud', 'firebase', 'ci-cd', 'production', 'monitoring', 'security']) readonly area!: 'google-cloud' | 'firebase' | 'ci-cd' | 'production' | 'monitoring' | 'security';
  @IsString() @Length(3, 120) readonly action!: string;
  @IsString() @Length(10, 500) readonly reason!: string;
}
export class CreateIncidentRequest {
  @IsString() @Length(3, 120) readonly title!: string;
  @IsIn(['low', 'medium', 'high', 'critical']) readonly severity!: 'low' | 'medium' | 'high' | 'critical';
  @IsString() @Length(10, 500) readonly summary!: string;
}
export class RollbackRequest { @IsString() @Length(3, 120) readonly deploymentId!: string; @IsString() @Length(10, 500) readonly reason!: string; }
