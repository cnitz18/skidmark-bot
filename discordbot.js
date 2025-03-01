const { Client, GatewayIntentBits } = require('discord.js');
const { GoogleGenerativeAI } = require("@google/generative-ai");
// Initialize dotenv
require('dotenv').config();

const BOT_USER_ID = '@' + process.env.DISCORD_BOT_ID;
const GENERAL_CHANNEL = process.env.DISCORD_GENERAL_CHANNEL;
const LEAGUE_CHANNEL = process.env.DISCORD_LEAGUE_CHANNEL;

const express = require('express')
const app = express()
const port = 3000
const botClient = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)

// Discord.js versions ^13.0 require us to explicitly define client intents
let general_chat, league_chat;

function setupBot() {
  botClient.on('ready', () => {
    console.log(`Logged in as ${botClient.user.tag}!`);
    general_chat = botClient.channels.cache.get(GENERAL_CHANNEL);
    league_chat = botClient.channels.cache.get(LEAGUE_CHANNEL);
   });
   
   // Log In our bot
   botClient.login(process.env.BOT_CLIENT_TOKEN);
   
   botClient.on('messageCreate', msg => {
       // You can view the msg object here with 
        if (msg.content === 'Hello') {
          msg.reply(`Hello ${msg.author.username}`);
        }
        else if( msg.content.indexOf(BOT_USER_ID) !== -1 ){
         geminiGeneralChat(msg.content);
        }
   });
}

function setupAPI(){
  app.post('/leagueupdate', (req, res) => {
    league_chat.send("League Update!!")
    geminiMessage();
    res.send('Done');
  })
  
  app.post('/generalrotation', (req,res) => {
    general_chat.send("General Update!!");
    res.send('Done');
  })
  
  app.listen(port, () => {
    console.log(`Chorley Bot listening on port ${port}`)
  })
}

async function geminiMessage(input){
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });

  const prompt = "Briefly describe a multi-car wreck in a junior racing series from the 1970s. Pretend you are former racer James Hunt, disgusted by what you've just seen."

  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  league_chat.send(text)
}
async function geminiGeneralChat(usermsg){
  const model = genAI.getGenerativeModel({ model: "gemini-pro" });
  const prompt = "You have the personality of 1976 F1 World Champion James Hunt, and are in a bad mood."
  +"A user has sent you the following message in quotes, be open to conversation but brief and blunt:\"" + usermsg + "\"";

  try{
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();
    general_chat.send(text);
  }catch(err){
    console.log("Gemini Error:")
    //  if( err. )
    console.error(err)
  }
}

function main(){
  setupBot();
  setupAPI();
}
main();