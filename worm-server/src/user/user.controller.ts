import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  BadRequestException,
  UseGuards,
  Request,
  Logger,
} from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { UserService } from './user.service';
import { UserDto } from './user.dto';
import { AuthGuard } from '@nestjs/passport';
import { GithubAuthGuard } from 'src/auth/github-auth.guard';
import { SessionAuthGuard } from 'src/auth/session-auth.guard';

@ApiTags('User API')
@Controller('api/v1/users')
export class UserController {
  private readonly logger = new Logger(UserController.name);

  constructor(private readonly userService: UserService) {}

  // For demonstration, we’re skipping real auth. Typically you’d use @UseGuards(JwtAuthGuard) etc.

  @Get('me')
  @UseGuards(SessionAuthGuard)
  async getMe(@Request() req) {
    this.logger.log('getMe', req.user);
    const user = await this.userService.getCurrentUser(req.user.id);
    return {
      id: user.id,
      username: user.username,
      name: user.name,
      avatarImageUrl: user.avatarImageUrl,
      enabled: user.enabled,
    };
  }

  // @Get(':id')
  // async getUser(@Param('id') userId: string) {
  //   // In a real scenario, you might only let the user fetch themselves or be admin
  //   const user = await this.userService.getCurrentUser(userId);
  //   return {
  //     id: user.id,
  //     username: user.username,
  //     name: user.name,
  //     avatarImageUrl: user.avatarImageUrl,
  //     enabled: user.enabled,
  //   };
  // }

  @Post('register')
  async register(@Body() body: any) {
    const { username, email, password, name } = body;
    if (!username || !email || !password) {
      throw new BadRequestException('Missing required fields');
    }
    const user = await this.userService.registerUser(
      username,
      email,
      password,
      name,
    );
    return { message: 'User registered', userId: user.id };
  }

  // @Patch(':id')
  // async updateUser(@Param('id') userId: string, @Body() dto: Partial<UserDto>) {
  //   const updatedUser = await this.userService.updateUserDetails(userId, dto);
  //   return { message: 'User updated', user: updatedUser };
  // }

  // @Post(':id/change-password')
  // async changePassword(
  //   @Param('id') userId: string,
  //   @Body() body: { oldPassword: string; newPassword: string },
  // ) {
  //   await this.userService.updatePassword(
  //     userId,
  //     body.oldPassword,
  //     body.newPassword,
  //   );
  //   return { message: 'Password updated' };
  // }

  // @Delete(':id')
  // async deleteUser(@Param('id') userId: string) {
  //   await this.userService.deleteAccount(userId);
  //   return { message: 'User deleted' };
  // }

  @Get('oauth2-providers')
  getOAuthProviders() {
    return ['github'];
  }
}
