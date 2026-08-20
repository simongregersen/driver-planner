// Integration tests for database.rules.json, run against the Realtime Database emulator.
//
// These are deliberately not part of `npm test`: they need a running emulator, which the Angular
// unit-test runner has no way to provide. Run them with `npm run test:rules`, which starts the
// emulator, runs this file, and shuts it down again.
//
// Why they exist at all: the security rules are the only thing actually enforcing the app's
// access model, and two of the app's guarantees live *entirely* in this file rather than in any
// TypeScript the unit tests can reach —
//
//   1. that a driver cannot read the office's internal notes and planning labels (the /tripOffice
//      split), and
//   2. that the two paths a driver *can* write to accept only well-formed data.
//
// Both are invisible from the client: the UI simply never asks for the data it isn't allowed to
// have, so a regression in these rules would not fail a single component test while quietly
// exposing every trip ever recorded.
//
// The write shapes asserted here mirror what DataStore actually sends (see addTrip/updateTrip/
// removeTrip), so this doubles as a contract test for the data layer's multi-path writes — in
// particular that editing a trip cannot clobber the driver-written `reports` subtree.

import {allowed, check, denied, req, run} from './harness.mjs';

const VALID_REPORT = {
  start: 1000, startFromCustomer: true, end: 2000, endFromCustomer: true,
  startKm: 10, startKmFromCustomer: false, endKm: 20, endKmFromCustomer: false, note: 'kørt',
};

async function seed() {
  await req('', {as: 'owner', method: 'DELETE'});
  await req('users/adminU', {as: 'owner', body: {role: 'admin'}});
  await req('users/driverU', {as: 'owner', body: {role: 'driver', driverId: 'd1'}});
  await req('users/otherU', {as: 'owner', body: {role: 'driver', driverId: 'd2'}});
}

async function tripReportRules() {
  console.log('\nTrip reports — the shape a driver may write:');
  await req('trips/t1', {as: 'owner', body: {start: 5000, name: 'Tur', drivers: ['d1'], vehicles: []}});

  check('a driver may write their own well-formed report',
    allowed(await req('trips/t1/reports/d1', {as: 'driverU', body: VALID_REPORT})));
  check('unknown fields are rejected',
    denied(await req('trips/t1/reports/d1', {as: 'driverU', body: {...VALID_REPORT, evil: 'x'}})));
  check('a report missing its required flags is rejected',
    denied(await req('trips/t1/reports/d1', {as: 'driverU', body: {note: 'kun en note'}})));
  check('a report under a non-existent trip is rejected',
    denied(await req('trips/GHOST/reports/d1', {as: 'driverU', body: VALID_REPORT})));
  check('an oversized note is rejected',
    denied(await req('trips/t1/reports/d1', {as: 'driverU', body: {...VALID_REPORT, note: 'x'.repeat(2001)}})));
  check('a non-numeric odometer reading is rejected',
    denied(await req('trips/t1/reports/d1', {as: 'driverU', body: {...VALID_REPORT, startKm: 'mange'}})));
  check("a driver may not write another driver's report",
    denied(await req('trips/t1/reports/d2', {as: 'driverU', body: VALID_REPORT})));
  check('a driver may delete their own report',
    allowed(await req('trips/t1/reports/d1', {as: 'driverU', method: 'DELETE'})));
}

async function clockRecordRules() {
  console.log('\nClock records — payroll evidence, so the shape matters:');
  check('a valid open record is accepted',
    allowed(await req('clockRecords/d1/r1', {as: 'driverU', body: {clockIn: 1000}})));
  check('a valid closed record is accepted',
    allowed(await req('clockRecords/d1/r2', {as: 'driverU', body: {clockIn: 1000, clockOut: 2000, note: 'n', dognbetaling: true}})));
  check('clockOut before clockIn is rejected',
    denied(await req('clockRecords/d1/r3', {as: 'driverU', body: {clockIn: 5000, clockOut: 1000}})));
  check('a record with no clockIn is rejected',
    denied(await req('clockRecords/d1/r4', {as: 'driverU', body: {clockOut: 2000}})));
  check('unknown fields are rejected',
    denied(await req('clockRecords/d1/r5', {as: 'driverU', body: {clockIn: 1, sneaky: true}})));
  // The punch widget closes a shift with a partial update rather than rewriting the record.
  check('closing an open record with a partial update is accepted',
    allowed(await req('clockRecords/d1/r1', {method: 'PATCH', as: 'driverU', body: {clockOut: 9000}})));
  check("a driver may not write another driver's records",
    denied(await req('clockRecords/d2/r9', {as: 'driverU', body: {clockIn: 1}})));
  check('a driver may delete their own record',
    allowed(await req('clockRecords/d1/r2', {as: 'driverU', method: 'DELETE'})));
}

async function tripOfficeRules() {
  console.log('\nOffice data — must be unreachable by drivers:');
  // Exactly the multi-path write DataStore.addTrip issues.
  const created = await req('', {method: 'PATCH', as: 'adminU', body: {
    '/trips/t2': {start: 5000, end: null, name: 'Bytur', description: 'til chauffører', drivers: ['d1'], vehicles: [], multiDayStart: null},
    '/tripOffice/t2': {officeDescription: 'INTERN: kunden betaler kontant', labels: ['vip']},
  }});
  check('an admin creates a trip and its office half in one write', allowed(created));

  const tripNode = await req('trips/t2', {method: 'GET', as: 'adminU'});
  check('the trip node itself carries no office fields',
    tripNode.json && !('officeDescription' in tripNode.json) && !('labels' in tripNode.json),
    JSON.stringify(tripNode.json));

  check('an admin can read office data',
    allowed(await req('tripOffice/t2', {method: 'GET', as: 'adminU'})));

  const driverTrip = await req('trips/t2', {method: 'GET', as: 'driverU'});
  check('a driver can still read the trip itself', allowed(driverTrip) && driverTrip.json?.name === 'Bytur');
  check('a driver cannot read a single office record',
    denied(await req('tripOffice/t2', {method: 'GET', as: 'driverU'})));
  check('a driver cannot enumerate the whole office node',
    denied(await req('tripOffice', {method: 'GET', as: 'driverU'})));
  check('a driver cannot write office data',
    denied(await req('tripOffice/t2', {as: 'driverU', body: {officeDescription: 'hacked'}})));
  check('unknown office fields are rejected',
    denied(await req('tripOffice/t3', {as: 'adminU', body: {officeDescription: 'x', labels: [], secret: 'y'}})));

  // The record holds only the two admin fields — no copy of the trip's dates. Nothing sorts this
  // node, so there is nothing here that has to be kept in step with the trip.
  const stored = await req('tripOffice/t2', {method: 'GET', as: 'adminU'});
  check('the office record carries no copy of the trip dates',
    stored.json && !('start' in stored.json) && !('multiDayStart' in stored.json),
    JSON.stringify(stored.json));

  // Guards the design decision itself: adding a sort key back would silently reintroduce the
  // synchronisation burden this node exists without.
  check('a date field on an office record is rejected outright',
    denied(await req('tripOffice/t2', {as: 'adminU', body: {start: 5000, officeDescription: 'x', labels: []}})));
}

// The read receipts behind Dagsplaner's unread warning. Two things are genuinely load-bearing
// here and neither is visible from the client code: that a driver can never re-stamp a receipt
// they already wrote, and that a trip which was published rather than *changed* accepts no
// receipt at all — the feature's scope, enforced by the database rather than by the UI.
async function tripReadRules() {
  console.log('\nTrip read receipts:');
  const SV = {'.sv': 'timestamp'};
  // modified is what marks a trip as "changed after its day was already public".
  await req('trips/t5', {as: 'owner', body: {start: 5000, name: 'Tur', drivers: ['d1'], modified: 7000}});
  // No modified: planned before publication, so there was never a change to miss.
  await req('trips/t6', {as: 'owner', body: {start: 5000, name: 'Uændret tur', drivers: ['d1']}});

  check('a driver can record having read the current version',
    allowed(await req('trips/t5/reads/d1', {as: 'driverU', body: {at: SV, version: 7000}})));

  check('a driver cannot record a version the trip does not have',
    denied(await req('trips/t5/reads/d1', {as: 'driverU', body: {at: SV, version: 9999}})));

  // at is read back to the office as "Læst kl. …", so a client-supplied clock would let a driver
  // choose what the office sees.
  check('a client-chosen timestamp is rejected in favour of server time',
    denied(await req('trips/t5/reads/d2', {as: 'otherU', body: {at: 1234, version: 7000}})));

  check('a driver cannot write another driver s receipt',
    denied(await req('trips/t5/reads/d2', {as: 'driverU', body: {at: SV, version: 7000}})));

  check('unknown fields on a receipt are rejected',
    denied(await req('trips/t5/reads/d1', {as: 'driverU', body: {at: SV, version: 7000, note: 'x'}})));

  check('a receipt under a trip that does not exist is rejected',
    denied(await req('trips/nope/reads/d1', {as: 'driverU', body: {at: SV, version: 7000}})));

  // The scope rule. A driver cannot open an unpublished day at all, so publication is itself the
  // first read opportunity and there is nothing to acknowledge — asserted here because the client
  // relies on it rather than re-checking.
  check('a trip that was never changed after publication accepts no receipt',
    denied(await req('trips/t6/reads/d1', {as: 'driverU', body: {at: SV, version: 0}})));

  // First-read-wins. Without the strict `<` in the write rule, re-opening the app tomorrow would
  // silently move "Læst kl. 08:12" forward to whenever the driver last had the row on screen.
  const firstAt = (await req('trips/t5/reads/d1/at', {method: 'GET', as: 'adminU'})).json;
  check('re-recording the same version is rejected',
    denied(await req('trips/t5/reads/d1', {as: 'driverU', body: {at: SV, version: 7000}})));
  check('the original read timestamp is left untouched',
    (await req('trips/t5/reads/d1/at', {method: 'GET', as: 'adminU'})).json === firstAt);

  // The accepted disclosure, pinned as a contract rather than left as an accident: receipts live
  // on the trip, /trips is readable by every driver, and read access cascades.
  check('a driver can read a colleague s receipt',
    allowed(await req('trips/t5/reads/d1', {method: 'GET', as: 'otherU'})));

  // dismissed is admin-only, and has to be a .validate to be so — the admin's container-level
  // .write on /trips cascades down here and cannot be revoked by a stricter rule beneath it.
  check('a driver cannot mark their own receipt as office-dismissed',
    denied(await req('trips/t5/reads/d2', {as: 'otherU', body: {at: SV, version: 7000, dismissed: true}})));

  check('an admin can write a dismissal receipt for a driver who has not read it',
    allowed(await req('trips/t5/reads/d2', {as: 'adminU', body: {at: SV, version: 7000, dismissed: true}})));

  // The admin's cascade bypasses the drivers' monotonic rule, which is what lets a dismissal
  // overwrite — and exactly why dismissTripReadWarning writes only for outstanding drivers.
  check('an admin can overwrite an existing receipt',
    allowed(await req('trips/t5/reads/d1', {as: 'adminU', body: {at: SV, version: 7000, dismissed: true}})));

  // A later edit re-stamps modified, stranding every receipt — genuine and dismissed alike — so
  // the warning comes back with no separate flag to reset.
  await req('trips/t5/modified', {as: 'adminU', body: 8000});
  check('a driver can record again once the trip has been changed afresh',
    allowed(await req('trips/t5/reads/d1', {as: 'driverU', body: {at: SV, version: 8000}})));
}

async function tripWriteContract() {
  console.log("\nTrip writes — DataStore's multi-path update contract:");
  await req('trips/t4', {as: 'owner', body: {start: 5000, name: 'Bytur', drivers: ['d1'], vehicles: []}});
  await req('tripOffice/t4', {as: 'owner', body: {officeDescription: 'gammel', labels: ['a']}});
  await req('trips/t4/reports/d1', {as: 'driverU', body: VALID_REPORT});
  await req('trips/t4/modified', {as: 'owner', body: 7000});
  await req('trips/t4/reads/d1', {as: 'driverU', body: {at: {'.sv': 'timestamp'}, version: 7000}});

  // updateTrip writes per-field paths rather than replacing /trips/$key wholesale. Replacing the
  // node would delete `reports`, silently destroying work drivers had already filed.
  const edited = await req('', {method: 'PATCH', as: 'adminU', body: {
    '/trips/t4/name': 'Bytur (rettet)',
    '/tripOffice/t4': {officeDescription: 'ny', labels: ['a', 'b']},
  }});
  check('an admin can edit a trip and its office half together', allowed(edited));

  const afterEdit = await req('trips/t4', {method: 'GET', as: 'adminU'});
  check('editing a trip preserves the driver-written report', !!afterEdit.json?.reports?.d1, JSON.stringify(afterEdit.json));
  check('editing a trip preserves the driver-written read receipt', !!afterEdit.json?.reads?.d1, JSON.stringify(afterEdit.json));
  check('the edit applied', afterEdit.json?.name === 'Bytur (rettet)');

  // Moving a trip to another day writes only the trip. Nothing in the office record depends on
  // the dates, so it is deliberately not rewritten — which is the whole benefit of it carrying
  // no sort key.
  await req('trips/t4/start', {as: 'adminU', body: 999000});
  const officeAfterMove = await req('tripOffice/t4', {method: 'GET', as: 'adminU'});
  check('moving a trip to another day leaves its office record intact and correct',
    officeAfterMove.json?.officeDescription === 'ny', JSON.stringify(officeAfterMove.json));

  // removeTrip/removeTrips delete both halves, so no orphaned office record survives to
  // re-attach itself to a later trip that reused the key.
  await req('', {method: 'PATCH', as: 'adminU', body: {'/trips/t4': null, '/tripOffice/t4': null}});
  check('deleting a trip removes the trip', (await req('trips/t4', {method: 'GET', as: 'adminU'})).json === null);
  check('deleting a trip removes its office half', (await req('tripOffice/t4', {method: 'GET', as: 'adminU'})).json === null);
  // No companion delete path exists for receipts, and none is needed — that is the point of
  // keeping them on the trip rather than in a side table the retention cleanup could forget.
  check('deleting a trip takes its read receipts with it',
    (await req('trips/t4/reads', {method: 'GET', as: 'adminU'})).json === null);
}

run(async () => {
  await seed();
  await tripReportRules();
  await clockRecordRules();
  await tripOfficeRules();
  await tripReadRules();
  await tripWriteContract();
});
