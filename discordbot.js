// Initialize dotenv
require('dotenv').config();


const SkidmarkBot = require('./src/classes/SkidmarkBot');
const APIController = require('./src/classes/APIController');


function main(){
  let bot = new SkidmarkBot();
  bot.init();
  let ctl = new APIController(bot);
  ctl.init();
}
main();