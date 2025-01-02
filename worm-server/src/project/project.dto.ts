import { ApiProperty } from '@nestjs/swagger';
import { ProjectEntity } from './project.entity';
import { UserDto } from '../user/user.dto';

export class ProjectDto {
  @ApiProperty({ example: 'my-project-slug' })
  slug: string;

  @ApiProperty({ example: 'My Awesome Project' })
  title: string;

  @ApiProperty({ example: 'This is a cool project.', required: false })
  description?: string;

  @ApiProperty({ type: UserDto, required: false })
  user?: UserDto;

  constructor(entity?: ProjectEntity) {
    if (entity) {
      this.slug = entity.slug;
      this.title = entity.title;
      this.description = entity.description;
      if (entity.user) {
        this.user = {
          username: entity.user.username,
          name: entity.user.name,
        };
      }
    }
  }

  toEntity(): ProjectEntity {
    const project = new ProjectEntity();
    project.slug = this.slug;
    project.title = this.title;
    project.description = this.description;
    return project;
  }
}
