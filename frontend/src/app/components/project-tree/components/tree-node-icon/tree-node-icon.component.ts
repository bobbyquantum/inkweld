import { ChangeDetectionStrategy, Component, Input } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-tree-node-icon',
  standalone: true,
  imports: [MatIconModule],
  templateUrl: './tree-node-icon.component.html',
  styleUrls: ['./tree-node-icon.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TreeNodeIconComponent {
  @Input() type!: string;
  @Input() isExpanded = false;
  @Input() isExpandable = false;
}
