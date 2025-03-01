import { ApiProperty } from '@nestjs/swagger';
import { UserDto } from '../auth/user.dto.js';
import { ProjectEntity } from './project.entity.js';

export class ProjectDto {
  @ApiProperty({ example: 'my-project-id', required: false })
  id: string;

  @ApiProperty({ example: 'my-project-slug' })
  slug: string;

  @ApiProperty({ example: 'My Awesome Project' })
  title: string;

  @ApiProperty({ example: 'This is a cool project.', required: false })
  description?: string;

  @ApiProperty({ type: UserDto, required: false })
  user?: UserDto;

  @ApiProperty({ type: Date, example: '2023-01-01T00:00:00.000Z' })
  createdDate: Date;

  @ApiProperty({ type: Date, example: '2023-01-01T00:00:00.000Z' })
  updatedDate: Date;

  constructor(entity?: ProjectEntity) {
    if (entity) {
      this.slug = entity.slug;
      this.title = entity.title;
      this.description = entity.description;
      this.createdDate = new Date(entity.createdAt);
      this.updatedDate = new Date(entity.updatedAt);
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
    project.createdAt = this.createdDate?.getTime();
    project.updatedAt = this.updatedDate?.getTime();
    return project;
  }
}
