import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 'johnDoe' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;
}
