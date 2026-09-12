import { IsDateString, IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListAttendanceQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() factoryId?: string;
  @IsOptional() @IsString() employeeId?: string;
  @IsOptional() @IsDateString() date?: string;
}
