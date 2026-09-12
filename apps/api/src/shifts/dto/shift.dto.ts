import { IsOptional, IsString, Matches, MinLength } from 'class-validator';

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export class CreateShiftDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' })
  startTime!: string;

  @IsString()
  @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' })
  endTime!: string;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @MinLength(1) name?: string;
  @IsOptional() @IsString() @Matches(TIME_PATTERN, { message: 'startTime must be in HH:mm format' }) startTime?: string;
  @IsOptional() @IsString() @Matches(TIME_PATTERN, { message: 'endTime must be in HH:mm format' }) endTime?: string;
}
