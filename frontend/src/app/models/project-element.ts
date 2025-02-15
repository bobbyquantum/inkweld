import { ProjectElementDto } from '@worm/index';

export interface ProjectElement {
  id: string | undefined;
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
    id: dto.id,
    name: dto.name || '',
    type: dto.type || 'ITEM',
    level: dto.level || 1, // Default to level 1 since we no longer use root node wrapping
    position: dto.position || 0,
    expandable: dto.type === 'FOLDER',
    expanded: false,
    visible: true,
  };
}
