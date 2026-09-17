// Real Airport Traffic Redux v1.0
// GTA San Andreas Classic + CLEO Redux (JavaScript)
// Clean rewrite inspired by the old PLANEZ / RealAero script.

const CONFIG = {
    DEBUG: false,
    SHOW_PLANE_BLIPS: false,
    AIRPORT_RADIUS: 1200.0,
    SCHEDULE_GRACE_MINUTES: 15,
    AIRPORT_OCCUPANCY_RADIUS: 1150.0,
    MIN_SPAWN_SEPARATION: 900.0,
    ARRIVAL_CREW_EXIT_RADIUS: 1400.0,
    MODEL_LOAD_TIMEOUT_MS: 8000,
    RECORDING_LOAD_TIMEOUT_MS: 8000,
    ARRIVAL_EXIT_TIMEOUT_MS: 8000,
    GEAR_UP_MIN_ALTITUDE: 55.0,
    GEAR_UP_MIN_DEPARTURE_DISTANCE: 550.0,
    GEAR_DOWN_DEST_DISTANCE: 1900.0,
    GEAR_DOWN_MAX_ALTITUDE_ABOVE_DEST: 220.0,
};

const player = new Player(0);
const AT400 = Streaming.GetModelByName("AT400");
const PILOT = Streaming.GetModelByName("WMYPLT");

// CLEO Redux enums are not globals in JavaScript. Use their numeric SA values
// directly so this standalone script has no .config/enums import dependency.
const PED_TYPE_CIV_MALE = 4;
const SEAT_FRONT_RIGHT = 0;

// Vanilla airport car recordings used by the original mod.
// Recording 41 is intentionally omitted until the six normal routes are tested.
const ROUTES = [
    {
        name: "LS -> SF",
        recording: 42,
        origin: "LS",
        destination: "SF",
        spawn: { x: 1577.298, y: -2493.749, z: 13.5895, heading: 270.0 },
        dest: { x: -1541.494, y: -47.5275, z: 13.6904 },
    },
    {
        name: "LV -> SF",
        recording: 43,
        origin: "LV",
        destination: "SF",
        spawn: { x: 1479.46, y: 1641.41, z: 10.4851, heading: 180.0 },
        dest: { x: -1541.494, y: -47.5275, z: 13.6904 },
    },
    {
        name: "SF -> LV",
        recording: 44,
        origin: "SF",
        destination: "LV",
        spawn: { x: -1586.67, y: -93.33, z: 44.0, heading: 314.0 },
        dest: { x: 1479.942, y: 1697.293, z: 10.3581 },
    },
    {
        name: "LS -> LV",
        recording: 46,
        origin: "LS",
        destination: "LV",
        spawn: { x: 1577.298, y: -2493.749, z: 13.5895, heading: 270.0 },
        dest: { x: 1479.942, y: 1697.293, z: 10.3581 },
    },
    {
        name: "LV -> LS",
        recording: 48,
        origin: "LV",
        destination: "LS",
        spawn: { x: 1479.46, y: 1641.41, z: 10.4851, heading: 180.0 },
        dest: { x: 1994.525, y: -2487.4561, z: 13.0822 },
    },
    {
        name: "SF -> LS",
        recording: 49,
        origin: "SF",
        destination: "LS",
        spawn: { x: -1626.0, y: -137.3, z: 13.0, heading: 314.0 },
        dest: { x: 1994.525, y: -2487.4561, z: 13.0822 },
    },
];

// Fixed daily departures. These use GTA's in-game clock, not real time.
// A flight gets one 15-minute in-game departure/hold window each day. If the window
// is missed (mission/interior/cutscene, or its origin runway staying physically occupied),
// that departure is skipped until the next in-game day instead of spawning late.
const FLIGHT_SCHEDULE = [
    { hour: 0, minute: 0, recording: 48 },  // LV -> LS
    { hour: 9, minute: 0, recording: 46 },  // LS -> LV
    { hour: 12, minute: 0, recording: 43 }, // LV -> SF
    { hour: 15, minute: 0, recording: 49 }, // SF -> LS
    { hour: 18, minute: 0, recording: 42 }, // LS -> SF
    { hour: 21, minute: 0, recording: 44 }, // SF -> LV
];

const AIRPORTS = {
    LS: { x: 1685.0, y: -2440.0, z: 13.0 },
    SF: { x: -1450.0, y: -110.0, z: 14.0 },
    LV: { x: 1475.0, y: 1600.0, z: 10.5 },
};

const AIRPORT_NAMES = {
    LS: "Los Santos Airport",
    SF: "San Fierro Airport",
    LV: "Las Venturas Airport",
};

let activeFlights = [];
let nextFlightId = 1;
let lastNearbyAirport = null;
let scheduleDay = null;
let scheduleHandled = new Array(FLIGHT_SCHEDULE.length).fill(false);
let scheduleWaitLogged = new Array(FLIGHT_SCHEDULE.length).fill(false);
let clockReadErrorLogged = false;

function info(message) {
    log(`[RealAirportTraffic] ${message}`);
}

function debug(message) {
    if (CONFIG.DEBUG) info(message);
}

function dist2D(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
}


function getNearbyAirport(pos) {
    const keys = ["LS", "SF", "LV"];
    for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        if (dist2D(pos, AIRPORTS[key]) <= CONFIG.AIRPORT_RADIUS) return key;
    }
    return null;
}

function getFlightPlanePosition(flight) {
    try {
        if (!flight || !flight.plane || !Car.DoesExist(flight.plane) || Car.IsDead(flight.plane)) return null;
        return flight.plane.getCoordinates();
    } catch (e) {
        return null;
    }
}

function isAirportOccupied(airportKey) {
    const airportPos = AIRPORTS[airportKey];
    for (let i = 0; i < activeFlights.length; i++) {
        const pos = getFlightPlanePosition(activeFlights[i]);
        if (pos && dist2D(pos, airportPos) <= CONFIG.AIRPORT_OCCUPANCY_RADIUS) return true;
    }
    return false;
}

function isSpawnAreaClear(route) {
    for (let i = 0; i < activeFlights.length; i++) {
        const pos = getFlightPlanePosition(activeFlights[i]);
        if (pos && dist2D(pos, route.spawn) < CONFIG.MIN_SPAWN_SEPARATION) return false;
    }
    return true;
}

function getWorldUnsafeReason() {
    if (!player.isPlaying()) return "player not playing";
    if (ONMISSION) return "ONMISSION=true";

    const areaVisible = Streaming.GetAreaVisible();
    if (areaVisible !== 0) return `interior/area visible=${areaVisible}`;
    if (!Cutscene.HasFinished()) return "cutscene active";
    return null;
}

function isWorldSafeForTraffic() {
    return getWorldUnsafeReason() === null;
}

function waitForModel(modelId) {
    if (Streaming.HasModelLoaded(modelId)) return true;
    Streaming.RequestModel(modelId);

    let elapsed = 0;
    while (!Streaming.HasModelLoaded(modelId) && elapsed < CONFIG.MODEL_LOAD_TIMEOUT_MS) {
        wait(50);
        elapsed += 50;
    }
    return Streaming.HasModelLoaded(modelId);
}

function waitForRecording(pathId) {
    Streaming.RequestCarRecording(pathId);

    let elapsed = 0;
    while (!Streaming.HasCarRecordingBeenLoaded(pathId) && elapsed < CONFIG.RECORDING_LOAD_TIMEOUT_MS) {
        wait(50);
        elapsed += 50;
    }
    return Streaming.HasCarRecordingBeenLoaded(pathId);
}

function createPlaneBlip(plane) {
    if (!CONFIG.SHOW_PLANE_BLIPS) return 0;
    try {
        // Native command returns the blip handle. A marker API mismatch must
        // never stop the actual flight.
        const blip = native("ADD_BLIP_FOR_CAR", plane);
        if (typeof blip === "number" && blip !== 0) {
            try {
                native("CHANGE_BLIP_DISPLAY", blip, 2);
            } catch (e) {
                info(`plane blip display warning: ${e}`);
            }
            debug(`plane blip attached to AT-400 (handle ${blip})`);
            return blip;
        }
        debug(`plane blip returned invalid handle: ${blip}`);
    } catch (e) {
        info(`plane blip creation failed: ${e}`);
    }
    return 0;
}

function removePlaneBlip(blip) {
    if (!blip) return;
    try {
        native("REMOVE_BLIP", blip);
        debug(`plane blip removed (handle ${blip})`);
    } catch (e) {
        info(`plane blip removal warning: ${e}`);
    }
}

function removeFlightFromPool(flight) {
    const index = activeFlights.indexOf(flight);
    if (index >= 0) activeFlights.splice(index, 1);
}

function cleanupFlight(flight, forceDelete, reason) {
    if (!flight) return;

    info(`#${flight.id} ${flight.route.name}: cleanup: ${reason || "unspecified"}; forceDelete=${forceDelete}`);
    removePlaneBlip(flight.blip);
    flight.blip = 0;

    try {
        if (flight.pilot && Char.DoesExist(flight.pilot)) flight.pilot.markAsNoLongerNeeded();
    } catch (e) {
        info(`#${flight.id} pilot cleanup warning: ${e}`);
    }

    try {
        if (flight.copilot && Char.DoesExist(flight.copilot)) flight.copilot.markAsNoLongerNeeded();
    } catch (e) {
        info(`#${flight.id} copilot cleanup warning: ${e}`);
    }

    try {
        if (flight.plane && Car.DoesExist(flight.plane)) {
            if (flight.plane.isPlaybackGoingOn()) flight.plane.stopPlayback();
            if (forceDelete) flight.plane.delete();
            else flight.plane.markAsNoLongerNeeded();
        }
    } catch (e) {
        info(`#${flight.id} plane cleanup warning: ${e}`);
    }

    try {
        Streaming.RemoveCarRecording(flight.route.recording);
    } catch (e) {
        info(`#${flight.id} recording cleanup warning: ${e}`);
    }

    removeFlightFromPool(flight);
}

function isCrewMemberStillInPlane(flight, crew) {
    if (!crew || !Char.DoesExist(crew) || Char.IsDead(crew)) return false;
    try {
        return crew.isInCar(flight.plane);
    } catch (e) {
        info(`#${flight.id} ${flight.route.name}: crew in-car check warning: ${e}`);
        return false;
    }
}

function beginArrivalShutdown(flight, reason) {
    if (!flight || flight.phase === "arrival_exit") return;

    info(`#${flight.id} ${flight.route.name}: arrival shutdown: ${reason}; asking pilot + copilot to exit`);
    removePlaneBlip(flight.blip);
    flight.blip = 0;

    try {
        if (flight.plane && Car.DoesExist(flight.plane) && flight.plane.isPlaybackGoingOn()) {
            flight.plane.stopPlayback();
        }
    } catch (e) {
        info(`#${flight.id} ${flight.route.name}: stop playback warning during arrival shutdown: ${e}`);
    }

    flight.phase = "arrival_exit";
    flight.arrivalExitElapsedMs = 0;

    try {
        if (flight.pilot && Char.DoesExist(flight.pilot) && !Char.IsDead(flight.pilot)) {
            Task.LeaveCar(flight.pilot, flight.plane);
        }
    } catch (e) {
        info(`#${flight.id} ${flight.route.name}: pilot leave-car task warning: ${e}`);
    }

    try {
        if (flight.copilot && Char.DoesExist(flight.copilot) && !Char.IsDead(flight.copilot)) {
            Task.LeaveCar(flight.copilot, flight.plane);
        }
    } catch (e) {
        info(`#${flight.id} ${flight.route.name}: copilot leave-car task warning: ${e}`);
    }
}

function updateArrivalShutdown(flight) {
    if (!flight || flight.phase !== "arrival_exit") return;

    if (!Car.DoesExist(flight.plane) || Car.IsDead(flight.plane)) {
        cleanupFlight(flight, true, "plane missing or dead during arrival shutdown");
        return;
    }

    const pilotInPlane = isCrewMemberStillInPlane(flight, flight.pilot);
    const copilotInPlane = isCrewMemberStillInPlane(flight, flight.copilot);

    if (!pilotInPlane && !copilotInPlane) {
        info(`#${flight.id} ${flight.route.name}: pilot + copilot exited; releasing parked AT-400`);
        cleanupFlight(flight, false, "arrival crew exited normally");
        return;
    }

    flight.arrivalExitElapsedMs += 250;
    if (flight.arrivalExitElapsedMs < CONFIG.ARRIVAL_EXIT_TIMEOUT_MS) return;

    info(`#${flight.id} ${flight.route.name}: crew exit timeout; forcing any remaining crew out before release`);

    try {
        if (pilotInPlane && flight.pilot && Char.DoesExist(flight.pilot)) {
            flight.pilot.removeFromCarMaintainPosition(flight.plane);
        }
    } catch (e) {
        info(`#${flight.id} ${flight.route.name}: pilot timeout removal warning: ${e}`);
    }

    try {
        if (copilotInPlane && flight.copilot && Char.DoesExist(flight.copilot)) {
            flight.copilot.removeFromCarMaintainPosition(flight.plane);
        }
    } catch (e) {
        info(`#${flight.id} ${flight.route.name}: copilot timeout removal warning: ${e}`);
    }

    cleanupFlight(flight, false, "arrival crew exit timeout fallback completed");
}

function spawnFlight(route) {
    info(`spawning ${route.name} using recording ${route.recording}`);

    if (!waitForModel(AT400)) {
        info("AT-400 failed to stream in");
        return null;
    }

    if (!waitForModel(PILOT)) {
        info("pilot model failed to stream in");
        Streaming.MarkModelAsNoLongerNeeded(AT400);
        return null;
    }

    if (!waitForRecording(route.recording)) {
        info(`recording ${route.recording} failed to load`);
        Streaming.MarkModelAsNoLongerNeeded(AT400);
        Streaming.MarkModelAsNoLongerNeeded(PILOT);
        return null;
    }

    info(`${route.name}: recording ${route.recording} loaded`);

    const plane = Plane.Create(AT400, route.spawn.x, route.spawn.y, route.spawn.z);
    plane.setHeading(route.spawn.heading);
    plane.setUndercarriageUp(false);

    const pilot = Char.CreateInsideCar(plane, PED_TYPE_CIV_MALE, PILOT);
    info(`${route.name}: pilot created`);

    const copilot = Char.CreateAsPassenger(plane, PED_TYPE_CIV_MALE, PILOT, SEAT_FRONT_RIGHT);
    info(`${route.name}: copilot created`);

    plane.startPlayback(route.recording);
    info(`${route.name}: playback started`);

    Streaming.MarkModelAsNoLongerNeeded(AT400);
    Streaming.MarkModelAsNoLongerNeeded(PILOT);

    const blip = createPlaneBlip(plane);
    const flight = {
        id: nextFlightId++,
        route,
        plane,
        pilot,
        copilot,
        blip,
        gearUp: false,
        gearDownForLanding: false,
        phase: "flight",
        arrivalExitElapsedMs: 0,
    };
    activeFlights.push(flight);

    info(`spawned #${flight.id} ${route.name} successfully at (${route.spawn.x.toFixed(1)}, ${route.spawn.y.toFixed(1)}, ${route.spawn.z.toFixed(1)}); activeFlights=${activeFlights.length}`);
    return flight;
}

function updateActiveFlight(flight, playerPos) {
    if (!flight) return;

    if (!Car.DoesExist(flight.plane) || Car.IsDead(flight.plane)) {
        cleanupFlight(flight, true, "plane missing or dead");
        return;
    }

    if (flight.phase === "arrival_exit") {
        updateArrivalShutdown(flight);
        return;
    }

    if (!flight.plane.isPlaybackGoingOn()) {
        const destinationDistanceFromCJ = dist2D(playerPos, flight.route.dest);
        const safeForVisibleArrival = isWorldSafeForTraffic();

        if (destinationDistanceFromCJ <= CONFIG.ARRIVAL_CREW_EXIT_RADIUS && safeForVisibleArrival) {
            beginArrivalShutdown(flight, "recorded playback ended or stopped near CJ");
        } else {
            cleanupFlight(
                flight,
                true,
                `arrival completed off-screen; CJ destination distance=${destinationDistanceFromCJ.toFixed(1)}m`
            );
        }
        return;
    }

    const planePos = flight.plane.getCoordinates();

    const departureGround = flight.route.spawn.z;
    const departureDistance = dist2D(planePos, flight.route.spawn);
    const destinationDistance = dist2D(planePos, flight.route.dest);

    if (!flight.gearUp &&
        planePos.z >= departureGround + CONFIG.GEAR_UP_MIN_ALTITUDE &&
        departureDistance >= CONFIG.GEAR_UP_MIN_DEPARTURE_DISTANCE) {
        flight.plane.setUndercarriageUp(true);
        flight.gearUp = true;
        info(`#${flight.id} ${flight.route.name}: gear up at altitude ${planePos.z.toFixed(1)}`);
    }

    if (flight.gearUp && !flight.gearDownForLanding &&
        destinationDistance <= CONFIG.GEAR_DOWN_DEST_DISTANCE &&
        planePos.z <= flight.route.dest.z + CONFIG.GEAR_DOWN_MAX_ALTITUDE_ABOVE_DEST) {
        flight.plane.setUndercarriageUp(false);
        flight.gearDownForLanding = true;
        info(`#${flight.id} ${flight.route.name}: gear down at destination distance ${destinationDistance.toFixed(1)}m`);
    }
}

function routeByRecording(recording) {
    for (let i = 0; i < ROUTES.length; i++) {
        if (ROUTES[i].recording === recording) return ROUTES[i];
    }
    return null;
}

function readGameClock() {
    try {
        const time = native("GET_TIME_OF_DAY");
        const day = native("GET_CURRENT_DAY_OF_WEEK");
        const hours = time && typeof time === "object" ? Number(time.hours) : NaN;
        const minutes = time && typeof time === "object" ? Number(time.minutes) : NaN;

        if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(Number(day))) {
            if (!clockReadErrorLogged) {
                info(`schedule clock read failed: time=${JSON.stringify(time)} day=${day}`);
                clockReadErrorLogged = true;
            }
            return null;
        }

        clockReadErrorLogged = false;
        return {
            day: Number(day),
            hours,
            minutes,
            minuteOfDay: hours * 60 + minutes,
        };
    } catch (e) {
        if (!clockReadErrorLogged) {
            info(`schedule clock read exception: ${e}`);
            clockReadErrorLogged = true;
        }
        return null;
    }
}

function formatClock(hours, minutes) {
    const hh = hours < 10 ? `0${hours}` : `${hours}`;
    const mm = minutes < 10 ? `0${minutes}` : `${minutes}`;
    return `${hh}:${mm}`;
}

function resetDailySchedule(clockState, initial) {
    scheduleDay = clockState.day;
    scheduleWaitLogged = new Array(FLIGHT_SCHEDULE.length).fill(false);

    const now = clockState.minuteOfDay;
    scheduleHandled = FLIGHT_SCHEDULE.map(entry => {
        const departure = entry.hour * 60 + entry.minute;
        return now > departure + CONFIG.SCHEDULE_GRACE_MINUTES;
    });

    info(
        `${initial ? "schedule initialized" : "new in-game day detected"}: ` +
        `day=${clockState.day} time=${formatClock(clockState.hours, clockState.minutes)}`
    );
}

function processFlightSchedule() {
    const clockState = readGameClock();
    if (!clockState) return;

    if (scheduleDay === null) {
        resetDailySchedule(clockState, true);
    } else if (clockState.day !== scheduleDay) {
        resetDailySchedule(clockState, false);
    }

    for (let i = 0; i < FLIGHT_SCHEDULE.length; i++) {
        if (scheduleHandled[i]) continue;

        const entry = FLIGHT_SCHEDULE[i];
        const route = routeByRecording(entry.recording);
        if (!route) {
            scheduleHandled[i] = true;
            info(`schedule entry ${i} references missing recording ${entry.recording}; skipped for today`);
            continue;
        }

        const departure = entry.hour * 60 + entry.minute;
        const windowEnd = departure + CONFIG.SCHEDULE_GRACE_MINUTES;
        const now = clockState.minuteOfDay;

        if (now < departure) continue;

        if (now > windowEnd) {
            scheduleHandled[i] = true;
            info(
                `missed ${formatClock(entry.hour, entry.minute)} ${route.name} departure window; ` +
                `skipped until next in-game day`
            );
            continue;
        }

        const unsafeReason = getWorldUnsafeReason();
        if (unsafeReason !== null) {
            if (!scheduleWaitLogged[i]) {
                info(`${formatClock(entry.hour, entry.minute)} ${route.name} holding inside departure window: ${unsafeReason}`);
                scheduleWaitLogged[i] = true;
            }
            continue;
        }

        // Multiple flights may coexist. Only the physical runway/airport area
        // at this flight's origin is protected from another active AT-400.
        if (isAirportOccupied(route.origin) || !isSpawnAreaClear(route)) {
            if (!scheduleWaitLogged[i]) {
                info(`${formatClock(entry.hour, entry.minute)} ${route.name} holding: ${AIRPORT_NAMES[route.origin]} runway area occupied by another active flight`);
                scheduleWaitLogged[i] = true;
            }
            continue;
        }

        scheduleHandled[i] = true;
        info(`scheduled departure ${formatClock(entry.hour, entry.minute)}: ${route.name}`);
        if (!spawnFlight(route)) {
            info(`${route.name}: scheduled spawn failed; no retry until next in-game day`);
        }
    }
}

info(`v1.0 loaded - fixed GTA-clock schedule, multi-flight airport separation, arrival cleanup, plane blips ${CONFIG.SHOW_PLANE_BLIPS ? "ON" : "OFF"}`);

while (true) {
    wait(250);
    if (!player.isPlaying()) {
        const flights = activeFlights.slice();
        for (let i = 0; i < flights.length; i++) cleanupFlight(flights[i], true, "player stopped playing");
        continue;
    }

    const playerPos = player.getChar().getCoordinates();
    const airport = getNearbyAirport(playerPos);

    if (airport !== lastNearbyAirport) {
        if (airport) info(`CJ entered ${AIRPORT_NAMES[airport]}`);
        else if (lastNearbyAirport) info(`CJ left ${AIRPORT_NAMES[lastNearbyAirport]}`);
        lastNearbyAirport = airport;
    }

    // Iterate backwards because a flight may remove itself from the pool during cleanup.
    for (let i = activeFlights.length - 1; i >= 0; i--) {
        updateActiveFlight(activeFlights[i], playerPos);
    }

    processFlightSchedule();
}
