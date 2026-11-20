# Fixtures on GitHub, not in the app

Fixture profiles kept in this folder are **not bundled into the app** and
never auto-load — `electron-builder.yml` excludes this folder from the
packaged app, and the main process never reads it.

They are here so they can be shared from the repository and imported by
hand: open the profile editor (Patch → Profile editor → Import JSON / OFL)
and pick the file. It lands in the current show as a custom fixture
profile, not in the shipped library.

## What's here

- `event-lighting/ep4.json` — Jake's Event Lighting 4x1x30 LED bar (EP4),
  17-channel mode, authored from the manual. It is not in the Open Fixture
  Library, so it cannot come back through a zip upload — keep this file
  as the source of truth for it.
