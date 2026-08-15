import {ChangeDetectionStrategy, Component, input, output} from '@angular/core';
import {MatChipListboxChange, MatChipsModule} from '@angular/material/chips';
import {MatFormFieldModule} from '@angular/material/form-field';
import {MatSelectModule} from '@angular/material/select';
import {SelectOption} from '../select-option';

// A thin wrapper around mat-chip-listbox/mat-chip-option — the selectable-chip API (distinct
// from the plain mat-chip-set used for read-only trip chips elsewhere) already wraps onto
// multiple lines and has a built-in selected state, so there's no custom toggle logic here.
// On small screens the chips give way to a plain mat-select — chips need horizontal room to
// wrap sensibly, which a narrow sidebar doesn't have.
@Component({
  standalone: true,
  selector: 'app-chip-filter',
  templateUrl: './chip-filter.component.html',
  styleUrls: ['./chip-filter.component.css'],
  imports: [MatChipsModule, MatFormFieldModule, MatSelectModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChipFilterComponent {
  options = input<SelectOption[]>([]);
  selectedIds = input<string[]>([]);
  multiple = input(true);
  label = input('Vælg');
  disabled = input(false);
  selectionChange = output<string[]>();

  // MatChipListboxChange.value is a single value when multiple=false, an array when true —
  // callers of this component always get a string[] regardless of mode.
  onChipChange(event: MatChipListboxChange): void {
    const value = event.value;
    const ids = Array.isArray(value) ? value : (value != null ? [value] : []);
    this.selectionChange.emit(ids);
  }

  onSelectChange(value: string | string[] | null): void {
    const ids = Array.isArray(value) ? value : (value != null ? [value] : []);
    this.selectionChange.emit(ids);
  }
}
