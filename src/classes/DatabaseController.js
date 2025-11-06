const { Pool } = require('pg');
const ReferenceData = require('./ReferenceData');

/**
 * DatabaseController - Manages PostgreSQL connection and provides
 * query methods for race and league data.
 */
module.exports = (() => {
    _ = new WeakMap();
    
    class DatabaseController {
        constructor() {
            // Initialize PostgreSQL connection pool
            const pool = new Pool({
                connectionString: process.env.DATABASE_URL,
                max: 3, // Max 3 connections (read-only bot doesn't need many)
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });

            // Initialize reference data loader
            const refData = new ReferenceData();

            let obj = {
                pool,
                refData,
                isConnected: false
            };
            
            _.set(this, obj);

            // Test connection on initialization
            this.testConnection();
        }

        /**
         * Test database connection
         */
        async testConnection() {
            try {
                const result = await _.get(this).pool.query('SELECT NOW()');
                _.get(this).isConnected = true;
                console.log('✅ Database connected successfully');
                return true;
            } catch (err) {
                _.get(this).isConnected = false;
                console.error('❌ Database connection failed:', err.message);
                return false;
            }
        }

        /**
         * Get reference data instance
         */
        get refData() {
            return _.get(this).refData;
        }

        /**
         * Execute a parameterized query
         * @param {string} query - SQL query with $1, $2 placeholders
         * @param {array} params - Parameters for the query
         * @returns {Promise<object>} Query result
         */
        async query(query, params = []) {
            try {
                const result = await _.get(this).pool.query(query, params);
                return result;
            } catch (err) {
                console.error('Database query error:', err.message);
                throw err;
            }
        }

        /**
         * Get the most recent N races
         * @param {number} limit - Number of races to return (default 10)
         * @param {number} leagueId - Optional: filter by league
         * @returns {Promise<array>} Array of race objects with details
         */
        async getRecentRaces(limit = 10, leagueId = null) {
            const query = `
                SELECT 
                    h.id,
                    h.end_time,
                    h.start_time,
                    h.league_id,
                    l.name as league_name,
                    hs."TrackId" as track_id,
                    hs."VehicleClassId" as vehicle_class_id,
                    hs."VehicleModelId" as vehicle_model_id
                FROM batchupload_history h
                JOIN batchupload_historysetup hs ON h.setup_id = hs.id
                LEFT JOIN leagues_league l ON h.league_id = l.id
                WHERE h.finished = true
                    AND h."isHistoricalOrIncomplete" = false
                    ${leagueId ? 'AND h.league_id = $2' : ''}
                ORDER BY h.end_time DESC
                LIMIT $1
            `;
            
            const params = leagueId ? [limit, leagueId] : [limit];
            const result = await this.query(query, params);
            
            // Enrich with reference data
            return result.rows.map(row => ({
                ...row,
                track_name: this.refData.getTrackName(row.track_id),
                vehicle_class_name: this.refData.getVehicleClassName(row.vehicle_class_id),
                vehicle_name: this.refData.getVehicleName(row.vehicle_model_id)
            }));
        }

        /**
         * Get race results by race ID
         * @param {number} raceId - The race history ID
         * @returns {Promise<object>} Race details with results
         */
        async getRaceResults(raceId) {
            // Get race basic info
            const raceQuery = `
                SELECT 
                    h.id,
                    h.end_time,
                    h.start_time,
                    h.league_id,
                    l.name as league_name,
                    hs."TrackId" as track_id,
                    hs."VehicleClassId" as vehicle_class_id,
                    hs."VehicleModelId" as vehicle_model_id,
                    hs."RaceLength" as race_length,
                    hs."GridSize" as grid_size
                FROM batchupload_history h
                JOIN batchupload_historysetup hs ON h.setup_id = hs.id
                LEFT JOIN leagues_league l ON h.league_id = l.id
                WHERE h.id = $1
            `;
            
            const raceResult = await this.query(raceQuery, [raceId]);
            if (raceResult.rows.length === 0) {
                return null;
            }

            const race = raceResult.rows[0];

            // Get race1 stage results
            const resultsQuery = `
                SELECT 
                    r.name,
                    r."RacePosition" as position,
                    r."TotalTime" as total_time,
                    r."FastestLapTime" as fastest_lap,
                    r."IsFastestLap" as is_fastest_lap,
                    r."State" as state,
                    r."VehicleId" as vehicle_id
                FROM batchupload_history h
                JOIN batchupload_historystages hs ON h.stages_id = hs.id
                JOIN batchupload_historystageresult r ON hs.race1_id = r.stage_id
                WHERE h.id = $1
                ORDER BY r."RacePosition" ASC
            `;
            
            const resultsResult = await this.query(resultsQuery, [raceId]);

            // Enrich results with vehicle names
            const results = resultsResult.rows.map(row => ({
                ...row,
                vehicle_name: this.refData.getVehicleName(row.vehicle_id)
            }));

            return {
                race: {
                    ...race,
                    track_name: this.refData.getTrackName(race.track_id),
                    vehicle_class_name: this.refData.getVehicleClassName(race.vehicle_class_id),
                    vehicle_name: this.refData.getVehicleName(race.vehicle_model_id)
                },
                results
            };
        }

        /**
         * Get driver statistics across all races
         * @param {string} driverName - Driver name to search for
         * @param {number} leagueId - Optional: filter by league
         * @returns {Promise<object>} Driver statistics
         */
        async getDriverStats(driverName, leagueId = null) {
            const query = `
                SELECT 
                    r.name,
                    COUNT(*) as races_entered,
                    SUM(CASE WHEN r."RacePosition" = 1 THEN 1 ELSE 0 END) as wins,
                    SUM(CASE WHEN r."RacePosition" <= 3 THEN 1 ELSE 0 END) as podiums,
                    SUM(CASE WHEN r."RacePosition" <= 10 THEN 1 ELSE 0 END) as top_10s,
                    SUM(CASE WHEN r."IsFastestLap" = true THEN 1 ELSE 0 END) as fastest_laps,
                    MIN(r."FastestLapTime") as best_lap_time,
                    AVG(r."RacePosition") as avg_position
                FROM batchupload_historystageresult r
                JOIN batchupload_historystage s ON r.stage_id = s.id
                JOIN batchupload_historystages hs ON hs.race1_id = s.id
                JOIN batchupload_history h ON h.stages_id = hs.id
                WHERE r.name ILIKE $1
                    AND h.finished = true
                    AND h."isHistoricalOrIncomplete" = false
                    ${leagueId ? 'AND h.league_id = $3' : ''}
                GROUP BY r.name
            `;
            
            const params = leagueId ? [`%${driverName}%`, leagueId] : [`%${driverName}%`];
            const result = await this.query(query, params);
            
            return result.rows[0] || null;
        }

        /**
         * Get championship standings for a league
         * @param {number} leagueId - League ID
         * @returns {Promise<array>} Standings entries
         */
        async getLeagueStandings(leagueId) {
            const query = `
                SELECT 
                    l.id as league_id,
                    l.name as league_name,
                    l.completed,
                    e."PlayerName" as player_name,
                    e."Position" as position,
                    e."Points" as points,
                    e."Wins" as wins,
                    e."Poles" as poles,
                    e."Podiums" as podiums,
                    e."FastestLaps" as fastest_laps,
                    e."PointsFinishes" as points_finishes
                FROM leagues_league l
                JOIN leagues_leaguescoreboardentry e ON l.id = e.league_id
                WHERE l.id = $1
                ORDER BY e."Position" ASC NULLS LAST
            `;
            
            const result = await this.query(query, [leagueId]);
            return result.rows;
        }

        /**
         * Get all active (incomplete) leagues
         * @returns {Promise<array>} Active leagues
         */
        async getActiveLeagues() {
            const query = `
                SELECT 
                    id,
                    name,
                    description,
                    "extraPointForFastestLap" as extra_point_for_fastest_lap
                FROM leagues_league
                WHERE completed = false
                ORDER BY id DESC
            `;
            
            const result = await this.query(query);
            return result.rows;
        }

        /**
         * Get completed leagues
         * @returns {Promise<array>} Completed leagues
         */
        async getCompletedLeagues() {
            const query = `
                SELECT 
                    id,
                    name,
                    description,
                    "extraPointForFastestLap" as extra_point_for_fastest_lap
                FROM leagues_league
                WHERE completed = true
                ORDER BY id DESC
            `;
            
            const result = await this.query(query);
            return result.rows;
        }

        /**
         * Get the most recent league (active or completed)
         * @param {boolean} activeOnly - If true, only return active leagues
         * @returns {Promise<object>} Most recent league with details
         */
        async getMostRecentLeague(activeOnly = false) {
            const query = `
                SELECT 
                    id,
                    name,
                    description,
                    completed,
                    "extraPointForFastestLap" as extra_point_for_fastest_lap
                FROM leagues_league
                ${activeOnly ? 'WHERE completed = false' : ''}
                ORDER BY id DESC
                LIMIT 1
            `;
            
            const result = await this.query(query);
            return result.rows[0] || null;
        }

        /**
         * Get championship winners (top finisher from each completed league)
         * @returns {Promise<array>} Array of championship winners
         */
        async getChampionshipWinners() {
            const query = `
                SELECT 
                    l.id as league_id,
                    l.name as league_name,
                    e."PlayerName" as champion,
                    e."Points" as points,
                    e."Wins" as wins,
                    e."Poles" as poles,
                    e."Podiums" as podiums
                FROM leagues_league l
                JOIN leagues_leaguescoreboardentry e ON l.id = e.league_id
                WHERE l.completed = true
                    AND e."Position" = 1
                ORDER BY l.id DESC
            `;
            
            const result = await this.query(query);
            return result.rows;
        }

        /**
         * Get full details about a specific league including standings and race schedule
         * @param {number} leagueId - League ID
         * @returns {Promise<object>} Complete league information
         */
        async getLeagueDetails(leagueId) {
            // Get league info
            const leagueQuery = `
                SELECT 
                    id,
                    name,
                    description,
                    completed,
                    "extraPointForFastestLap" as extra_point_for_fastest_lap,
                    img
                FROM leagues_league
                WHERE id = $1
            `;
            
            const leagueResult = await this.query(leagueQuery, [leagueId]);
            if (leagueResult.rows.length === 0) {
                return null;
            }
            
            const league = leagueResult.rows[0];
            
            // Get standings
            const standings = await this.getLeagueStandings(leagueId);
            
            // Get race schedule
            const scheduleQuery = `
                SELECT 
                    id,
                    track,
                    date,
                    completed
                FROM leagues_leagueracedate
                WHERE league_id = $1
                ORDER BY date ASC
            `;
            
            const scheduleResult = await this.query(scheduleQuery, [leagueId]);
            const schedule = scheduleResult.rows.map(row => ({
                ...row,
                track_name: this.refData.getTrackName(row.track)
            }));
            
            // Get points system
            const pointsQuery = `
                SELECT 
                    "position",
                    points
                FROM leagues_leaguepointsposition
                WHERE league_id = $1
                ORDER BY "position" ASC
            `;
            
            const pointsResult = await this.query(pointsQuery, [leagueId]);
            
            // Get league races from history
            const racesQuery = `
                SELECT 
                    h.id,
                    h.end_time,
                    hs."TrackId" as track_id
                FROM batchupload_history h
                JOIN batchupload_historysetup hs ON h.setup_id = hs.id
                WHERE h.league_id = $1
                    AND h.finished = true
                ORDER BY h.end_time ASC
            `;
            
            const racesResult = await this.query(racesQuery, [leagueId]);
            const races = racesResult.rows.map(row => ({
                ...row,
                track_name: this.refData.getTrackName(row.track_id)
            }));
            
            return {
                league,
                standings,
                schedule,
                points_system: pointsResult.rows,
                races_completed: races
            };
        }

        /**
         * Get championship statistics (who won most, back-to-back winners, etc.)
         * @returns {Promise<object>} Championship statistics
         */
        async getChampionshipStats() {
            // Get all champions
            const champions = await this.getChampionshipWinners();
            
            // Count championships per driver
            const championshipCounts = {};
            champions.forEach(champ => {
                if (!championshipCounts[champ.champion]) {
                    championshipCounts[champ.champion] = {
                        name: champ.champion,
                        championships: 0,
                        titles: []
                    };
                }
                championshipCounts[champ.champion].championships++;
                championshipCounts[champ.champion].titles.push({
                    league_name: champ.league_name,
                    league_id: champ.league_id,
                    points: champ.points,
                    wins: champ.wins
                });
            });
            
            // Find most championships
            const driversArray = Object.values(championshipCounts);
            driversArray.sort((a, b) => b.championships - a.championships);
            
            // Check for back-to-back champions (consecutive league IDs)
            const backToBackChampions = [];
            for (let i = 0; i < champions.length - 1; i++) {
                const current = champions[i];
                const next = champions[i + 1];
                
                // Check if same driver and consecutive leagues
                if (current.champion === next.champion && 
                    Math.abs(current.league_id - next.league_id) === 1) {
                    backToBackChampions.push({
                        driver: current.champion,
                        leagues: [current.league_name, next.league_name],
                        league_ids: [current.league_id, next.league_id]
                    });
                }
            }
            
            return {
                total_championships: champions.length,
                all_champions: champions,
                most_championships: driversArray,
                back_to_back_champions: backToBackChampions,
                unique_champions: driversArray.length
            };
        }

        /**
         * Get lap times for a specific race and optional driver
         * @param {number} raceId - Race history ID
         * @param {string} driverName - Optional: specific driver name
         * @returns {Promise<array>} Lap time events
         */
        async getLapTimes(raceId, driverName = null) {
            const query = `
                SELECT 
                    e.name,
                    e."attributes_Lap" as lap_number,
                    e."attributes_LapTime" as lap_time,
                    e."attributes_Sector1Time" as sector1,
                    e."attributes_Sector2Time" as sector2,
                    e."attributes_Sector3Time" as sector3,
                    e."attributes_RacePosition" as position
                FROM batchupload_history h
                JOIN batchupload_historystages hs ON h.stages_id = hs.id
                JOIN batchupload_historystageevent e ON hs.race1_id = e.stage_id
                WHERE h.id = $1
                    AND e.event_name = 'Lap'
                    AND e."attributes_LapTime" > 0
                    ${driverName ? 'AND e.name ILIKE $2' : ''}
                ORDER BY e."attributes_Lap" ASC, e."attributes_LapTime" ASC
            `;
            
            const params = driverName ? [raceId, `%${driverName}%`] : [raceId];
            const result = await this.query(query, params);
            return result.rows;
        }

        /**
         * Get head-to-head statistics between two drivers
         * @param {string} driver1 - First driver name
         * @param {string} driver2 - Second driver name
         * @returns {Promise<object>} Head-to-head stats
         */
        async getHeadToHead(driver1, driver2) {
            const query = `
                WITH race_positions AS (
                    SELECT 
                        h.id as race_id,
                        r.name,
                        r."RacePosition" as position
                    FROM batchupload_historystageresult r
                    JOIN batchupload_historystage s ON r.stage_id = s.id
                    JOIN batchupload_historystages hs ON hs.race1_id = s.id
                    JOIN batchupload_history h ON h.stages_id = hs.id
                    WHERE (r.name ILIKE $1 OR r.name ILIKE $2)
                        AND h.finished = true
                        AND h."isHistoricalOrIncomplete" = false
                )
                SELECT 
                    COUNT(DISTINCT CASE WHEN name ILIKE $1 THEN race_id END) as driver1_races,
                    COUNT(DISTINCT CASE WHEN name ILIKE $2 THEN race_id END) as driver2_races,
                    COUNT(DISTINCT race_id) as races_together,
                    SUM(CASE WHEN name ILIKE $1 AND position = 1 THEN 1 ELSE 0 END) as driver1_wins,
                    SUM(CASE WHEN name ILIKE $2 AND position = 1 THEN 1 ELSE 0 END) as driver2_wins
                FROM race_positions
            `;
            
            const result = await this.query(query, [`%${driver1}%`, `%${driver2}%`]);
            return result.rows[0];
        }

        /**
         * Search for drivers by name
         * @param {string} query - Search query
         * @returns {Promise<array>} Matching driver names
         */
        async searchDrivers(query) {
            const sql = `
                SELECT DISTINCT name
                FROM batchupload_historystageresult
                WHERE name ILIKE $1
                ORDER BY name
                LIMIT 20
            `;
            
            const result = await this.query(sql, [`%${query}%`]);
            return result.rows.map(row => row.name);
        }

        /**
         * Get all races across all leagues and standalone races
         * @param {number} limit - Number of races to return (default 20)
         * @param {string} trackName - Optional: filter by track name
         * @param {string} vehicleClass - Optional: filter by vehicle class
         * @returns {Promise<array>} Array of race objects
         */
        async getAllRaces(limit = 20, trackName = null, vehicleClass = null) {
            // First, get races from database
            const query = `
                SELECT 
                    h.id,
                    h.end_time,
                    h.start_time,
                    h.league_id,
                    l.name as league_name,
                    hs."TrackId" as track_id,
                    hs."VehicleClassId" as vehicle_class_id,
                    hs."VehicleModelId" as vehicle_model_id
                FROM batchupload_history h
                JOIN batchupload_historysetup hs ON h.setup_id = hs.id
                LEFT JOIN leagues_league l ON h.league_id = l.id
                WHERE h.finished = true
                    AND h."isHistoricalOrIncomplete" = false
                ORDER BY h.end_time DESC
                LIMIT $1
            `;
            
            const result = await this.query(query, [limit * 2]); // Get more to filter
            
            // Enrich with reference data and filter
            let races = result.rows.map(row => ({
                ...row,
                track_name: this.refData.getTrackName(row.track_id),
                vehicle_class_name: this.refData.getVehicleClassName(row.vehicle_class_id),
                vehicle_name: this.refData.getVehicleName(row.vehicle_model_id)
            }));

            // Apply filters if provided
            if (trackName) {
                const lowerTrack = trackName.toLowerCase();
                races = races.filter(race => 
                    race.track_name.toLowerCase().includes(lowerTrack)
                );
            }

            if (vehicleClass) {
                const lowerClass = vehicleClass.toLowerCase();
                races = races.filter(race => 
                    race.vehicle_class_name.toLowerCase().includes(lowerClass)
                );
            }

            return races.slice(0, limit);
        }

        /**
         * Get all results for a specific driver across all races
         * @param {string} driverName - Driver name to search for
         * @param {number} limit - Number of results to return (default 20)
         * @returns {Promise<array>} Array of race results for this driver
         */
        async getDriverRaceHistory(driverName, limit = 20) {
            const query = `
                SELECT 
                    h.id as race_id,
                    h.end_time,
                    h.league_id,
                    l.name as league_name,
                    hs."TrackId" as track_id,
                    hs."VehicleClassId" as vehicle_class_id,
                    r.name as driver_name,
                    r."RacePosition" as position,
                    r."TotalTime" as total_time,
                    r."FastestLapTime" as fastest_lap,
                    r."IsFastestLap" as is_fastest_lap,
                    r."State" as state
                FROM batchupload_historystageresult r
                JOIN batchupload_historystage s ON r.stage_id = s.id
                JOIN batchupload_historystages hs_stages ON hs_stages.race1_id = s.id
                JOIN batchupload_history h ON h.stages_id = hs_stages.id
                JOIN batchupload_historysetup hs ON h.setup_id = hs.id
                LEFT JOIN leagues_league l ON h.league_id = l.id
                WHERE r.name ILIKE $1
                    AND h.finished = true
                    AND h."isHistoricalOrIncomplete" = false
                ORDER BY h.end_time DESC
                LIMIT $2
            `;
            
            const result = await this.query(query, [`%${driverName}%`, limit]);
            
            // Enrich with reference data
            return result.rows.map(row => ({
                ...row,
                track_name: this.refData.getTrackName(row.track_id),
                vehicle_class_name: this.refData.getVehicleClassName(row.vehicle_class_id)
            }));
        }

        /**
         * Get winners from recent races
         * @param {number} limit - Number of races to check (default 10)
         * @returns {Promise<array>} Array of winners with race details
         */
        async getRecentWinners(limit = 10) {
            const query = `
                SELECT 
                    h.id as race_id,
                    h.end_time,
                    h.league_id,
                    l.name as league_name,
                    hs."TrackId" as track_id,
                    hs."VehicleClassId" as vehicle_class_id,
                    r.name as winner_name,
                    r."TotalTime" as winning_time,
                    r."FastestLapTime" as fastest_lap,
                    r."IsFastestLap" as had_fastest_lap
                FROM batchupload_history h
                JOIN batchupload_historysetup hs ON h.setup_id = hs.id
                JOIN batchupload_historystages hs_stages ON h.stages_id = hs_stages.id
                JOIN batchupload_historystageresult r ON hs_stages.race1_id = r.stage_id
                LEFT JOIN leagues_league l ON h.league_id = l.id
                WHERE h.finished = true
                    AND h."isHistoricalOrIncomplete" = false
                    AND r."RacePosition" = 1
                ORDER BY h.end_time DESC
                LIMIT $1
            `;
            
            const result = await this.query(query, [limit]);
            
            // Enrich with reference data
            return result.rows.map(row => ({
                ...row,
                track_name: this.refData.getTrackName(row.track_id),
                vehicle_class_name: this.refData.getVehicleClassName(row.vehicle_class_id)
            }));
        }

        /**
         * Close database connection pool
         */
        async close() {
            await _.get(this).pool.end();
            console.log('Database connection pool closed');
        }
    }
    
    return DatabaseController;
})();
