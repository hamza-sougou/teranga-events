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
