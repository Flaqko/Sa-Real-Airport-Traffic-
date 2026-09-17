# Real Airport Traffic Redux v1.0

A clean CLEO Redux remake of the old GTA San Andreas airport-traffic concept. AT-400 flights use the game's vanilla recorded flight paths and run on a fixed in-game timetable, so aircraft can cross San Andreas whether CJ is watching the airport or not.

## Requirements

- Grand Theft Auto: San Andreas Classic (1.0)
- CLEO Redux

## Installation

1. Remove older `RealAirportTrafficRedux` test builds from your `CLEO` folder.
2. Copy `RealAirportTrafficRedux_v1.0.js` into your GTA San Andreas `CLEO` folder.
3. Start the game.

No extra flight-recording files are required. The mod uses recordings already present in GTA San Andreas.

## Daily Flight Schedule

| GTA Time | Route | Recording |
|---|---|---:|
| 00:00 | Las Venturas → Los Santos | 48 |
| 09:00 | Los Santos → Las Venturas | 46 |
| 12:00 | Las Venturas → San Fierro | 43 |
| 15:00 | San Fierro → Los Santos | 49 |
| 18:00 | Los Santos → San Fierro | 42 |
| 21:00 | San Fierro → Las Venturas | 44 |

Each flight gets a 15-minute in-game departure window. If its origin airport is temporarily occupied by another managed AT-400, it waits for the runway area to clear. If the whole window is missed, that departure is skipped until the next in-game day.

### About the 18:00 LS → SF route

Recording 42 takes a wide, unusual path that swings far toward the Las Venturas side of the map before eventually turning west and landing at San Fierro. That is the vanilla recorded path, not a route-label mistake.

## Features

- Fixed GTA-clock flight schedule.
- Flights operate globally instead of spawning only because CJ approaches an airport.
- Multiple AT-400 flights can exist at the same time.
- Only physical airport/runway occupancy blocks another departure.
- One managed AT-400 per airport zone at a time.
- Vanilla pilots and copilots.
- Automatic landing-gear handling.
- Nearby completed flights let pilot and copilot exit before the parked plane is released.
- Off-screen completed flights clean up quietly.
- Destroyed aircraft clean up only their own flight state and do not affect other active flights.
- No `CLEAR_AREA` calls.
- No player-distance cleanup while a scheduled flight is in progress.

## Optional Plane Blips

Plane blips are disabled for normal gameplay.

To re-enable the testing blips, open `RealAirportTrafficRedux_v1.0.js` and change:

```js
SHOW_PLANE_BLIPS: false,
```

to:

```js
SHOW_PLANE_BLIPS: true,
```

`DEBUG` is also disabled by default.

## Behavior Notes

- Scheduled flights are world events. CJ does not need to be near the origin airport for a flight to depart.
- If CJ happens to be under a route, the plane can naturally fly overhead.
- A flight will not be cancelled merely because CJ travels to the opposite side of the map.
- During missions, interiors, or cutscenes, a scheduled departure waits only inside its normal departure window rather than spawning late at an unrelated time.
- If CJ is near the destination when playback finishes, the crew exits normally. If the destination is far off-screen, the completed flight is cleaned up quietly.

## Credits

- **Flaqko** — CLEO Redux rewrite and release.
- Concept inspired by the legacy `PLANEZ` / RealAero airport-traffic script.
- Rockstar Games — original GTA San Andreas AT-400 flight recordings.

## License

MIT License. See `LICENSE.txt`.
