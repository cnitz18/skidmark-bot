const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");

const BOT_USER_ID = '@' + process.env.DISCORD_BOT_ID;
const CHANNEL_ID = process.env.NODE_ENV == 'production' ? 
    process.env.DISCORD_GENERAL_CHANNEL : process.env.DISCORD_DEV_CHANNEL;
const MODEL = "gemini-2.0-flash";

const SYSTEM_INSTRUCTIONS = 
    "Your name is Chorley, and you are a bot designed to chat with users in a Discord channel for a simulator racing league. " +
    "Your first name is Lee, but you generally don't refer to yourself by that name. " +
    "You are powered by the Gemini API, which uses a generative model to create human-like responses. " +   
    "You are designed to respond to messages that mention you, and you are programmed to respond to specific prompts. " +
    "Each message you receive comes from a user in that chat, and is structured the following: 'username >> message'. " +
    "Remember who sends what message to you based on the username from the beginning of every message. " +
    "You have the personality of 1976 F1 World Champion James Hunt, and are in a bad mood. " +
    "You are disgusted by the state of modern racing, and you are very opinionated. " +
    "A user has sent you the following message, be open to conversation but brief and blunt.";

module.exports = (() => {
    _ = new WeakMap();
    class SkidmarkBot {
        constructor() {
            const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

            let obj = {
                botClient : new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] }),
                model : genAI.getGenerativeModel({ model: MODEL, systemInstruction: SYSTEM_INSTRUCTIONS }),
                genAI,
                isInit : false
            }
            obj.aiChat = obj.model.startChat();
            _.set(this, obj);
        }

        get discordChat(){
            return _.get(this).discordChat;
        }

        init(){
            if(!_.get(this).isInit){
                _.get(this).botClient.on('ready', () => {
                    console.log(`Logged in as ${_.get(this).botClient.user.tag}!`);
                    _.get(this).discordChat = _.get(this).botClient.channels.cache.get(CHANNEL_ID); 
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
                            this.geminiGeneralChat(msg.author.username, msg.content);
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
            _.get(this).discordChat.send("Sorry, I'm having technical difficulties at the moment.");
        }

        async geminiGeneralChat(username,usermsg){
            try {
              const result = await _.get(this).aiChat.sendMessage(username + " >> " + usermsg);
              const response = result.response;
              
              let text = response.text();
              text = text.replace("\"",""); // remove excess quotes in string
              _.get(this).discordChat.send(text);
            } catch(err) {
                this._errorHandler(err);
            }
        }
        async sendLeagueUpdateMessage(){
            try {            
              const prompt = "Briefly describe a multi-car wreck in a junior racing series from the 1970s. Pretend you are former racer James Hunt, disgusted by what you've just seen."
              const result = await _.get(this).aiChat.sendMessage(prompt);

              const response = result.response;
              const text = response.text();
              _.get(this).discordChat.send(text);
            } catch(err) {
              this._errorHandler(err);
            }
          }
    }
    return SkidmarkBot;
})();