import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

@Injectable()
export class EmailChannel {
  private readonly logger = new Logger(EmailChannel.name);

  constructor(private readonly configService: ConfigService) {}

  // Builds a fresh transport per send rather than caching one — SMTP_* may
  // be empty in dev (no config validation at boot, same graceful-degradation
  // stance as GoogleStrategy); createTransport() itself never connects, only
  // sendMail() does, so this never blocks app startup.
  async send(input: SendEmailInput): Promise<void> {
    // Every e2e fixture that bootstraps an organizer goes through
    // AuthService.register() -> issueVerificationCode() -> here, so skip
    // the real network send under NODE_ENV=test — same "silencieux en
    // test" stance as ThrottlerModule (app.module.ts). Tests that care
    // about the actual call (recipient, content, failure handling) mock
    // this method directly, as notifications.e2e-spec.ts already does.
    if (process.env.NODE_ENV === 'test') {
      this.logger.debug(`[test] Skipped real send to ${input.to}: ${input.subject}`);
      return;
    }

    const transport = nodemailer.createTransport({
      host: this.configService.get<string>('smtp.host'),
      port: this.configService.get<number>('smtp.port'),
      auth: {
        user: this.configService.get<string>('smtp.user'),
        pass: this.configService.get<string>('smtp.password'),
      },
    });

    await transport.sendMail({
      from: this.configService.get<string>('smtp.fromEmail'),
      to: input.to,
      subject: input.subject,
      text: input.text,
    });

    this.logger.log(`Email sent to ${input.to}: ${input.subject}`);
  }
}
