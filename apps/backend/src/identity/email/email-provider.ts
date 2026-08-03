/**
 * Email provider abstraction.
 * Implementations: ConsolEmailProvider (dev/test), ResendEmailProvider (production).
 */
export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

/**
 * Console provider — logs to stdout. Used in development and tests.
 */
export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    process.stdout.write(
      `[EMAIL] to=${message.to} subject="${message.subject}"\n${message.textBody}\n`
    );
  }
}

/**
 * Resend provider — uses the RESEND_API_KEY environment variable.
 * Falls back to ConsoleEmailProvider if the key is absent.
 */
export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error('RESEND_API_KEY is required for ResendEmailProvider.');
    }
    this.apiKey = key;
    this.from = process.env.EMAIL_FROM ?? 'noreply@khedmah.digital';
  }

  async send(message: EmailMessage): Promise<void> {
    const body = JSON.stringify({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.textBody
    });

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + this.apiKey,
        'Content-Type': 'application/json'
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend API error ${response.status}: ${text}`);
    }
  }
}

/**
 * Returns the correct provider based on environment configuration.
 */
export function createEmailProvider(): EmailProvider {
  if (process.env.RESEND_API_KEY) {
    return new ResendEmailProvider();
  }
  return new ConsoleEmailProvider();
}
