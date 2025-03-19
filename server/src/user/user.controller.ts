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
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ValidationException } from '../common/exceptions/validation.exception.js';
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
  ApiHeader,
} from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { UserDto } from './user.dto.js';
import { UserRegisterDto } from './user-register.dto.js';

interface PagedRequest {
  page?: number;
  pageSize?: number;
}

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

  @Get()
  @ApiOperation({
    summary: 'Get paged list of users',
    description: 'Retrieves a paginated list of users.',
  })
  @ApiOkResponse({
    description: 'Successfully retrieved paged list of users',
    type: [UserDto], // Assuming UserDto is used for user representation
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters' })
  async getUsers(@Query() query: PagedRequest) {
    const page = query.page || 1; // Default to page 1
    const pageSize = query.pageSize || 10; // Default page size to 10
    return this.userService.getPagedUsers({ page, pageSize });
  }

  @Get('search')
  @ApiOperation({
    summary: 'Search users with pagination',
    description:
      'Searches for users based on a search term and returns a paginated list.',
  })
  @ApiOkResponse({
    description:
      'Successfully retrieved paged list of users based on search term',
    type: [UserDto], // Assuming UserDto is used for user representation
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or missing authentication' })
  @ApiBadRequestResponse({ description: 'Invalid search parameters' })
  async searchUsers(@Query('term') term: string, @Query() query: PagedRequest) {
    const page = query.page || 1; // Default to page 1
    const pageSize = query.pageSize || 10; // Default page size to 10
    return this.userService.pagedSearchUsers({ term, page, pageSize });
  }

  @Post('register')
  @UsePipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      exceptionFactory: (errors) => {
        const mappedErrors = errors.reduce((acc, err) => {
          acc[err.property] = Object.values(err.constraints || {});
          return acc;
        }, {});
        return new ValidationException(mappedErrors);
      },
    }),
  )
  @ApiOperation({
    summary: 'Register a new user',
    description:
      'Creates a new user account with the provided registration details.',
  })
  @ApiHeader({
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  @ApiCreatedResponse({
    description: 'User successfully registered',
    type: UserDto,
  })
  @ApiBadRequestResponse({ description: 'Invalid registration data provided' })
  @ApiBody({ type: UserRegisterDto })
  async register(@Body() body: UserRegisterDto, @Req() req) {
    this.logger.log('register', body);
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
      userId: user?.id,
      username: user?.username,
      name: user?.name,
    };
  }

  @Get('check-username')
  @ApiOperation({
    summary: 'Check username availability',
    description: 'Checks if a username is available for registration.',
  })
  @ApiOkResponse({
    description: 'Username availability status',
    schema: {
      type: 'object',
      properties: {
        available: { type: 'boolean' },
        suggestions: {
          type: 'array',
          items: { type: 'string' },
        },
      },
    },
  })
  @ApiBadRequestResponse({ description: 'Invalid username format' })
  async checkUsernameAvailability(@Query('username') username: string) {
    if (!username || username.length < 3) {
      throw new BadRequestException('Username must be at least 3 characters');
    }

    const { available, suggestions } =
      await this.userService.checkUsernameAvailability(username);

    return {
      available,
      suggestions: available ? [] : suggestions,
    };
  }
}
