import { ApiProperty } from '@nestjs/swagger';

export class LoginRequestDto {
  @ApiProperty({ example: 'johnDoe' })
  username: string;

  @ApiProperty({ example: 'password123' })
  password: string;
}

export class LoginResponseDto {
  @ApiProperty({ example: 'user-1' })
  id: string;

  @ApiProperty({ example: 'johnDoe' })
  username: string;

  @ApiProperty({ example: 'John Doe' })
  name: string;

  @ApiProperty({ example: true })
  enabled: boolean;

  @ApiProperty({ example: '12345abcde' })
  sessionId: string;
}
