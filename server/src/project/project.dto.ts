import { ApiProperty } from '@nestjs/swagger';
import { ProjectEntity } from './project.entity.js';
import { UserDto } from '../user/user.dto.js';

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
      this.createdDate = entity.createdDate;
      this.updatedDate = entity.updatedDate;
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
    project.createdDate = this.createdDate;
    project.updatedDate = this.updatedDate;
    return project;
  }
}
