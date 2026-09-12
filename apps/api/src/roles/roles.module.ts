import { Module } from '@nestjs/common';
import { RolesController } from './roles.controller';
import { RolesService } from './roles.service';
import { PermissionBackfillService } from './permission-backfill.service';

@Module({
  controllers: [RolesController],
  providers: [RolesService, PermissionBackfillService],
  exports: [RolesService],
})
export class RolesModule {}
