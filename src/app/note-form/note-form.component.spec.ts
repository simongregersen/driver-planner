import {TestBed} from '@angular/core/testing';
import {flushWrites} from '../../test-helpers';
import {MatDialog, MatDialogRef} from '@angular/material/dialog';
import {ConfirmDialogComponent} from '../confirm-dialog/confirm-dialog.component';
import {MatSnackBar} from '@angular/material/snack-bar';
import {EMPTY, of} from 'rxjs';
import moment from 'moment';
import {NoteFormComponent} from './note-form.component';
import {DataStore} from '../data.service';
import {Note} from '../note';

describe('NoteFormComponent', () => {
  let dataStore: {
    updateNote: ReturnType<typeof vi.fn>; addNote: ReturnType<typeof vi.fn>; removeNote: ReturnType<typeof vi.fn>;
    getAllDrivers: ReturnType<typeof vi.fn>; getAllVehicles: ReturnType<typeof vi.fn>;
  };
  let dialogRefClose: ReturnType<typeof vi.fn>;
  let snackBarOpen: ReturnType<typeof vi.fn>;
  let confirmed: boolean;

  const note: Note = {
    $key: 'n1', start: moment('2026-01-01'), end: moment('2026-01-05'), text: 'Ferie',
    drivers: [], vehicles: [],
  };

  beforeEach(() => {
    confirmed = true;
    dataStore = {
      updateNote: vi.fn(() => Promise.resolve()),
      addNote: vi.fn(() => Promise.resolve()),
      removeNote: vi.fn(() => Promise.resolve()),
      getAllDrivers: vi.fn(() => of([])),
      getAllVehicles: vi.fn(() => of([])),
    };
    dialogRefClose = vi.fn();
    snackBarOpen = vi.fn();

    TestBed.configureTestingModule({
      imports: [NoteFormComponent],
      providers: [
        {provide: DataStore, useValue: dataStore},
        {provide: MatDialogRef, useValue: {close: dialogRefClose, backdropClick: () => EMPTY, keydownEvents: () => EMPTY}},
        {provide: MatSnackBar, useValue: {open: snackBarOpen}},
      ],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function create(mode: 'create' | 'edit', n?: Note) {
    const fixture = TestBed.createComponent(NoteFormComponent);
    vi.spyOn(fixture.debugElement.injector.get(MatDialog), 'open')
      .mockReturnValue({afterClosed: () => of(confirmed)} as unknown as MatDialogRef<ConfirmDialogComponent>);
    fixture.componentInstance.mode = mode;
    if (n) fixture.componentInstance.note = n;
    fixture.detectChanges();
    return fixture;
  }

  describe('create', () => {
    it('adds the note with form values and closes the dialog on success', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      const start = moment('2026-02-01');
      c.noteForm.setValue({text: 'Værksted', start, end: null, drivers: [], vehicles: ['v1']});
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.addNote).toHaveBeenCalledWith(expect.objectContaining({text: 'Værksted', start, end: start, vehicles: ['v1']}));
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('shows a snackbar and leaves the dialog open when the write fails', async () => {
      dataStore.addNote.mockReturnValue(Promise.reject(new Error('offline')));
      const fixture = create('create');
      fixture.componentInstance.noteForm.setValue({text: 'Værksted', start: moment('2026-02-01'), end: null, drivers: [], vehicles: []});
      fixture.componentInstance.onSubmit();
      await fixture.whenStable();
      await flushWrites();
      expect(snackBarOpen).toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });

    it('rejects an end date before the start date', async () => {
      const fixture = create('create');
      const c = fixture.componentInstance;
      c.noteForm.setValue({text: 'X', start: moment('2026-02-10'), end: moment('2026-02-05'), drivers: [], vehicles: []});
      expect(c.noteForm.hasError('endBeforeStart')).toBe(true);
    });
  });

  describe('edit', () => {
    it('pre-fills the form from the existing note', async () => {
      const fixture = create('edit', note);
      const val = fixture.componentInstance.noteForm.value;
      expect(val.text).toBe('Ferie');
      expect(val.start).toBe(note.start);
      expect(val.end).toBe(note.end);
    });

    it('updates the existing note and closes the dialog on success', async () => {
      const fixture = create('edit', note);
      const c = fixture.componentInstance;
      c.noteForm.controls['text'].setValue('Ferie (forlænget)');
      c.onSubmit();
      await fixture.whenStable();
      expect(dataStore.updateNote).toHaveBeenCalledWith(note, expect.objectContaining({text: 'Ferie (forlænget)'}));
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('removes the note and closes the dialog when the confirm dialog is accepted', async () => {
      confirmed = true;
      const fixture = create('edit', note);
      fixture.componentInstance.deleteNote();
      expect(dataStore.removeNote).toHaveBeenCalledWith(note);
      await flushWrites();
      expect(dialogRefClose).toHaveBeenCalled();
    });

    it('does nothing when the confirm dialog is declined', async () => {
      confirmed = false;
      const fixture = create('edit', note);
      fixture.componentInstance.deleteNote();
      expect(dataStore.removeNote).not.toHaveBeenCalled();
      await flushWrites();
      expect(dialogRefClose).not.toHaveBeenCalled();
    });
  });
});
