// Test Gemini function calling integration
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const DatabaseController = require('./src/classes/DatabaseController');
const { tools } = require('./src/classes/GeminiFunctions');

const MODEL = "gemini-2.0-flash";
const SYSTEM_INSTRUCTIONS = 
    "You are Chorley, a bot for a racing league. " +
    "You have access to a database with race results, driver statistics, and championship standings. " +
    "When users ask about race data, use the available functions to look up accurate information.";

async function test() {
    console.log('Testing Gemini Function Calling Integration...\n');
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const db = new DatabaseController();
    
    // Wait for DB connection
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const model = genAI.getGenerativeModel({ 
        model: MODEL, 
        systemInstruction: SYSTEM_INSTRUCTIONS,
        tools: tools
    });
    
    const chat = model.startChat();
    
    // Function to execute database calls
    async function executeFunction(functionName, args) {
        console.log(`  🔧 Executing: ${functionName}(${JSON.stringify(args)})`);
        switch(functionName) {
            case 'getRecentRaces':
                return await db.getRecentRaces(args.limit || 5, args.leagueId);
            case 'getDriverStats':
                return await db.getDriverStats(args.driverName, args.leagueId);
            case 'getActiveLeagues':
                return await db.getActiveLeagues();
            case 'getLeagueStandings':
                return await db.getLeagueStandings(args.leagueId);
            default:
                return { error: `Unknown function: ${functionName}` };
        }
    }
    
    // Test queries
    const testQueries = [
        "What were the last 3 races?",
        "Who are the active championships?",
    ];
    
    for (const query of testQueries) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`📝 User: "${query}"`);
        console.log(`${'='.repeat(60)}`);
        
        try {
            let result = await chat.sendMessage(query);
            let response = result.response;
            
            // Check if Gemini wants to call a function
            let functionCall = response.functionCalls()?.[0];
            
            if (functionCall) {
                console.log(`\n🤖 Chorley wants to call: ${functionCall.name}`);
                console.log(`   Parameters:`, functionCall.args);
                
                // Execute the function
                const functionResponse = await executeFunction(functionCall.name, functionCall.args);
                console.log(`   ✅ Function returned ${JSON.stringify(functionResponse).length} chars of data`);
                
                // Send result back to Gemini
                const result2 = await chat.sendMessage([{
                    functionResponse: {
                        name: functionCall.name,
                        response: {
                            name: functionCall.name,
                            content: functionResponse
                        }
                    }
                }]);
                
                response = result2.response;
            }
            
            const text = response.text();
            console.log(`\n💬 Chorley: ${text}`);
            
        } catch (err) {
            console.error('❌ Error:', err.message);
        }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log('✅ Test complete!');
    console.log(`${'='.repeat(60)}\n`);
    
    await db.close();
}

test();
