/**
 * GeminiFunctions - Defines the function declarations (tools) that Gemini can call
 * to interact with the racing league database.
 */

const functionDeclarations = [
    {
        name: "getRecentRaces",
        description: "Get the most recent races from the league. Use this when users ask about recent races, the last race, or what happened lately.",
        parameters: {
            type: "object",
            properties: {
                limit: {
                    type: "number",
                    description: "Number of races to return (default 5, max 20)"
                },
                leagueId: {
                    type: "number",
                    description: "Optional: Filter by specific league ID"
                }
            },
            required: []
        }
    },
    {
        name: "getRaceResults",
        description: "Get detailed results for a specific race including finishing positions, lap times, and race information. Use this when users ask about a specific race's results or want details about who won a particular race.",
        parameters: {
            type: "object",
            properties: {
                raceId: {
                    type: "number",
                    description: "The race ID to get results for"
                }
            },
            required: ["raceId"]
        }
    },
    {
        name: "getDriverStats",
        description: "Get comprehensive statistics for a specific driver including wins, podiums, fastest laps, and average position. Use this when users ask about a driver's performance or career stats.",
        parameters: {
            type: "object",
            properties: {
                driverName: {
                    type: "string",
                    description: "The driver's name to search for (partial match is ok)"
                },
                leagueId: {
                    type: "number",
                    description: "Optional: Filter stats to a specific league/championship"
                }
            },
            required: ["driverName"]
        }
    },
    {
        name: "getLeagueStandings",
        description: "Get the current championship standings for a specific league including positions, points, wins, poles, and podiums. Use this when users ask about championship standings, who's leading, or league positions.",
        parameters: {
            type: "object",
            properties: {
                leagueId: {
                    type: "number",
                    description: "The league/championship ID"
                }
            },
            required: ["leagueId"]
        }
    },
    {
        name: "getActiveLeagues",
        description: "Get all currently active (ongoing) championships/leagues. Use this when users ask about current championships, active leagues, or what's happening now.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getCompletedLeagues",
        description: "Get all completed (past) championships/leagues. Use this when users ask about previous seasons, past championships, or league history.",
        parameters: {
            type: "object",
            properties: {},
            required: []
        }
    },
    {
        name: "getLapTimes",
        description: "Get lap-by-lap timing data for a specific race. Optionally filter by driver. Use this when users ask about lap times, pace, or sector times from a race.",
        parameters: {
            type: "object",
            properties: {
                raceId: {
                    type: "number",
                    description: "The race ID to get lap times for"
                },
                driverName: {
                    type: "string",
                    description: "Optional: Filter to a specific driver's laps"
                }
            },
            required: ["raceId"]
        }
    },
    {
        name: "getHeadToHead",
        description: "Compare two drivers head-to-head with statistics on races together, wins, and performance. Use this when users ask to compare drivers or want head-to-head stats.",
        parameters: {
            type: "object",
            properties: {
                driver1: {
                    type: "string",
                    description: "First driver's name"
                },
                driver2: {
                    type: "string",
                    description: "Second driver's name"
                }
            },
            required: ["driver1", "driver2"]
        }
    },
    {
        name: "searchDrivers",
        description: "Search for drivers by name. Use this when you need to find a driver's exact name or see available drivers.",
        parameters: {
            type: "object",
            properties: {
                query: {
                    type: "string",
                    description: "Search query (partial name is ok)"
                }
            },
            required: ["query"]
        }
    }
];

module.exports = {
    functionDeclarations,
    
    // Wrap in the format Gemini expects
    tools: [{
        functionDeclarations: functionDeclarations
    }]
};
