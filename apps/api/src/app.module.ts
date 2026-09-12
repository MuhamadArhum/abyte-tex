import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

import { validateEnv } from './config/env.validation';
import { buildConfiguration } from './config/configuration';

import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { MailModule } from './mail/mail.module';

import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { TenantContextInterceptor } from './common/interceptors/tenant-context.interceptor';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { TenantsModule } from './tenants/tenants.module';
import { RolesModule } from './roles/roles.module';
import { FactoriesModule } from './factories/factories.module';
import { DepartmentsModule } from './departments/departments.module';
import { WarehousesModule } from './warehouses/warehouses.module';
import { ProductsModule } from './products/products.module';
import { MaterialsModule } from './materials/materials.module';
import { CustomersModule } from './customers/customers.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: (config) => buildConfiguration(validateEnv(config)),
    }),
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),

    PrismaModule,
    AuditModule,
    MailModule,

    AuthModule,
    UsersModule,
    TenantsModule,
    RolesModule,
    FactoriesModule,
    DepartmentsModule,
    WarehousesModule,
    ProductsModule,
    MaterialsModule,
    CustomersModule,
    SuppliersModule,
    HealthModule,
  ],
  providers: [
    // Guards (run before interceptors): rate-limit, then authenticate
    // (JwtAuthGuard sets request.user), then enforce permissions (reads
    // request.user directly — see PermissionsGuard's docstring for why it
    // can't use the ALS tenant context here).
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Interceptors (run after guards, wrap the controller call): establish the
    // AsyncLocalStorage tenant context first, so it's active for every service/
    // Prisma call the controller makes, then apply the response envelope.
    { provide: APP_INTERCEPTOR, useClass: TenantContextInterceptor },
    { provide: APP_INTERCEPTOR, useClass: ResponseInterceptor },
  ],
})
export class AppModule {}
