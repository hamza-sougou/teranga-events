import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

@Injectable()
export class QrcodeService {
  async generate(payload: string): Promise<string> {
    return QRCode.toDataURL(payload);
  }
}
