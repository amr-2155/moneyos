/**
 * Mailer abstraction. Phase 1 ships a development implementation that logs the
 * intended email (including reset links) to the console. A real SMTP/provider
 * implementation can be swapped in without touching business logic.
 */
export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

export class ConsoleMailer implements Mailer {
  async send(message: EmailMessage): Promise<void> {
    console.log(`[moneyos:mailer] To: ${message.to}`);
    console.log(`[moneyos:mailer] Subject: ${message.subject}`);
    console.log(`[moneyos:mailer] Body:\n${message.text}`);
  }
}
