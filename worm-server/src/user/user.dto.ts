import { ApiProperty, ApiSchema } from '@nestjs/swagger';

@ApiSchema({ name: 'User' })
export class UserDto {
  @ApiProperty({ example: 'johnDoe' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: 'https://example.com/avatar.jpg' })
  avatarImageUrl?: string;
}
