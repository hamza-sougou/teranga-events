import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Twilio } from 'twilio';

export interface SendSmsInput {
  to: string;
  text: string;
}

@Injectable()
export class SmsChannel {
  private readonly logger = new Logger(SmsChannel.name);

  constructor(private readonly configService: ConfigService) {}

  // Builds a fresh client per send rather than caching one — TWILIO_* may be
  // empty in dev (no config validation at boot, same graceful-degradation
  // stance as GoogleStrategy/EmailChannel); the Twilio constructor itself
  // never connects, only messages.create() does.
  async send(input: SendSmsInput): Promise<void> {
    // Same "silencieux en test" stance as EmailChannel.send — every e2e
    // fixture that registers a phone-auth account goes through
    // AuthService.issuePhoneVerificationCode() -> here, so skip the real
    // network send under NODE_ENV=test.
    if (process.env.NODE_ENV === 'test') {
      this.logger.debug(`[test] Skipped real SMS send to ${input.to}: ${input.text}`);
      return;
    }

    const accountSid = this.configService.get<string>('twilio.accountSid');
    const authToken = this.configService.get<string>('twilio.authToken');
    const fromNumber = this.configService.get<string>('twilio.fromNumber');

    if (!accountSid || !authToken || !fromNumber) {
      this.logger.warn(`Twilio not configured — SMS to ${input.to} not sent`);
      return;
    }

    const client = new Twilio(accountSid, authToken);
    await client.messages.create({ to: input.to, from: fromNumber, body: input.text });

    this.logger.log(`SMS sent to ${input.to}`);
  }
}
