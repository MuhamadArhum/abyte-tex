import { IsOptional, IsString } from 'class-validator';
import { PaginationQueryDto } from '../../common/dto/pagination.dto';

export class ListNotificationsQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() unreadOnly?: string;
}
