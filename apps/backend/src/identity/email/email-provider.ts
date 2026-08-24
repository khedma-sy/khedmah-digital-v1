export interface EmailMessage {
  readonly to: string;
  readonly subject: string;
  readonly textBody: string;
}

export interface EmailProvider {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleEmailProvider implements EmailProvider {
  async send(message: EmailMessage): Promise<void> {
    process.stdout.write(
      `[EMAIL] to=${message.to} subject="${message.subject}"\n${message.textBody}\n`
    );
  }
}

export class ResendEmailProvider implements EmailProvider {
  private readonly apiKey: string;
  private readonly from: string;

  constructor() {
    const key = process.env.RESEND_API_KEY;
    if (!key) {
      throw new Error("RESEND_API_KEY is required for ResendEmailProvider.");
    }
    this.apiKey = key;
    this.from = process.env.EMAIL_FROM || "noreply@mail.khedmah.uk";
  }

  async send(message: EmailMessage): Promise<void> {
    const body = JSON.stringify({
      from: this.from,
      to: [message.to],
      subject: message.subject,
      text: message.textBody
    });

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: "Bearer " + this.apiKey,
        "Content-Type": "application/json"
      },
      body
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Resend API error ${response.status}: ${text}`);
    }
  }
}

export function createEmailProvider(): EmailProvider {
  const isProduction = process.env.NODE_ENV === "production";
  const hasResendKey = Boolean(process.env.RESEND_API_KEY);

  if (hasResendKey) {
    return new ResendEmailProvider();
  }

  if (isProduction) {
    throw new Error("CRITICAL: RESEND_API_KEY must be configured in production environment.");
  }

  return new ConsoleEmailProvider();
}
