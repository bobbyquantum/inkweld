import { ApiProperty } from '@nestjs/swagger';

export class UserDto {
  @ApiProperty({ example: 'johnDoe' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;
}

export class UserRegisterResponseDto {
  @ApiProperty({ example: 'User registered successfully' })
  message: string;

  @ApiProperty({ example: 'user-123' })
  userId: string;

  @ApiProperty({ example: 'johnDoe' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: false, description: 'Whether the user requires approval before they can log in' })
  requiresApproval: boolean;
}
