export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
  readonly htmlBody?: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class EmailDeliveryError extends Error {
  constructor(readonly code: 'EMAIL_NOT_CONFIGURED' | 'EMAIL_REJECTED' | 'EMAIL_UNAVAILABLE' | 'EMAIL_INVALID_RESPONSE') {
    super('Email delivery could not be confirmed. Please try again later.');
    this.name = 'EmailDeliveryError';
  }
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(_message: EmailMessage): Promise<void> {
    // Local development only. Never print addresses, reset links or verification tokens.
    process.stdout.write('[EMAIL] Local development transport; no external delivery.\n');
  }
}

export class UnavailableEmailProvider implements EmailProvider {
  async send(_message: EmailMessage): Promise<void> {
    throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED');
  }
}

export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key || /\s/.test(key)) throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED');
    this.apiKey = key;
    this.from = process.env.EMAIL_FROM?.trim() || 'noreply@mail.khedmah.uk';
    if (/[\r\n]/.test(this.from)) throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED');
  }

  async send(message: EmailMessage): Promise<void> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'error',
        signal: controller.signal,
        headers: { Authorization: 'Bearer ' + this.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.textBody, html: message.htmlBody })
      });
      if (!response.ok) {
        // Provider error bodies can contain request data. Do not retain or expose them.
        await response.body?.cancel();
        throw new EmailDeliveryError('EMAIL_REJECTED');
      }
      const receipt: unknown = await response.json();
      if (!receipt || typeof receipt !== 'object' || !('id' in receipt)
        || typeof receipt.id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(receipt.id)) {
        throw new EmailDeliveryError('EMAIL_INVALID_RESPONSE');
      }
      // A provider receipt proves acceptance only, not delivery to the recipient's inbox.
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError('EMAIL_UNAVAILABLE');
    } finally {
      clearTimeout(timeout);
    }
  }
}

export function createEmailProvider(): EmailProvider {
  const environment = process.env.NODE_ENV?.trim().toLowerCase() || 'development';
  if (process.env.RESEND_API_KEY?.trim()) return new ResendEmailProvider();
  if (environment === 'production' || environment === 'staging') {
    throw new EmailDeliveryError('EMAIL_NOT_CONFIGURED');
  }
  // Preview discovery can boot without mail, but verification/recovery cannot fake a send.
  if (environment !== 'development' && environment !== 'test') return new UnavailableEmailProvider();
  return new ConsoleEmailProvider();
}
