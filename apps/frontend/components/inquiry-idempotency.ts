export class InquirySubmissionGuard {
  private key: string | undefined;
  private inFlight = false;
  private completed = false;

  constructor(private readonly generateKey: () => string = () => crypto.randomUUID()) {}

  begin(): string | undefined {
    if (this.inFlight || this.completed) return undefined;
    this.inFlight = true;
    this.key ??= this.generateKey();
    return this.key;
  }

  finish(succeeded: boolean): void {
    this.inFlight = false;
    if (succeeded) this.completed = true;
  }

  newJourney(): void {
    this.key = undefined;
    this.inFlight = false;
    this.completed = false;
  }
}
