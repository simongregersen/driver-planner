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

async function tripWriteContract() {
  console.log("\nTrip writes — DataStore's multi-path update contract:");
  await req('trips/t4', {as: 'owner', body: {start: 5000, name: 'Bytur', drivers: ['d1'], vehicles: []}});
  await req('tripOffice/t4', {as: 'owner', body: {officeDescription: 'gammel', labels: ['a']}});
  await req('trips/t4/reports/d1', {as: 'driverU', body: VALID_REPORT});

  // updateTrip writes per-field paths rather than replacing /trips/$key wholesale. Replacing the
  // node would delete `reports`, silently destroying work drivers had already filed.
  const edited = await req('', {method: 'PATCH', as: 'adminU', body: {
    '/trips/t4/name': 'Bytur (rettet)',
    '/tripOffice/t4': {officeDescription: 'ny', labels: ['a', 'b']},
  }});
  check('an admin can edit a trip and its office half together', allowed(edited));

  const afterEdit = await req('trips/t4', {method: 'GET', as: 'adminU'});
  check('editing a trip preserves the driver-written report', !!afterEdit.json?.reports?.d1, JSON.stringify(afterEdit.json));
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
}

run(async () => {
  await seed();
  await tripReportRules();
  await clockRecordRules();
  await tripOfficeRules();
  await tripWriteContract();
});
