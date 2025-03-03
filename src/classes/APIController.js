const express = require('express');
const PORT = process.env.NODE_ENV == 'production' ? 80 : 3001

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
                isInit : false
            }
            _.set(this, obj);
        }

        init(){
            if( !_.get(this.isInit) ){
                _.get(this).app.get('/healthcheck', (req,res) => {
                    res.send('OK');
                });

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

        handleLeagueUpdate(request,response,ctx){
            _.get(ctx).bot.sendLeagueUpdateMessage();
            response.send('Done');
        }

        handleRaceSummary(request,response,ctx){
            const withLeague = request.query['with-league'] === 'true'
            console.log('handle race summary:',request.params,withLeague);
            _.get(ctx).bot.sendRaceSummary(request.params.raceId,withLeague);
            response.send('Done');
        }
    }
    return APIController;
})();