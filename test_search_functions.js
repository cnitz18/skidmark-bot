// Test new search functions
require('dotenv').config();
const DatabaseController = require('./src/classes/DatabaseController');

async function test() {
    console.log('Testing new search functions...\n');
    
    const db = new DatabaseController();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
        // Test 1: Get all races
        console.log('=== Test 1: Get All Races (limit 5) ===');
        const allRaces = await db.getAllRaces(5);
        console.log(`Found ${allRaces.length} races:`);
        allRaces.forEach((race, i) => {
            const leagueText = race.league_name ? ` [League: ${race.league_name}]` : ' [Standalone]';
            console.log(`  ${i + 1}. ${race.track_name} - ${race.vehicle_class_name}${leagueText}`);
        });

        // Test 2: Search by track
        console.log('\n=== Test 2: Search Races at "Spa" ===');
        const spaRaces = await db.getAllRaces(10, 'Spa');
        console.log(`Found ${spaRaces.length} races at Spa:`);
        spaRaces.slice(0, 5).forEach((race, i) => {
            console.log(`  ${i + 1}. ${race.track_name} - ${race.vehicle_class_name} (Race ID: ${race.id})`);
        });

        // Test 3: Search by vehicle class
        console.log('\n=== Test 3: Search GT3 Races ===');
        const gt3Races = await db.getAllRaces(5, null, 'GT3');
        console.log(`Found ${gt3Races.length} GT3 races:`);
        gt3Races.forEach((race, i) => {
            console.log(`  ${i + 1}. ${race.track_name} - ${race.vehicle_class_name}`);
        });

        // Test 4: Get recent winners
        console.log('\n=== Test 4: Recent Winners (last 5 races) ===');
        const recentWinners = await db.getRecentWinners(5);
        console.log(`Recent winners:`);
        recentWinners.forEach((win, i) => {
            const leagueText = win.league_name ? ` [${win.league_name}]` : '';
            console.log(`  ${i + 1}. ${win.winner_name} - ${win.track_name} (${win.vehicle_class_name})${leagueText}`);
        });

        // Test 5: Get driver race history
        if (recentWinners.length > 0) {
            const testDriver = recentWinners[0].winner_name;
            console.log(`\n=== Test 5: Race History for ${testDriver} (last 5) ===`);
            const driverHistory = await db.getDriverRaceHistory(testDriver, 5);
            console.log(`Found ${driverHistory.length} races:`);
            driverHistory.forEach((result, i) => {
                console.log(`  ${i + 1}. P${result.position} at ${result.track_name} (${result.vehicle_class_name})`);
            });
        }

        console.log('\n✅ All tests passed!');

    } catch (err) {
        console.error('\n❌ Test failed:', err.message);
        console.error(err.stack);
    } finally {
        await db.close();
    }
}

test();
