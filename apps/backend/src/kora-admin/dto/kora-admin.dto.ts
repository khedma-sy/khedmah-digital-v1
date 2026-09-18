import { IsIn, IsISO8601, IsString, Length } from 'class-validator';

export class EvaluateUiObservationRequest {
  @IsIn(['taxi_embedded_map', 'taxi_map_navigation', 'store_navigation', 'food_route', 'brand_identity', 'dead_action', 'missing_page', 'wrong_route'])
  readonly checkId!: 'taxi_embedded_map' | 'taxi_map_navigation' | 'store_navigation' | 'food_route' | 'brand_identity' | 'dead_action' | 'missing_page' | 'wrong_route';

  @IsIn(['pass', 'fail']) readonly status!: 'pass' | 'fail';
  @IsString() @Length(3, 500) readonly evidence!: string;
}

export class DraftAdminTaskRequest {
  @IsIn(['operational_anomaly', 'ui_failure', 'telemetry_gap', 'incident'])
  readonly kind!: 'operational_anomaly' | 'ui_failure' | 'telemetry_gap' | 'incident';

  @IsString() @Length(2, 120) readonly resource!: string;
  @IsString() @Length(3, 120) readonly title!: string;
  @IsString() @Length(10, 500) readonly summary!: string;
  @IsIn(['low', 'medium', 'high', 'critical']) readonly severity!: 'low' | 'medium' | 'high' | 'critical';
  @IsString() @Length(3, 500) readonly evidence!: string;
}

export class KillCriticRequest {
  @IsString() @Length(3, 200) readonly action!: string;
  @IsIn(['preview', 'staging', 'production', 'platform']) readonly targetEnvironment!: 'preview' | 'staging' | 'production' | 'platform';
  @IsIn(['low', 'medium', 'high', 'critical']) readonly impact!: 'low' | 'medium' | 'high' | 'critical';
}

export class AutopsyRequest {
  @IsString() @Length(3, 120) readonly title!: string;
  @IsISO8601() readonly observedAt!: string;
  @IsString() @Length(10, 500) readonly summary!: string;
  @IsString() @Length(3, 1000) readonly evidence!: string;
}
