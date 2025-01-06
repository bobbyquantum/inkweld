import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-github2';
import { UserService } from '../user/user.service';

@Injectable()
export class GithubStrategy extends PassportStrategy(Strategy, 'github') {
  private logger = new Logger(GithubStrategy.name);

  constructor(private userService: UserService) {
    super({
      clientID: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      callbackURL:
        process.env.GITHUB_CALLBACK_URL ||
        'http://localhost:8333/oauth2/code/github',
      scope: ['user:email'],
    });
  }

  async validate(_accessToken: string, _refreshToken: string, profile: any) {
    this.logger.log('GitHub profile validation', profile.username);
    const { id, username, emails, photos } = profile;

    try {
      // First, try to find an existing user by GitHub ID
      let user = await this.userService.findByGithubId(id.toString());

      // If no user found, create a new GitHub user
      if (!user) {
        user = await this.userService.createGithubUser({
          githubId: id.toString(),
          username: username,
          email: emails && emails.length > 0 ? emails[0].value : null,
          name: profile.displayName,
          avatarImageUrl: photos && photos.length > 0 ? photos[0].value : null,
        });
      }

      // Return a simplified user object that matches what getMe expects
      return {
        id: user.id,
        username: user.username,
        name: user.name,
        avatarImageUrl: user.avatarImageUrl,
        githubId: user.githubId,
      };
    } catch (error) {
      this.logger.error('GitHub authentication error', error);
      throw error;
    }
  }
}
