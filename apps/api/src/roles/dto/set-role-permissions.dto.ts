import { Type } from 'class-transformer';
import { ArrayNotEmpty, IsArray, IsEnum, ValidateNested } from 'class-validator';
import { Action, Resource } from '../../common/rbac.constants';

class PermissionEntryDto {
  @IsEnum(Resource)
  resource!: Resource;

  @IsEnum(Action)
  action!: Action;
}

export class SetRolePermissionsDto {
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => PermissionEntryDto)
  permissions!: PermissionEntryDto[];
}
