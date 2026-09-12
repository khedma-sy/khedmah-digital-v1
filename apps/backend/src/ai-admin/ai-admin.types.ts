export const AI_ADMIN_ANALYSIS_MODES = ['executive', 'expose', 'killcritic', 'autopsy'] as const;
export type AiAdminAnalysisMode = typeof AI_ADMIN_ANALYSIS_MODES[number];

export interface AiAdminControlState {
  readonly enabled: boolean;
  readonly operatingMode: 'supervised';
  readonly monthlyBudgetUsdCents: number;
  readonly updatedByUserId?: string;
  readonly updatedAt: string;
}
