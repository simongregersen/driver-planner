import {TestBed} from '@angular/core/testing';
import {MatChipListboxChange} from '@angular/material/chips';
import {ChipFilterComponent} from './chip-filter.component';

describe('ChipFilterComponent', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({imports: [ChipFilterComponent]});
  });

  afterEach(() => TestBed.resetTestingModule());

  function create() {
    const fixture = TestBed.createComponent(ChipFilterComponent);
    fixture.detectChanges();
    const emitted: string[][] = [];
    fixture.componentInstance.selectionChange.subscribe(v => emitted.push(v));
    return {fixture, emitted};
  }

  describe('onChipChange (multiple=true: value is an array)', () => {
    it('emits the array as-is', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onChipChange({value: ['a', 'b']} as MatChipListboxChange);
      expect(emitted).toEqual([['a', 'b']]);
    });

    it('emits an empty array when the selection is cleared', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onChipChange({value: []} as MatChipListboxChange);
      expect(emitted).toEqual([[]]);
    });
  });

  describe('onChipChange (multiple=false: value is a single id or null)', () => {
    it('wraps a single selected value in an array', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onChipChange({value: 'a'} as MatChipListboxChange);
      expect(emitted).toEqual([['a']]);
    });

    it('emits an empty array when nothing is selected', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onChipChange({value: null} as unknown as MatChipListboxChange);
      expect(emitted).toEqual([[]]);
    });
  });

  describe('onSelectChange (the narrow-screen mat-select fallback)', () => {
    it('passes an array value through as-is', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onSelectChange(['a', 'b']);
      expect(emitted).toEqual([['a', 'b']]);
    });

    it('wraps a single value in an array', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onSelectChange('a');
      expect(emitted).toEqual([['a']]);
    });

    it('emits an empty array for null ("Alle")', () => {
      const {fixture, emitted} = create();
      fixture.componentInstance.onSelectChange(null);
      expect(emitted).toEqual([[]]);
    });
  });
});
