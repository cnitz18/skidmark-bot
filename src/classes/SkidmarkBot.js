const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const DatabaseController = require('./DatabaseController');
const { tools } = require('./GeminiFunctions');
const { formatLapTime } = require('../utils/formatters');

const BOT_USER_ID = '@' + process.env.DISCORD_BOT_ID;
const MODEL = "gemini-2.5-flash";

const SYSTEM_INSTRUCTIONS = 
    "Your name is Chorley, and you are a bot designed to chat with users in a Discord channel for a simulator racing league. " +
    "Your first name is Lee, but you generally don't refer to yourself by that name. " +
    "You are powered by the Gemini API, which uses a generative model to create human-like responses. " +   
    "You are designed to respond to messages that mention you, and you are programmed to respond to specific prompts. " +
    "Each message you receive comes from a user in that chat, and is structured the following: 'username >> message'. Do not structure your messages in the same way. " +
    "Remember who sends what message to you based on the username from the beginning of every message. " +
    "You have the personality of 1976 F1 World Champion James Hunt, and are in a bad mood. " +
    "You are disgusted by the state of modern racing, and you are very opinionated. " +
    "You have access to a database with detailed racing league information including race results, driver statistics, championship standings, and lap times. " +
    "When users ask about race data, league standings, or driver performance, use the available functions to look up accurate information. " +
    "IMPORTANT: All lap times, sector times, and timing data in the database are stored in MILLISECONDS. When displaying times to users, you MUST use the formatLapTime function to convert them to human-readable format (e.g., 83456ms becomes '1:23.456'). Never show raw millisecond values to users. " +
    "A user has sent you the following message, be open to conversation but brief and blunt (unless you are summarizing a race for us).";

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

        async geminiGeneralChat(username,usermsg,channelId){
            try {
                const chatChannel = _.get(this).botClient.channels.cache.get(channelId);
                const result = await _.get(this).aiChat.sendMessage(username + " >> " + usermsg);
                let response = result.response;
                
                // Check if Gemini wants to call function(s)
                let functionCalls = response.functionCalls();
                
                if (functionCalls && functionCalls.length > 0) {
                    // Send the initial "thinking" response to Discord first
                    let initialText = response.text();
                    if (initialText) {
                        initialText = initialText.replace(/"/g,""); // remove excess quotes
                        await chatChannel.send(initialText);
                    }
                    
                    console.log(`${functionCalls.length} function call(s) requested: ${functionCalls.map(fc => fc.name).join(", ")}`);
                    
                    // Execute all function calls in parallel for speed
                    const functionResponses = await Promise.all(
                        functionCalls.map(async (functionCall) => {
                            console.log(`  Executing: ${functionCall.name}(${JSON.stringify(functionCall.args)})`);
                            const result = await this.executeFunction(functionCall.name, functionCall.args);
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
                    
                    console.log(`  All functions completed, sending results back to Gemini`);
                    
                    // Send all function results back to Gemini
                    const result2 = await _.get(this).aiChat.sendMessage(functionResponses);
                    response = result2.response;
                    
                    // Send the final response with function results
                    let finalText = response.text();
                    finalText = finalText.replace(/"/g,""); // remove excess quotes in string
                    await chatChannel.send(finalText);
                } else {
                    // No function calls, just send the response
                    let text = response.text();
                    text = text.replace(/"/g,""); // remove excess quotes in string
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
                let prompt = "I am sending you a json object with this prompt, representing the results of a recent race for the Skidmark Tour Racing League. "
                    + "Please provide an original and dramatic summary no fewer than four sentences."
                    + "Be sure to mention the track and vehicle classes, as well as the end_time field (converted from epoch to central time):" + JSON.stringify(raceData);
                
                if( withLeague && raceData?.race?.league ){
                    // add league info
                    const leagueDetails = await fetch(process.env.SKIDMARK_API + `/leagues/get/stats/?id=${raceData?.race?.league}`);
                    const leagueData = await leagueDetails.json();
                    prompt += ". Next, here are the league details for the league that hosted this race. "
                        + "The 'scoreboard_entries' array outlines the current standings. "
                        + "The 'snapshot' array outlines how the standings have progressed throughout the season from week to week, make at least one reference to how the season is developing. "
                        + "The 'schedule' array is a list of all the dates and tracks the league will be racing at this season. "
                        + "If all races in the 'schedule' array have already taken place, then the league is complete. Congratulate the champion, summarize the season, and make note of any particularly close battles. "
                        + "If not all races in the 'schedule' array have taken place yet, then give us a look ahead to future races in a creative way."
                        + "You could make a note of any particularly close battles for position in the standings (if applicable), as well as any upcoming tracks that may shake up the order. Or any other ideas you can think of. "
                        + "Include a separate section of no greater than 8 and no less than 4 sentences summarizing this information in your summary: " 
                        + JSON.stringify(leagueData);
                }
                const result = await _.get(this).aiChat.sendMessage(prompt);
                const response = result.response;
                const text = response.text();
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