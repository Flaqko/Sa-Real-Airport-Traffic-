# Changelog

## v1.0 — Initial Release

- Promoted the tested multi-flight schedule system to release status.
- Uses all six normal vanilla AT-400 intercity recordings.
- Added fixed daily GTA-clock departures.
- Added simultaneous-flight support.
- Added airport/runway occupancy separation instead of a global one-plane lock.
- Added safe destroyed-aircraft cleanup.
- Added landing-gear handling.
- Added nearby arrival crew-exit cleanup.
- Added quiet off-screen arrival cleanup.
- Removed the old `player.canStartMission()` safety check that incorrectly deleted valid flights.
- Removed test-only periodic position logging.
- Plane blips now default OFF for release.
- Retains optional blips and debug logging as source-level toggles.
- No `CLEAR_AREA` usage.
