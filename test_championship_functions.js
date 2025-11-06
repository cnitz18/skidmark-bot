// Test championship functions
require('dotenv').config();
const DatabaseController = require('./src/classes/DatabaseController');

async function test() {
    console.log('Testing championship functions...\n');
    
    const db = new DatabaseController();
    
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    try {
        // Test 1: Get most recent league
        console.log('=== Test 1: Most Recent League ===');
        const recentLeague = await db.getMostRecentLeague();
        if (recentLeague) {
            console.log(`League: ${recentLeague.name} (ID: ${recentLeague.id})`);
            console.log(`Status: ${recentLeague.completed ? 'Completed' : 'Active'}`);
            if (recentLeague.description) {
                console.log(`Description: ${recentLeague.description}`);
            }
        } else {
            console.log('No leagues found');
        }

        // Test 2: Get championship winners
        console.log('\n=== Test 2: Championship Winners ===');
        const winners = await db.getChampionshipWinners();
        console.log(`Total championships: ${winners.length}`);
        winners.forEach((winner, i) => {
            console.log(`  ${i + 1}. ${winner.champion} - ${winner.league_name}`);
            console.log(`     ${winner.points} pts, ${winner.wins} wins, ${winner.podiums} podiums`);
        });

        // Test 3: Championship statistics
        console.log('\n=== Test 3: Championship Statistics ===');
        const stats = await db.getChampionshipStats();
        console.log(`Total championships held: ${stats.total_championships}`);
        console.log(`Unique champions: ${stats.unique_champions}`);
        
        console.log('\nMost Championships:');
        stats.most_championships.slice(0, 5).forEach((driver, i) => {
            console.log(`  ${i + 1}. ${driver.name} - ${driver.championships} championship(s)`);
            driver.titles.forEach(title => {
                console.log(`     - ${title.league_name} (${title.wins} wins)`);
            });
        });
        
        if (stats.back_to_back_champions.length > 0) {
            console.log('\nBack-to-Back Champions:');
            stats.back_to_back_champions.forEach((btb, i) => {
                console.log(`  ${i + 1}. ${btb.driver}`);
                console.log(`     Won: ${btb.leagues.join(' → ')}`);
            });
        } else {
            console.log('\nNo back-to-back champions found');
        }

        // Test 4: League details (most recent)
        if (recentLeague) {
            console.log(`\n=== Test 4: Details for ${recentLeague.name} ===`);
            const details = await db.getLeagueDetails(recentLeague.id);
            if (details) {
                console.log(`Standings (Top 5):`);
                details.standings.slice(0, 5).forEach((entry, i) => {
                    const pos = entry.position || '?';
                    console.log(`  ${pos}. ${entry.player_name} - ${entry.points} pts`);
                });
                
                console.log(`\nRaces completed: ${details.races_completed.length}`);
                if (details.races_completed.length > 0) {
                    console.log(`Race tracks:`);
                    details.races_completed.forEach((race, i) => {
                        console.log(`  ${i + 1}. ${race.track_name}`);
                    });
                }
                
                if (details.schedule.length > 0) {
                    const remaining = details.schedule.filter(s => !s.completed);
                    if (remaining.length > 0) {
                        console.log(`\nUpcoming races: ${remaining.length}`);
                        remaining.slice(0, 3).forEach((race, i) => {
                            console.log(`  ${i + 1}. ${race.track_name}`);
                        });
                    }
                }
            }
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
