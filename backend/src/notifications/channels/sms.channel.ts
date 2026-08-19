import { Injectable } from '@nestjs/common';

export interface SendSmsInput {
  to: string;
  text: string;
}

// No SMS provider is configured anywhere in this project yet (no keys in
// .env.example, no SDK dependency) — kept as an explicit reserve channel,
// same treatment as CinetpayProvider during the payments module: present in
// the type system, not silently no-op if actually invoked.
@Injectable()
export class SmsChannel {
  send(_input: SendSmsInput): Promise<void> {
    throw new Error('SMS notifications are not implemented yet');
  }
}
