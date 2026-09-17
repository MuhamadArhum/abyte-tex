import { Module } from '@nestjs/common';
import { InventoryModule } from '../inventory/inventory.module';
import { QualityModule } from '../quality/quality.module';
import { DispatchController } from './dispatch.controller';
import { DispatchService } from './dispatch.service';

@Module({
  imports: [InventoryModule, QualityModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
