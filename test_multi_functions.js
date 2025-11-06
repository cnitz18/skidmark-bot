// Test multiple function calls
require('dotenv').config();
const { GoogleGenerativeAI } = require("@google/generative-ai");
const DatabaseController = require('./src/classes/DatabaseController');
const { tools } = require('./src/classes/GeminiFunctions');
const { formatLapTime } = require('./src/utils/formatters');

const MODEL = "gemini-2.0-flash";
const SYSTEM_INSTRUCTIONS = 
    "You are Chorley, a bot for a racing league. " +
    "You have access to a database with race results, driver statistics, and championship standings. " +
    "When users ask questions that require multiple pieces of data, use multiple functions simultaneously. " +
    "IMPORTANT: All lap times are in milliseconds. Use the formatLapTime function to convert them to readable format.";

async function test() {
    console.log('Testing Multiple Function Calls...\n');
    
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
    
    // Function executor
    async function executeFunction(functionName, args) {
        try {
            let result;
            switch(functionName) {
                case 'getRecentRaces':
                    result = await db.getRecentRaces(args.limit || 5, args.leagueId);
                    break;
                case 'getDriverStats':
                    result = await db.getDriverStats(args.driverName, args.leagueId);
                    break;
                case 'getRecentWinners':
                    result = await db.getRecentWinners(args.limit || 10);
                    break;
                case 'getChampionshipWinners':
                    result = await db.getChampionshipWinners();
                    break;
                case 'getChampionshipStats':
                    result = await db.getChampionshipStats();
                    break;
                case 'getHeadToHead':
                    result = await db.getHeadToHead(args.driver1, args.driver2);
                    break;
                case 'formatLapTime':
                    result = { formatted_time: formatLapTime(args.milliseconds) };
                    break;
                default:
                    result = { error: `Unknown function: ${functionName}` };
            }
            
            // Debug logging for getChampionshipStats
            if (functionName === 'getChampionshipStats') {
                console.log('\n📊 DEBUG - getChampionshipStats result:');
                console.log(JSON.stringify(result, null, 2));
            }
            
            return result;
        } catch (error) {
            console.error(`Error executing ${functionName}:`, error.message);
            return { error: error.message };
        }
    }
    
    // Test query that should trigger multiple function calls
    const query = "Who has won the most championships and what are their recent race results?";
    
    console.log(`${'='.repeat(70)}`);
    console.log(`📝 User: "${query}"`);
    console.log(`${'='.repeat(70)}`);
    
    try {
        let result = await chat.sendMessage(query);
        let response = result.response;
        
        // Check for function calls
        let functionCalls = response.functionCalls();
        
        if (functionCalls && functionCalls.length > 0) {
            console.log(`\n🤖 Chorley wants to call ${functionCalls.length} function(s):`);
            functionCalls.forEach((fc, i) => {
                console.log(`   ${i + 1}. ${fc.name}(${JSON.stringify(fc.args)})`);
            });
            
            // Execute all functions in parallel
            console.log(`\n⚙️  Executing all functions in parallel...`);
            const startTime = Date.now();
            
            const functionResponses = await Promise.all(
                functionCalls.map(async (functionCall) => {
                    const result = await executeFunction(functionCall.name, functionCall.args);
                    console.log(`   ✅ ${functionCall.name} completed (${JSON.stringify(result).length} chars)`);
                    return {
                        functionResponse: {
                            name: functionCall.name,
                            response: {
                                name: functionCall.name,
                                content: result
                            }
                        }
                    };
                })
            );
            
            const executionTime = Date.now() - startTime;
            console.log(`   ⏱️  Total execution time: ${executionTime}ms\n`);
            
            // Send results back to Gemini
            const result2 = await chat.sendMessage(functionResponses);
            response = result2.response;
        } else {
            console.log('\n💭 No function calls needed (direct response)');
        }
        
        const text = response.text();
        console.log(`\n💬 Chorley: ${text}`);
        
    } catch (err) {
        console.error('\n❌ Error:', err.message);
    }
    
    console.log(`\n${'='.repeat(70)}`);
    console.log('✅ Multi-function test complete!');
    console.log(`${'='.repeat(70)}\n`);
    
    await db.close();
}

test();
