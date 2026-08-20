import {TestBed} from '@angular/core/testing';
import {DataStore} from '../data.service';
import {ReadReceiptsService} from './read-receipts.service';

describe('ReadReceiptsService', () => {
  let calls: [string, string, number][];
  let result: Promise<void>;

  beforeEach(() => {
    calls = [];
    result = Promise.resolve();
    TestBed.configureTestingModule({
      providers: [{
        provide: DataStore,
        useValue: {
          markTripRead: (tripKey: string, driverKey: string, version: number) => {
            calls.push([tripKey, driverKey, version]);
            return result;
          },
        },
      }],
    });
  });

  afterEach(() => TestBed.resetTestingModule());

  function service(): ReadReceiptsService {
    return TestBed.inject(ReadReceiptsService);
  }

  it('records a receipt', () => {
    service().record('t1', 'd1', 100);

    expect(calls).toEqual([['t1', 'd1', 100]]);
  });

  // The database is the real authority on first-read-wins, but it enforces it by *rejecting* the
  // duplicate — and a rejected write is rolled back, which re-arms the directive that asked for
  // it. Without remembering the attempt that becomes a loop for as long as the row is on screen.
  it('does not repeat an attempt for the same version', () => {
    const s = service();
    s.record('t1', 'd1', 100);
    s.record('t1', 'd1', 100);

    expect(calls).toHaveLength(1);
  });

  it('records again once the trip has been changed afresh', () => {
    const s = service();
    s.record('t1', 'd1', 100);
    s.record('t1', 'd1', 200);

    expect(calls).toEqual([['t1', 'd1', 100], ['t1', 'd1', 200]]);
  });

  it('keeps trips and drivers apart', () => {
    const s = service();
    s.record('t1', 'd1', 100);
    s.record('t2', 'd1', 100);
    s.record('t1', 'd2', 100);

    expect(calls).toHaveLength(3);
  });

  // A receipt is never something the driver is waiting on, so a failure must stay silent — and in
  // particular must not reach WriteFeedbackService and put a snackbar in front of them.
  it('swallows a rejected write without retrying it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    result = Promise.reject(new Error('permission_denied'));
    const s = service();

    expect(() => s.record('t1', 'd1', 100)).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(warn).toHaveBeenCalled();
    s.record('t1', 'd1', 100);
    expect(calls).toHaveLength(1);
    warn.mockRestore();
  });
});
