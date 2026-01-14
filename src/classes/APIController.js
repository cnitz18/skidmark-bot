const express = require('express');
const cors = require('cors');
const PORT = process.env.NODE_ENV == 'production' || process.env.NODE_ENV == 'dev' ? 80 : 3001

// Simple in-memory log buffer for console viewing
const LOG_BUFFER_SIZE = 100;
const logBuffer = [];

const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

const addToLogBuffer = (level, ...args) => {
    const message = args.map(arg => 
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');
    
    logBuffer.push({
        timestamp: new Date().toISOString(),
        level,
        message
    });
    
    // Keep buffer at max size
    while (logBuffer.length > LOG_BUFFER_SIZE) {
        logBuffer.shift();
    }
};

// Override console methods to capture logs
console.log = (...args) => {
    addToLogBuffer('info', ...args);
    originalConsoleLog.apply(console, args);
};

console.error = (...args) => {
    addToLogBuffer('error', ...args);
    originalConsoleError.apply(console, args);
};

console.warn = (...args) => {
    addToLogBuffer('warn', ...args);
    originalConsoleWarn.apply(console, args);
};

module.exports = (() => {
    _ = new WeakMap();
    class APIController {
        constructor(bot) {
            if( !bot || bot.constructor.name !== 'SkidmarkBot' ){
                throw new Error('APIController requires a SkidmarkBot instance');
            }
            let obj = {
                app : express(),
                bot,
                isInit : false,
                startTime: Date.now(),
                lastError: null,
                consoleChat: null  // Separate chat instance for console
            }
            _.set(this, obj);
        }

        init(){
            if( !_.get(this.isInit) ){
                // Enable CORS for console access
                _.get(this).app.use(cors());
                _.get(this).app.use(express.json());

                // Health check - no auth required
                _.get(this).app.get('/healthcheck', (req,res) => {
                    res.send('OK');
                });

                // Status endpoint - no auth required for admin console
                _.get(this).app.get('/status', (req, res) => {
                    this.handleStatus(req, res, this);
                });

                // Console endpoints - no auth for admin console
                _.get(this).app.post('/console/chat', (req, res) => {
                    this.handleConsoleChat(req, res, this);
                });

                _.get(this).app.post('/console/reset', (req, res) => {
                    this.handleConsoleReset(req, res, this);
                });

                _.get(this).app.get('/console/logs', (req, res) => {
                    this.handleConsoleLogs(req, res, this);
                });

                _.get(this).app.post('/status/test-model', (req, res) => {
                    this.handleTestModel(req, res, this);
                });

                // Auth middleware for protected routes
                _.get(this).app.use((req,res,next) => {
                    if( req.headers['x-api-key'] === process.env.BOT_SERVER_TOKEN ){
                      next();
                    }else{
                      res.status(401).send("Unauthorized");
                    }
                  })
                
                _.get(this).app.post('/racesummary/:raceId', (req, res) => {
                    this.handleRaceSummary(req, res, this);
                })
                _.get(this).app.post('/leagueupdate',(req,res) =>  this.handleLeagueUpdate(req,res,this))

                _.get(this).app.post('/leaguerecap', (req,res) => this.handleLeagueRecap(req,res,this))
                  
                _.get(this).app.post('/generalrotation', (req,res) => {
                    _.get(this).bot.chat.send("General message");
                    res.send('Done');
                })
                _.get(this).app.listen(PORT, () => {
                    console.log(`Chorley Bot listening on port ${PORT}`)
                })
                _.get(this).isInit = true;
            }
        }

        // Status endpoint handler
        handleStatus(req, res, ctx) {
            const privateData = _.get(ctx);
            const uptime = Math.floor((Date.now() - privateData.startTime) / 1000);
            
            res.json({
                status: 'online',
                uptime,
                environment: process.env.NODE_ENV || 'development',
                model: 'gemini-2.5-flash',
                discordConnected: privateData.bot?.generalChat ? true : false,
                lastError: privateData.lastError
            });
        }

        // Console chat handler - chat without posting to Discord
        async handleConsoleChat(req, res, ctx) {
            try {
                const { message, username = 'Admin' } = req.body;
                
                if (!message) {
                    return res.status(400).json({ error: 'Message is required' });
                }

                const privateData = _.get(ctx);
                
                // Initialize console chat if needed
                if (!privateData.consoleChat) {
                    privateData.consoleChat = privateData.bot.getModel().startChat();
                }

                const result = await privateData.consoleChat.sendMessage(`${username} >> ${message}`);
                let response = result.response;
                let functionsCalled = [];
                
                // Handle function calls
                let functionCalls = response.functionCalls();
                
                if (functionCalls && functionCalls.length > 0) {
                    functionsCalled = functionCalls.map(fc => fc.name);
                    
                    // Execute all function calls
                    const functionResponses = await Promise.all(
                        functionCalls.map(async (functionCall) => {
                            console.log(`Console: Executing ${functionCall.name}`);
                            const result = await privateData.bot.executeFunction(functionCall.name, functionCall.args);
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
                    
                    // Get final response with function results
                    const result2 = await privateData.consoleChat.sendMessage(functionResponses);
                    response = result2.response;
                }

                let text = response.text();
                text = text.replace(/"/g, ''); // Remove excess quotes
                
                res.json({ 
                    response: text,
                    functionsCalled
                });
            } catch (err) {
                console.error('Console chat error:', err);
                _.get(ctx).lastError = { message: err.message, timestamp: new Date().toISOString() };
                res.status(500).json({ error: err.message });
            }
        }

        // Reset console conversation
        handleConsoleReset(req, res, ctx) {
            const privateData = _.get(ctx);
            privateData.consoleChat = privateData.bot.getModel().startChat();
            console.log('Console conversation reset');
            res.json({ success: true, message: 'Conversation reset' });
        }

        // Get logs
        handleConsoleLogs(req, res, ctx) {
            const limit = parseInt(req.query.limit) || 50;
            const logs = logBuffer.slice(-limit);
            res.json({ logs });
        }

        // Test model health
        async handleTestModel(req, res, ctx) {
            try {
                const privateData = _.get(ctx);
                const testChat = privateData.bot.getModel().startChat();
                const result = await testChat.sendMessage("Reply with just the word 'OK' to confirm you're working.");
                const response = result.response.text();
                
                res.json({ 
                    success: response.toLowerCase().includes('ok'),
                    response: response.substring(0, 100)
                });
            } catch (err) {
                console.error('Model test failed:', err);
                _.get(ctx).lastError = { message: err.message, timestamp: new Date().toISOString() };
                res.json({ success: false, error: err.message });
            }
        }

        handleRaceSummary(request,response,ctx){
            const withLeague = request.query['with-league'] === 'true'
            console.log('handle race summary:',request.params,withLeague);
            _.get(ctx).bot.sendRaceSummary(request.params.raceId,withLeague);
            response.send('Done');
        }

        handleLeagueRecap(request,response,ctx){
            _.get(ctx).bot.sendLeagueRecap();
            response.send('Done');
        }
    }
    return APIController;
})();