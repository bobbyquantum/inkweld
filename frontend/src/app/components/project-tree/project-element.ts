import { ProjectElementDto } from 'worm-api-client';

export interface ProjectElement {
  id: string;
  name: string;
  type: 'FOLDER' | 'ITEM';
  level: number;
  position: number;
  expandable?: boolean;
  expanded?: boolean;
  visible?: boolean;
}

export function mapDtoToProjectElement(dto: ProjectElementDto): ProjectElement {
  return {
    id: dto.id || '',
    name: dto.name || '',
    type: dto.type || 'ITEM',
    level: dto.level || 0,
    position: dto.position || 0,
    expandable: dto.type === 'FOLDER',
    expanded: false,
    visible: true,
  };
}
