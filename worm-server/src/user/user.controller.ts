import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
  Logger,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { SessionAuthGuard } from '../auth/session-auth.guard';
import { UserDto } from './user.dto';
import { UserRegisterDto } from './user-register.dto';

@ApiTags('User API')
@ApiBearerAuth()
@Controller('api/v1/users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Get current user profile',
    description: 'Retrieves the profile information of the authenticated user.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved user profile',
    type: UserDto,
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  async getMe(@Request() req) {
    this.logger.log('getMe', req.user);
    try {
      const user = await this.userService.getCurrentUser(req.user.id);
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarImageUrl: user.avatarImageUrl,
        enabled: user.enabled,
      };
    } catch (error) {
      this.logger.error('Error getting user', error);
      throw error;
    }
  }

  @Post('register')
  @UsePipes(new ValidationPipe())
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account with the provided registration details.',
  })
  @ApiCreatedResponse({
    description: 'User successfully registered',
    type: UserDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid registration data provided' })
  @ApiBody({ type: UserRegisterDto })
  async register(@Body() body: UserRegisterDto) {
    const { username, email, password, name } = body;
    const user = await this.userService.registerUser(
      username,
      email,
      password,
      name,
    );
    return { message: 'User registered', userId: user.id };
  }

  @Get('oauth2-providers')
  @ApiOperation({
    summary: 'Get available OAuth2 providers',
    description:
      'Retrieves a list of available OAuth2 authentication providers.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved OAuth2 providers',
    type: [String],
  })
  getOAuthProviders(): string[] {
    return ['github'];
  }
}
