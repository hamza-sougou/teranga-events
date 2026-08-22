import { Module } from '@nestjs/common';
import { R2Provider } from './providers/r2.provider';

@Module({
  providers: [R2Provider],
  exports: [R2Provider],
})
export class StorageModule {}
