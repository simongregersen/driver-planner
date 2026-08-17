import {TestBed} from '@angular/core/testing';
import {flushWrites} from '../../test-helpers';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {EMPTY, of} from 'rxjs';
import moment from 'moment';
import {TankRefillFormComponent} from './tank-refill-form.component';
import {DataStore} from '../data.service';
import {TankRefill} from '../tank-refill';

describe('TankRefillFormComponent', () => {
  let dataStore: {updateTankRefill: ReturnType<typeof vi.fn>; addTankRefill: ReturnType<typeof vi.fn>; removeTankRefill: ReturnType<typeof vi.fn>};
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const record: TankRefill = {$key: 'r1', date: moment('2026-01-01'), liters: 500, price: 4500};

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      updateTankRefill: vi.fn(() => Promise.resolve()),
      addTankRefill: vi.fn(() => Promise.resolve()),
      removeTankRefill: vi.fn(() => Promise.resolve()),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [TankRefillFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose, backdropClick: () => EMPTY, keydownEvents: () => EMPTY}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', opts: Partial<TankRefillFormComponent> = {}) {
    const fixture = TestBed.createComponent(TankRefillFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    const c = fixture.componentInstance;
    c.mode = mode;
    Object.assign(c, opts);
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('adds a tank refill with a comma decimal separator parsed correctly', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.tankRefillForm.setValue({date: moment('2026-02-01'), liters: '500', price: '4500,50'});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addTankRefill).toHaveBeenCalledWith(expect.objectContaining({liters: 500, price: 4500.5}));
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does not submit an invalid (non-numeric) reading', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.tankRefillForm.setValue({date: moment('2026-02-01'), liters: 'not-a-number', price: '4500'});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addTankRefill).not.toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.addTankRefill.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.tankRefillForm.setValue({date: moment('2026-02-01'), liters: '500', price: '4500'});
      c.onSubmit();
      await fixture.whenStable();
      await flushWrites();
      expect(snackBarOpen).toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });

  describe('edit', () => {
    it('pre-fills the form with comma-formatted decimals', async () => {
      const fixture = create('edit', {record});
      const val = fixture.componentInstance.tankRefillForm.value;
      expect(val.liters).toBe('500');
      expect(val.price).toBe('4500');
    });

    it('updates the refill and closes the dialog on success', async () => {
      const fixture = create('edit', {record});
      const c = fixture.componentInstance;
      c.tankRefillForm.controls['price'].setValue('5000');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.updateTankRefill).toHaveBeenCalledWith(record, expect.objectContaining({price: 5000}));
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes the refill and closes the dialog when the confirm dialog is accepted', async () => {
      confirmed = true;
      const fixture = create('edit', {record});
      fixture.componentInstance.deleteRefill();
      expect(dataStore.removeTankRefill).toHaveBeenCalledWith(record);
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', async () => {
      confirmed = false;
      const fixture = create('edit', {record});
      fixture.componentInstance.deleteRefill();
      expect(dataStore.removeTankRefill).not.toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
