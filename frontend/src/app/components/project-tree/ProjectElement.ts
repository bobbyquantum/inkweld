export interface ProjectElement {
  id: string;
  name: string;
  children?: ProjectElement[];
  type: 'folder' | 'item';
  level: number;
  expandable?: boolean;
  expanded?: boolean;
  visible?: boolean;
}
