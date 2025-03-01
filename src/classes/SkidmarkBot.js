const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const BOT_USER_ID = '@' + process.env.DISCORD_BOT_ID;
const CHANNEL_ID = process.env.NODE_ENV == 'production' ? 
    process.env.DISCORD_GENERAL_CHANNEL : process.env.DISCORD_DEV_CHANNEL;

module.exports = (() => {
    _ = new WeakMap();
    class SkidmarkBot {
        constructor() {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

            let obj = {
                botClient : new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }),
                model : genAI.getGenerativeModel({ model: "gemini-1.5-pro" }),
                genAI,
                isInit : false
            }
            _.set(this, obj);
        }

        get chat(){
            return _.get(this).chat;
        }

        init(){
            if(!_.get(this).isInit){
                _.get(this).botClient.on('ready', () => {
                    console.log(`Logged in as ${_.get(this).botClient.user.tag}!`);
                    _.get(this).chat = _.get(this).botClient.channels.cache.get(CHANNEL_ID); 
                });
                   
                // Log In our bot
                _.get(this).botClient.login(process.env.BOT_CLIENT_TOKEN);
                   
                _.get(this).botClient.on('messageCreate', msg => {
                    if( msg.channelId === CHANNEL_ID && 
                        msg.author.id !== _.get(this).botClient.user.id &&
                        msg.content.indexOf(BOT_USER_ID) !== -1 ){
                    // You can view the msg object here with 
                        if (msg.content === 'Hello') {
                            msg.reply(`Hello ${msg.author.username}`);
                        }
                        else if( msg.content.indexOf(BOT_USER_ID) !== -1 ){
                            this.geminiGeneralChat(msg.content);
                        }
                    }
                });
            }else{
                console.error('Bot already initialized');
            }
            _.get(this).isInit = true;
        }
        
        _errorHandler(err){
            console.log("Gemini Error:");
            console.error(err);
            _.get(this).chat.send("Sorry, I'm having technical difficulties at the moment.");
        }

        async geminiGeneralChat(usermsg){
            try {
              const prompt = "You have the personality of 1976 F1 World Champion James Hunt, and are in a bad mood."
                +"A user has sent you the following message in quotes, be open to conversation but brief and blunt:\"" + usermsg + "\"";
              
              const result = await _.get(this).model.generateContent(prompt);
              const response = result.response;
              
              let text = response.text();
              text = text.replace("\"",""); // remove excess quotes in string
              _.get(this).chat.send(text);
            } catch(err) {
                this._errorHandler(err);
            }
        }
        async sendLeagueUpdateMessage(){
            try {            
              const prompt = "Briefly describe a multi-car wreck in a junior racing series from the 1970s. Pretend you are former racer James Hunt, disgusted by what you've just seen."
              const result = await _.get(this).model.generateContent(prompt);

              const response = result.response;
              const text = response.text();
              _.get(this).chat.send(text);
            } catch(err) {
              this._errorHandler(err);
            }
          }
    }
    return SkidmarkBot;
})();