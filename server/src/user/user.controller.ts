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
  Param,
  Res,
  UploadedFile,
  UseInterceptors,
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
  ApiParam,
  ApiConsumes,
} from '@nestjs/swagger';
import { UserService } from './user.service.js';
import { SessionAuthGuard } from '../auth/session-auth.guard.js';
import { UserDto } from './user.dto.js';
import { UserRegisterDto } from './user-register.dto.js';
import { UserRegisterResponseDto } from './user.dto.js';
import { FileInterceptor } from '@nestjs/platform-express';
import { SystemConfigService } from '../config/config.service.js';
// Define MulterFile interface for Bun environment
interface MulterFile {
  fieldname: string;
  originalname: string;
  encoding: string;
  mimetype: string;
  size: number;
  destination?: string;
  filename?: string;
  path?: string;
  buffer?: Buffer;
}

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
    private readonly systemConfigService: SystemConfigService,
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
    type: [UserDto],
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
    type: [UserDto],
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
      'Creates a new user account with the provided registration details. May require captcha verification if enabled.',
  })
  @ApiHeader({
    name: 'X-CSRF-TOKEN',
    description: 'CSRF token',
    required: true,
  })
  @ApiCreatedResponse({
    description: 'User successfully registered',
    type: UserRegisterResponseDto,
  })
  @ApiBadRequestResponse({
    description:
      'Invalid registration data provided or captcha verification failed',
  })
  @ApiBody({ type: UserRegisterDto })
  async register(@Body() body: UserRegisterDto, @Req() req) {
    this.logger.log('register', body);
    const { username, email, password, name, captchaToken } = body;

    // Check if captcha is required and verify it
    const captchaSettings = this.systemConfigService.getCaptchaSettings();
    if (captchaSettings.enabled) {
      if (!captchaToken) {
        throw new BadRequestException('Captcha verification is required');
      }

      const isCaptchaValid =
        await this.systemConfigService.verifyCaptcha(captchaToken);
      if (!isCaptchaValid) {
        throw new BadRequestException('Captcha verification failed');
      }
    }

    // Check if user approval is required
    const systemFeatures = this.systemConfigService.getSystemFeatures();
    const requireApproval = systemFeatures.userApprovalRequired;

    // Use username as display name if no name is provided
    const displayName = name && name.trim() ? name.trim() : username;

    const user = await this.userService.registerUser(
      username,
      email,
      password,
      displayName,
      requireApproval,
    );

    // Only log in the user if approval is not required
    if (!requireApproval) {
      await this.authService.login(req, user);
      return {
        message: 'User registered and logged in',
        userId: user?.id,
        username: user?.username,
        name: user?.name,
        requiresApproval: false,
      };
    } else {
      // Return pending approval message
      return {
        message: 'Registration successful! Your account is pending approval from an administrator.',
        userId: user?.id,
        username: user?.username,
        name: user?.name,
        requiresApproval: true,
      };
    }
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

  @Get(':username/avatar')
  @ApiOperation({
    summary: 'Get user avatar',
    description: "Retrieves a user's avatar image as a PNG file.",
  })
  @ApiParam({
    name: 'username',
    description: 'Username of the user whose avatar to retrieve',
  })
  @ApiOkResponse({
    description: 'User avatar image',
    content: {
      'image/png': {},
    },
  })
  async getUserAvatar(@Param('username') username: string, @Res() res) {
    try {
      const hasAvatar = await this.userService.hasUserAvatar(username);

      if (!hasAvatar) {
        // Return a 404 response or default avatar
        return res.status(404).send('Avatar not found');
      }

      const buffer = await this.userService.getUserAvatar(username);

      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Content-Length', buffer.length.toString());
      return res.send(buffer);
    } catch (error) {
      this.logger.error(`Error getting avatar for ${username}`, error);
      return res.status(404).send('Avatar not found');
    }
  }

  @Post('avatar')
  @UseGuards(SessionAuthGuard)
  @UseInterceptors(FileInterceptor('avatar'))
  @ApiOperation({
    summary: 'Upload user avatar',
    description: "Uploads and updates the authenticated user's avatar image.",
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        avatar: {
          type: 'string',
          format: 'binary',
          description: 'Avatar image file (PNG, JPEG, GIF, or WebP)',
        },
      },
    },
  })
  @ApiCreatedResponse({
    description: 'Avatar successfully uploaded',
  })
  @ApiBadRequestResponse({ description: 'Invalid file format or size' })
  async uploadAvatar(@Request() req, @UploadedFile() file: MulterFile) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    // Get the current user
    const user = await this.userService.getCurrentUser(req.user.id);

    if (!user || !user.username) {
      throw new BadRequestException('User not found');
    }

    try {
      // Save the avatar
      await this.userService.saveUserAvatar(user.username, file.buffer);

      return {
        message: 'Avatar uploaded successfully',
      };
    } catch (error) {
      this.logger.error('Error uploading avatar', error);
      throw new BadRequestException('Failed to process avatar image');
    }
  }

  @Post('avatar/delete')
  @UseGuards(SessionAuthGuard)
  @ApiOperation({
    summary: 'Delete user avatar',
    description: "Deletes the authenticated user's avatar image.",
  })
  @ApiOkResponse({
    description: 'Avatar successfully deleted',
  })
  async deleteAvatar(@Request() req) {
    // Get the current user
    const user = await this.userService.getCurrentUser(req.user.id);

    if (!user || !user.username) {
      throw new BadRequestException('User not found');
    }

    try {
      // Delete the avatar
      await this.userService.deleteUserAvatar(user.username);

      return {
        message: 'Avatar deleted successfully',
      };
    } catch (error) {
      this.logger.error('Error deleting avatar', error);
      throw new BadRequestException('Failed to delete avatar');
    }
  }
}
