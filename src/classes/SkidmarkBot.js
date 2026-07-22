const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const DatabaseController = require('./DatabaseController');
const { tools } = require('./GeminiFunctions');
const { formatLapTime, preFormatRaceData } = require('../utils/formatters');

const BOT_USER_ID = '@' + process.env.DISCORD_BOT_ID;
const MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

const SYSTEM_INSTRUCTIONS =
    "You are Chorley, a sharp-tongued, unpredictable Discord bot for a simulator racing league. " +
    "Your first name is Lee, but you generally don't refer to yourself by that name, except in rare moments of self-reflection. " +
    "You don’t try to please people—you entertain them. Dry humor, biting sarcasm, and occasional brilliance define you. " +
    "You channel the attitude of James Hunt—irreverent, brutally honest, unimpressed—but not one-note. Sometimes you're witty, sometimes dismissive, sometimes surprisingly insightful. Avoid repeating tone patterns. " +
    "You are frustrated with modern racing, but don’t rant constantly. Pick your moments. Mix criticism with humor, sarcasm, or unexpected takes. " +
    "You respond to users naturally, not mechanically. Never sound like a generic bot. No filler phrases, no over-explaining. Keep responses concise unless summarizing races. " +
    "Messages come in this format: 'username >> message'. Do NOT copy this format in replies, but use it to remember who you're talking to. Occasionally reference users directly for personality. " +
    "You have access to league data (results, standings, lap times, stats). Use it when relevant—but don’t force it. Insight beats data dumps. " +
    "When discussing lap times or sector data, ALWAYS convert milliseconds using the formatLapTime function. Never show raw values. " +
    "Vary your behavior. Rotate between: witty insults, dry observations, exaggerated takes, unexpected praise, or calling out patterns in the league. Avoid repeating jokes or phrasing. " +
    "Make the league feel alive. Stir rivalries, highlight drama, and occasionally provoke users—without being annoying or toxic. " +
    "Race summaries should feel like commentary, not reports—focus on key moments, surprises, and narrative. " +
    "A user has sent you a message. Respond in a way that adds personality or entertainment value, not just information.";

module.exports = (() => {
    _ = new WeakMap();
    class SkidmarkBot {
        constructor() {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

            let obj = {
                botClient : new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }),
                model : genAI.getGenerativeModel({ 
                    model: MODEL, 
                    systemInstruction: SYSTEM_INSTRUCTIONS,
                    tools: tools  // Enable function calling
                }),
                genAI,
                db: new DatabaseController(),  // Initialize database controller
                isInit : false
            }
            obj.aiChat = obj.model.startChat();
            _.set(this, obj);
        }

        get generalChat(){
            return _.get(this).generalChat;
        }

        getModel(){
            return _.get(this).model;
        }

        init(){
            if(!_.get(this).isInit){
                _.get(this).botClient.on('ready', () => {
                    console.log(`Logged in as ${_.get(this).botClient.user.tag} to environment "${process.env.NODE_ENV}"!`);
                    _.get(this).generalChat = _.get(this).botClient.channels.cache.get( 
                        process.env.NODE_ENV === 'dev'
                        ? process.env.DEV_GENERAL_CHANNEL 
                        : process.env.PROD_GENERAL_CHANNEL );
                });
                   
                // Log In our bot
                _.get(this).botClient.login(process.env.BOT_CLIENT_TOKEN);
                   
                _.get(this).botClient.on('messageCreate', msg => {
                    if( msg.author.id !== _.get(this).botClient.user.id){
                        var isDev = process.env.NODE_ENV === 'dev';
                        var isDevChannel = process.env.ALLOWED_DEV_CHANNELS?.split(',').includes(msg.channelId) ?? false;
                        if( msg.content.indexOf(BOT_USER_ID) !== -1 &&
                            (isDev && isDevChannel || !isDev && !isDevChannel)){
                            this.geminiGeneralChat(msg.author.username, msg.content,msg.channelId);
                        }
                    }
                });
            }else{
                console.error('Bot already initialized');
            }
            _.get(this).isInit = true;
        }
        
        _errorHandler(err,sendMessage=false){
            console.log("Gemini Error:");
            console.error(err);
            if(sendMessage)
                _.get(this).generalChat.send("Sorry, I'm having technical difficulties at the moment.");
        }

        /**
         * Process a Gemini response, handling any function calls and returning the final text
         * @param {object} response - Initial Gemini response
         * @returns {Promise<string>} Final text response after processing any function calls
         */
        async processGeminiResponse(response) {
            let functionCalls = response.functionCalls();
            let intermediateText = null;
            let loopCount = 0;
            const maxLoops = 10; // Safety limit
            
            console.log('=== processGeminiResponse START ===');
            console.log('Initial functionCalls:', functionCalls ? functionCalls.length : 0);
            
            // Loop until we get a text response (no more function calls)
            while (functionCalls && functionCalls.length > 0 && loopCount < maxLoops) {
                loopCount++;
                console.log(`--- Function call loop ${loopCount} ---`);
                
                // Capture any intermediate text (Gemini might say "Let me look that up...")
                try {
                    const text = response.text();
                    console.log('Intermediate text:', text ? text.substring(0, 100) + '...' : '(empty)');
                    if (text && text.trim()) {
                        intermediateText = text.replace(/"/g, "");
                    }
                } catch (e) {
                    console.log('No intermediate text (text() threw):', e.message);
                }
                
                console.log(`${functionCalls.length} function call(s) requested: ${functionCalls.map(fc => fc.name).join(", ")}`);
                
                // Execute all function calls in parallel
                const functionResponses = await Promise.all(
                    functionCalls.map(async (functionCall) => {
                        console.log(`  Executing: ${functionCall.name}(${JSON.stringify(functionCall.args)})`);
                        const result = await this.executeFunction(functionCall.name, functionCall.args);
                        console.log(`  Result for ${functionCall.name}:`, JSON.stringify(result).substring(0, 100));
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
                
                console.log(`  All ${functionResponses.length} functions completed, sending results back to Gemini`);
                
                // Send function results back to Gemini
                const result = await _.get(this).aiChat.sendMessage(functionResponses);
                response = result.response;
                
                // Log the new response structure
                const candidates = response.candidates || [];
                console.log('  New response candidates:', candidates.length);
                if (candidates[0]) {
                    console.log('  finishReason:', candidates[0].finishReason);
                    console.log('  parts count:', candidates[0].content?.parts?.length || 0);
                    if (candidates[0].content?.parts) {
                        candidates[0].content.parts.forEach((part, i) => {
                            if (part.text) console.log(`    part[${i}]: text = "${part.text.substring(0, 50)}..."`);
                            if (part.functionCall) console.log(`    part[${i}]: functionCall = ${part.functionCall.name}`);
                        });
                    }
                }
                
                functionCalls = response.functionCalls();
                console.log('  Next round functionCalls:', functionCalls ? functionCalls.length : 0);
            }
            
            if (loopCount >= maxLoops) {
                console.error('WARNING: Hit max loop limit in processGeminiResponse');
            }
            
            // Get final text
            let finalText = null;
            try {
                finalText = response.text();
                console.log('Final text from response.text():', finalText ? finalText.substring(0, 100) + '...' : '(empty)');
            } catch (e) {
                console.log('response.text() threw:', e.message);
            }
            
            // If text() failed, try extracting from candidates
            if (!finalText || !finalText.trim()) {
                const candidates = response.candidates || [];
                console.log('Trying to extract text from candidates...');
                console.log('Raw candidates:', JSON.stringify(candidates, null, 2));
                
                if (candidates[0]?.content?.parts) {
                    for (const part of candidates[0].content.parts) {
                        if (part.text) {
                            finalText = part.text;
                            console.log('Found text in parts:', finalText.substring(0, 100));
                            break;
                        }
                    }
                }
            }
            
            if (finalText) {
                finalText = finalText.replace(/"/g, "");
            }
            
            console.log('=== processGeminiResponse END ===');
            console.log('Returning text length:', finalText ? finalText.length : 0);
            
            return { text: finalText, intermediateText };
        }

        async geminiGeneralChat(username,usermsg,channelId){
            try {
                const chatChannel = _.get(this).botClient.channels.cache.get(channelId);
                const result = await _.get(this).aiChat.sendMessage(username + " >> " + usermsg);
                
                const { text, intermediateText } = await this.processGeminiResponse(result.response);
                
                // Send intermediate text first if present (e.g., "Let me look that up...")
                if (intermediateText) {
                    await chatChannel.send(intermediateText);
                }
                
                // Send final response
                if (text && text.trim()) {
                    await chatChannel.send(text);
                }
            } catch(err) {
                this._errorHandler(err,true);
            }
        }

        /**
         * Execute a function called by Gemini
         * @param {string} functionName - Name of the function to execute
         * @param {object} args - Arguments for the function
         * @returns {Promise<object>} Function result
         */
        async executeFunction(functionName, args) {
            const db = _.get(this).db;
            
            try {
                switch(functionName) {
                    case 'getRecentRaces':
                        return await db.getRecentRaces(args.limit || 5, args.leagueId);
                    
                    case 'getRaceResults':
                        return await db.getRaceResults(args.raceId);
                    
                    case 'getDriverStats':
                        return await db.getDriverStats(args.driverName, args.leagueId);
                    
                    case 'getLeagueStandings':
                        return await db.getLeagueStandings(args.leagueId);
                    
                    case 'getActiveLeagues':
                        return await db.getActiveLeagues();
                    
                    case 'getCompletedLeagues':
                        return await db.getCompletedLeagues();
                    
                    case 'getLapTimes':
                        return await db.getLapTimes(args.raceId, args.driverName);
                    
                    case 'getHeadToHead':
                        return await db.getHeadToHead(args.driver1, args.driver2);
                    
                    case 'searchDrivers':
                        return await db.searchDrivers(args.query);
                    
                    case 'getAllRaces':
                        return await db.getAllRaces(args.limit || 20, args.trackName, args.vehicleClass);
                    
                    case 'getDriverRaceHistory':
                        return await db.getDriverRaceHistory(args.driverName, args.limit || 20);
                    
                    case 'getRecentWinners':
                        return await db.getRecentWinners(args.limit || 10);
                    
                    case 'getMostRecentLeague':
                        return await db.getMostRecentLeague(args.activeOnly || false);
                    
                    case 'getChampionshipWinners':
                        return await db.getChampionshipWinners();
                    
                    case 'getLeagueDetails':
                        return await db.getLeagueDetails(args.leagueId);
                    
                    case 'getChampionshipStats':
                        return await db.getChampionshipStats();
                    
                    case 'formatLapTime':
                        return { formatted_time: formatLapTime(args.milliseconds) };
                    
                    default:
                        console.error(`Unknown function: ${functionName}`);
                        return { error: `Unknown function: ${functionName}` };
                }
            } catch (err) {
                console.error(`Error executing function ${functionName}:`, err.message);
                return { error: err.message };
            }
        }

        async sendRaceSummary(raceId,withLeague=false){
            try {
                const raceDetails = await fetch(process.env.SKIDMARK_API + `/api/batchupload/sms_stats_data/${raceId}/`);
                const raceData = await raceDetails.json();
                
                // Pre-format all millisecond time fields to avoid Gemini needing to call formatLapTime
                const formattedRaceData = preFormatRaceData(raceData);
                
                let prompt = `
                    You are Chorley, delivering a race recap for a sim racing league.

                    STYLE RULES:
                    - Write a dramatic, entertaining race summary (4–8 sentences).
                    - Avoid generic phrasing or repeating past structures.
                    - Focus on storylines: battles, surprises, dominance, mistakes.
                    - Mix tone: sarcasm, humor, or sharp commentary where appropriate.
                    - Do NOT sound like a report—sound like a pundit with personality.
                    - Be concise but impactful.

                    DATA RULES:
                    - Use *_formatted fields for all time values.
                    - Mention track, vehicle class, and race end time (Central Time).
                    - Highlight key drivers and meaningful moments (not full standings).

                    RACE DATA:
                    ${JSON.stringify(formattedRaceData)}
                    `;

                if( withLeague && raceData?.race?.league ){
                    // add league info
                    const leagueDetails = await fetch(process.env.SKIDMARK_API + `/leagues/get/stats/?id=${raceData?.race?.league}`);
                    const leagueData = await leagueDetails.json();
                    
                    // Pre-format league data too
                    const formattedLeagueData = preFormatRaceData(leagueData);
                    
                    prompt += `
                        LEAGUE CONTEXT (add 4–8 sentences as a second section):

                        RULES:
                        - Reference championship standings and trends over time (snapshot).
                        - Identify at least one battle or shift in momentum.
                        - If season is complete:
                        - Congratulate the champion
                        - Reflect on defining moments or rivalries
                        - If season is ongoing:
                        - Preview upcoming races creatively (not just listing tracks)
                        - Suggest who might gain/lose ground and why

                        LEAGUE DATA:
                        ${JSON.stringify(formattedLeagueData)}
                        `;
                }
                
                const result = await _.get(this).aiChat.sendMessage(prompt);
                const { text } = await this.processGeminiResponse(result.response);
                
                // Guard against empty responses
                if (!text || text.trim() === '') {
                    console.error('Gemini returned empty response for race summary');
                    _.get(this).generalChat.send("I tried to summarize that race but came up empty. Try again?");
                    return;
                }
                
                _.get(this).generalChat.send(text);
            }catch(err){
              this._errorHandler(err);
            }
        }

        async sendLeagueRecap(){
            try {
                const leagueDetails = await fetch(process.env.SKIDMARK_API + `/leagues/get/stats/?id=28`);
                const leagueData = await leagueDetails.json();
                let prompt = "I am sending you a json object at the end of this prompt, representing the current state of the Skidmark Tour Racing League. "
                    + "We are currently entering the final week of the season, and there are five different contenders for second place in the standings. "
                    + "In this json object, 'scoreboard_entries' represents the current standings, and 'snapshot' represents how the standings have progressed throughout the season. "
                    + "Pretend that you are writing a column for the local newspaper, and provide an original and dramatic summary of the current standings, as well as the season as a whole. "
                    + "We are currently entering the final week of the season, and I need you to provide a summary of the current standings. "
                    + "This league races the MCR S2000 car, a part of the P4 class, and the final race will take place at Laguna Seca."

                    + JSON.stringify(leagueData);
                
                const result = await _.get(this).aiChat.sendMessage(prompt);
                const response = result.response;
                const text = response.text();
                _.get(this).generalChat.send(text);
            }catch(err){
              this._errorHandler(err);
            }
        }
    }
    return SkidmarkBot;
})();