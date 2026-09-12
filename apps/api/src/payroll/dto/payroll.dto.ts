import { IsDateString, IsIn, IsNumber, IsString, Min } from 'class-validator';

export class CreatePayrollPeriodDto {
  @IsString() factoryId!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

export const PAYROLL_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'PAID'] as const;

export class UpdatePayrollPeriodStatusDto {
  @IsIn(PAYROLL_STATUSES)
  status!: (typeof PAYROLL_STATUSES)[number];
}

/** Payroll inputs, not a full payroll engine — SRS §10.3. */
export class AddPayrollEntryDto {
  @IsString() employeeId!: string;
  @IsNumber() @Min(0) baseSalary!: number;
  @IsNumber() @Min(0) overtimeAmount!: number;
  @IsNumber() @Min(0) incentiveAmount!: number;
  @IsNumber() @Min(0) deductions!: number;
}
