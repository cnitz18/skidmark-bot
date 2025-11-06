// Test DatabaseController
require('dotenv').config();
const DatabaseController = require('./src/classes/DatabaseController');

async function test() {
    console.log('Testing DatabaseController...\n');
    
    const db = new DatabaseController();
    
    // Wait a moment for connection test
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
        // Test 1: Get recent races
        console.log('=== Test 1: Recent Races ===');
        const recentRaces = await db.getRecentRaces(5);
        console.log(`Found ${recentRaces.length} recent races:`);
        recentRaces.forEach((race, i) => {
            console.log(`  ${i + 1}. ${race.track_name} - ${race.vehicle_class_name} (Race ID: ${race.id})`);
        });

        if (recentRaces.length > 0) {
            const testRaceId = recentRaces[0].id;
            
            // Test 2: Get race results
            console.log(`\n=== Test 2: Race Results for Race ${testRaceId} ===`);
            const raceResults = await db.getRaceResults(testRaceId);
            if (raceResults) {
                console.log(`Track: ${raceResults.race.track_name}`);
                console.log(`Class: ${raceResults.race.vehicle_class_name}`);
                console.log(`Top 5 finishers:`);
                raceResults.results.slice(0, 5).forEach(r => {
                    console.log(`  ${r.position}. ${r.name} - ${r.total_time}ms`);
                });
            }

            // Test 3: Get lap times
            console.log(`\n=== Test 3: Lap Times (first 10 laps) ===`);
            const lapTimes = await db.getLapTimes(testRaceId);
            console.log(`Found ${lapTimes.length} lap records`);
            lapTimes.slice(0, 10).forEach(lap => {
                console.log(`  Lap ${lap.lap_number} - ${lap.name}: ${lap.lap_time}ms`);
            });
        }

        // Test 4: Search for drivers
        console.log('\n=== Test 4: Search Drivers ===');
        const drivers = await db.searchDrivers('');
        console.log(`Found ${drivers.length} drivers (showing first 10):`);
        drivers.slice(0, 10).forEach(name => console.log(`  - ${name}`));

        if (drivers.length > 0) {
            // Test 5: Get driver stats
            const testDriver = drivers[0];
            console.log(`\n=== Test 5: Stats for ${testDriver} ===`);
            const stats = await db.getDriverStats(testDriver);
            if (stats) {
                console.log(`  Races: ${stats.races_entered}`);
                console.log(`  Wins: ${stats.wins}`);
                console.log(`  Podiums: ${stats.podiums}`);
                console.log(`  Fastest Laps: ${stats.fastest_laps}`);
                console.log(`  Avg Position: ${parseFloat(stats.avg_position).toFixed(2)}`);
            }
        }

        // Test 6: Get active leagues
        console.log('\n=== Test 6: Active Leagues ===');
        const activeLeagues = await db.getActiveLeagues();
        console.log(`Found ${activeLeagues.length} active league(s):`);
        activeLeagues.forEach(league => {
            console.log(`  - ${league.name} (ID: ${league.id})`);
        });

        if (activeLeagues.length > 0) {
            // Test 7: Get league standings
            const leagueId = activeLeagues[0].id;
            console.log(`\n=== Test 7: Standings for ${activeLeagues[0].name} ===`);
            const standings = await db.getLeagueStandings(leagueId);
            console.log(`Top 5:`);
            standings.slice(0, 5).forEach(entry => {
                console.log(`  ${entry.position}. ${entry.player_name} - ${entry.points} pts (${entry.wins} wins)`);
            });
        }

        // Test 8: Completed leagues
        console.log('\n=== Test 8: Completed Leagues ===');
        const completedLeagues = await db.getCompletedLeagues();
        console.log(`Found ${completedLeagues.length} completed league(s)`);

        console.log('\n✅ All tests completed successfully!');

    } catch (err) {
        console.error('\n❌ Test failed:', err.message);
        console.error(err.stack);
    } finally {
        await db.close();
    }
}

test();
