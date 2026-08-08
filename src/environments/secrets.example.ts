// Copy this file to secrets.ts (gitignored) and fill in a real value.
// Fine-grained GitHub PAT scoped ONLY to this repo, with "Actions: read and write"
// permission and nothing else — it's used purely to trigger the notification-poller
// workflow immediately after an admin edits a public trip. It ships inside the
// browser bundle, so its scope must stay minimal: worst case someone extracts it and
// triggers extra workflow runs, but it can't read/write Firebase data.
export const secrets = {
  githubDispatchToken: '',
};
