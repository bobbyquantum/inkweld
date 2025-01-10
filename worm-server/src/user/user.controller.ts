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
  Req,
} from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
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
import { UserService } from './user.service.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { UserDto } from './user.dto.js';
import { UserRegisterDto } from './user-register.dto.js';

@ApiTags('User API')
@ApiBearerAuth()
@Controller('api/v1/users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(
    private readonly userService: UserService,
    private readonly authService: AuthService,
  ) {}

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
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )
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
  async register(@Body() body: UserRegisterDto, @Req() req) {
    const { username, email, password, name } = body;
    const user = await this.userService.registerUser(
      username,
      email,
      password,
      name,
    );

    // Automatically log in the user after registration
    await this.authService.login(req, user);

    return {
      message: 'User registered and logged in',
      userId: user.id,
      username: user.username,
      name: user.name
    };
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
