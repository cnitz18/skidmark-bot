# Skidmark Bot - AI Coding Instructions

## Architecture Overview

This is a Discord bot for a sim racing league that uses **Google Gemini AI** with function calling to query race data. The bot persona is "Chorley" (a grumpy James Hunt impersonator).

**Core Components:**
- [discordbot.js](../discordbot.js) - Entry point, initializes SkidmarkBot + APIController
- [SkidmarkBot.js](../src/classes/SkidmarkBot.js) - Discord client + Gemini AI chat with function calling loop
- [DatabaseController.js](../src/classes/DatabaseController.js) - PostgreSQL queries for race/league data
- [GeminiFunctions.js](../src/classes/GeminiFunctions.js) - Function declarations (tools) that Gemini can invoke
- [APIController.js](../src/classes/APIController.js) - Express API for webhooks and admin console

**Data Flow:** Discord message → SkidmarkBot → Gemini AI → function calls → DatabaseController → PostgreSQL → response back to Gemini → Discord reply

## Critical Patterns

### WeakMap Private Fields
All classes use a module-scoped WeakMap pattern for private state:
```javascript
module.exports = (() => {
    _ = new WeakMap();
    class MyClass {
        constructor() {
            _.set(this, { privateField: value });
        }
        method() {
            return _.get(this).privateField;
        }
    }
    return MyClass;
})();
```

### Lap Time Formatting (CRITICAL)
All database times are stored in **milliseconds**. Never show raw ms values to users.
- Use `formatLapTime(ms)` from [formatters.js](../src/utils/formatters.js) to convert (e.g., `83456` → `"1:23.456"`)
- Use `preFormatRaceData(obj)` to recursively add `_formatted` suffixes to time fields before sending to Gemini
- Fields auto-formatted: `FastestLapTime`, `TotalTime`, `Gap`, `BestLapTime`, `LastLapTime`, `AverageLapTime`

### Adding New Gemini Functions
1. Add function declaration in [GeminiFunctions.js](../src/classes/GeminiFunctions.js) `functionDeclarations` array
2. Add the handler case in `SkidmarkBot.executeFunction()` switch statement
3. Implement the database query in [DatabaseController.js](../src/classes/DatabaseController.js)

### Reference Data Lookup
Track/vehicle/class IDs from the database are resolved via [ReferenceData.js](../src/classes/ReferenceData.js) which loads from JSON files in `src/data/`. Use `refData.getTrackName(id)`, `refData.getVehicleName(id)`, `refData.getVehicleClassName(id)`.

## Environment & Running

**Hosting:** Railway (both bot and the Django API it connects to)

**Required env vars:** See [.env.example](../.env.example) for all variables.

```bash
npm run dev     # Development with nodemon (uses NODE_ENV=dev)
npm start       # Production
```

**Testing:** Run individual test files directly: `node test_database.js`, `node test_formatters.js`, etc.

## Channel Routing (Important)

By default, **all Discord channels route to the production bot instance**. The `ALLOWED_DEV_CHANNELS` env var is a comma-separated list of channel IDs that the dev instance will respond to. This prevents dev/prod bots from both responding in the same channel.

- `NODE_ENV=dev` → bot responds only in channels listed in `ALLOWED_DEV_CHANNELS`
- `NODE_ENV=production` → bot responds in all channels *except* those in `ALLOWED_DEV_CHANNELS`

## Key Conventions

- **No TypeScript** - Pure ES6 JavaScript with CommonJS modules
- **Async/await** throughout for database and API calls
- **Parameterized queries** only (never string interpolation in SQL)
- Bot only responds when mentioned (`@bot`) in its allowed channels
- Function calling loops have a `maxLoops = 10` safety limit in `processGeminiResponse()`
