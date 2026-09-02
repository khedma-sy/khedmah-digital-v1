import { IsIn, IsOptional, IsString, Length } from 'class-validator';
export class CreateOperationsChangeRequest {
  @IsIn(['google-cloud', 'firebase', 'ci-cd', 'production', 'monitoring', 'security']) readonly area!: 'google-cloud' | 'firebase' | 'ci-cd' | 'production' | 'monitoring' | 'security';
  @IsString() @Length(3, 120) readonly action!: string;
  @IsString() @Length(10, 500) readonly reason!: string;
}
export class CreateIncidentRequest {
  @IsString() @Length(3, 120) readonly title!: string;
  @IsIn(['technical','user_support','content','payments','delivery','security','other']) readonly category!: 'technical'|'user_support'|'content'|'payments'|'delivery'|'security'|'other';
  @IsIn(['low', 'medium', 'high', 'critical']) readonly severity!: 'low' | 'medium' | 'high' | 'critical';
  @IsString() @Length(10, 2000) readonly summary!: string;
}
export class RollbackRequest { @IsString() @Length(3, 120) readonly deploymentId!: string; @IsString() @Length(10, 500) readonly reason!: string; }
export class ChangeUserStatusRequest {
  @IsIn(['active', 'suspended']) readonly status!: 'active' | 'suspended';
  @IsString() @Length(5, 500) readonly reason!: string;
}
export class TransitionIncidentRequest {
  @IsIn(['open','in_progress','verification','resolved']) readonly status!: 'open'|'in_progress'|'verification'|'resolved';
  @IsString() @Length(5, 2000) readonly note!: string;
  @IsOptional() @IsString() @Length(1, 200) readonly assigneeUserId?: string;
}
