export interface SubmitContactInquiryRequest {
  readonly name?: unknown;
  readonly contactEmail?: unknown;
  readonly message?: unknown;
}

export type ContactTarget =
  | { readonly type: 'business'; readonly id: string }
  | { readonly type: 'professional'; readonly id: string };

export interface TrackContactClickRequest {
  readonly source?: unknown;
}
