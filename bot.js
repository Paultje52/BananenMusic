//Packages ** npm i -s discord.js opusscript ffmpeg ytdl-core request json-config-store **
const Discord = require("discord.js");
const ffmpeg = require("ffmpeg");
const ytdl = require("ytdl-core");
const request = require("request");
const database = require("json-config-store");

//Variables
const client = new Discord.Client();
client.queues = {};
client.ytapiToken = "YTAPITOKEN";
client.botToken = "BOTTOKEN";
client.database = new database({cwd: __dirname, configName: "data.json"});
let leaveCommand = false;
client.login(client.botToken);

//Ready
client.on("ready", () => {console.log("Ik ben online!")});

//Message
client.on("message", async (message) => {
  if (!client.database.get(`${message.guild.id}.role.dj`)) client.database.set(`${message.guild.id}.role.dj`, "dj");
  if (!client.database.get(`${message.guild.id}.prefix`)) client.database.set(`${message.guild.id}.prefix`, "m!");

  if (message.author.bot) return;
  if (message.channel.type === "dm") return message.channel.send("Je kan me niet in DM gebruiken!");
  let args = message.content.slice(client.database.get(`${message.guild.id}.prefix`).length).trim().split(/ +/g);
  let command = args.shift().toLowerCase();
  if (!message.content.toLowerCase().startsWith(client.database.get(`${message.guild.id}.prefix`))) return;
  if (!client.queues[message.guild.id]) client.queues[message.guild.id] = {playing: false};
  let queue = client.queues[message.guild.id];

  switch (command.toLowerCase()) {
    case "play":
      if (!message.member.voiceChannel) return message.reply("je moet eerst in een voiceChannel zitten!");
      if (!args[0]) return message.reply("geef een zoekterm of een url op!");
      if (args[0].toLowerCase().includes("list")) return message.reply("Sorry, maar momenteel worden playlisten niet ondersteund!");
      if (args[0].toLowerCase().startsWith("http://youtu.be") || args[0].toLowerCase().startsWith("http://www.youtu.be") || args[0].toLowerCase().startsWith("https://youtu.be") || args[0].toLowerCase().startsWith("https://www.youtu.be") || args[0].toLowerCase().startsWith("http://www.youtube.com") || args[0].toLowerCase().startsWith("http://youtube.com") || args[0].toLowerCase().startsWith("https://www.youtube.com") || args[0].toLowerCase().startsWith("https://youtube.com")) {
        await request({url: `https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${args[0].split("?v=").slice(1).join("")}&key=${client.ytapiToken}`, json: true}, async function(err, response, body) {
          if (err) {
            error(client, message, err);
          } else {
            if (body.pageInfo.totalResults === 0) {
              message.reply("Geen geldige video url opgegeven!");
            } else {
              let msg = await message.channel.send("Ik ben bezig met het afspelen...");
              let song = await createSong(body.items[0].snippet, "youtube", args.join(" "), message);
              if (queue.playing === false) {
                let connection = await message.member.voiceChannel.join();
                let queue = {
                  playing: true,
                  connection: connection,
                  loop: false,
                  dispatcher: undefined,
                  voiceChannel: {
                    name: message.member.voiceChannel.name,
                    id: message.member.voiceChannel.id
                  },
                  songs: [],
                  nowPlaying: {},
                  voteSkip: {
                    users: [],
                    total: 0
                  }
                }
                queue.songs.push(song);
                client.queues[message.guild.id] = queue;
                play(client, message, msg);
              } else {
                client.queues[message.guild.id].songs.push(song);
                msg.delete();
                message.channel.send(`**${song.songInfo.title}** is toegevoegd door **${song.author.username}**!`);
              }
            }
          }
        });
      } else {
        let start = Date.now();
        request({url: `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${args.join(" ")}&maxResults=5&key=${client.ytapiToken}`, json: true}, async function(err, response, body) {
          if (err) {
            error(client, message, err);
          } else {
            if (body.pageInfo.totalResults === 0) {
              message.reply("ik heb niets kunnen vinden!");
            } else {
              let results = body.items;
              let embed = new Discord.RichEmbed().setTitle("Kies!").setColor("#00ff00").setDescription(`1. ${results[0].snippet.title}\n2. ${results[1].snippet.title}\n3. ${results[2].snippet.title}\n4. ${results[3].snippet.title}\n5. ${results[4].snippet.title}`).setFooter(`Kies binnen 1 minuut! | Gevonden in ${(Date.now() - start)/1000} seconde`);
              let msg = await message.channel.send(embed);
              let collector = msg.createReactionCollector((reaction, user) => user.id === message.author.id, {time: 60000});
              collector.on("collect", async (r) => {
                let emoji;
                let e = r.emoji.name.split("")[0];
                if (e === "1") emoji = 1;
                else if (e === "2") emoji = 2;
                else if (e === "3") emoji = 3;
                else if (e === "4") emoji = 4;
                else if (e === "5") emoji = 5;
                else if (e === "❌") {
                  msg.delete();
                  return message.channel.send("Selectie geanuleerd!");
                } else return;
                collector.stop();
                let embed = new Discord.RichEmbed().setTitle("Bezig...").setColor("#00ff00").setDescription(`Je hebt gekozen voor **${emoji}. ${results[emoji-1].snippet.title}**! Ik ben bezig met het afspelen...`);
                msg.delete();
                let m = await message.channel.send(embed);
                let song = await createSong(body.items[emoji-1].snippet, "youtube", `https://www.youtube.com/watch?v=${results[emoji-1].id.videoId}`, message);
                if (queue.playing === false) {
                  let connection = await message.member.voiceChannel.join();
                  let queue = {
                    playing: true,
                    connection: connection,
                    loop: false,
                    dispatcher: undefined,
                    voiceChannel: {
                      name: message.member.voiceChannel.name,
                      id: message.member.voiceChannel.id
                    },
                    songs: [],
                    nowPlaying: {},
                    voteSkip: {
                      users: [],
                      total: 0
                    }
                  }
                  queue.songs.push(song);
                  client.queues[message.guild.id] = queue;
                  play(client, message, m);
                } else {
                  client.queues[message.guild.id].songs.push(song);
                  m.delete();
                  message.channel.send(`**${song.songInfo.title}** is toegevoegd door **${song.author.username}**!`);
                }
              });
              try {
                await msg.react("1⃣").catch();
                await msg.react("2⃣").catch();
                await msg.react("3⃣").catch();
                await msg.react("4⃣").catch();
                await msg.react("5⃣").catch();
                await msg.react("❌").catch();
              } catch(err) {}
            }
          }
        });
      }
      break;
    case "leave":
      if (client.queues[message.guild.id].connection) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name))) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben om mij te laten leaven!`);
        let leaveCommand = true;
        await message.member.voiceChannel.leave();
        if (queue.connection) {
          queue = {};
          client.queues[message.guild.id] === queue;
        }
        await message.reply("Ik ben de voiceChannel geleavd!");
        setTimeout(function() {let leaveCommand = false}, 1000);
      } else message.reply("ik zit nu niet in een voiceChannel!");
      break;
    case "join":
      if (client.queues[message.guild.id].connection) {
        message.reply("Ik zit al in een voiceChannel!");
      } else {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        let connection = await message.member.voiceChannel.join();
        let queue = {
          playing: false,
          connection: connection,
          loop: false,
          dispatcher: undefined,
          voiceChannel: {
            name: message.member.voiceChannel.name,
            id: message.member.voiceChannel.id
          },
          songs: [],
          nowPlaying: {}
        }
        client.queues[message.guild.id] = queue;
        message.reply("ik zit in je voiceChannel!");
      }
      break;
    case "loop":
      if (!client.queues[message.guild.id].connection) {
        message.reply("ik moet eerst muziek spelen voordat je de loop kan aanpassen!");
      } else {
        if (!args[0]) {
          message.reply("geef een loop type op! Kies uit **off**, **song** of **queue**");
        } else {
          if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
          if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
          if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name))) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben om de loop aan te passen!`);
          let a = true;
          if (args[0].toLowerCase() === "off") client.queues[message.guild.id].loop = false;
          else if (args[0].toLowerCase() === "song") client.queues[message.guild.id].loop = "song";
          else if (args[0].toLowerCase() === "queue") client.queues[message.guild.id].loop = "queue";
          else a = false;
          if (a === true) message.reply(`de loop staat nu op **${args[0].toLowerCase()}**!`);
          else message.reply("kies uit **of**, **song** of **queue**!");
        }
      }
      break;
    case "np":
      if (!client.queues[message.guild.id].nowPlaying) {
        message.reply("ik speel momenteel niets!");
      } else {
        if (client.queues[message.guild.id].nowPlaying.songInfo.liveBroadcastContent === "live") message.channel.send({embed: new Discord.RichEmbed().setTitle("Now playing").setColor("#00ff00").setDescription(`Naam: **${client.queues[message.guild.id].nowPlaying.songInfo.title}**\nChannel: **${client.queues[message.guild.id].nowPlaying.songInfo.channelTitle}**\nLive **:white_check_mark:**`).setImage(client.queues[message.guild.id].nowPlaying.songInfo.thumbnail)});
        else message.channel.send({embed: new Discord.RichEmbed().setTitle("Now playing").setColor("#00ff00").setDescription(`Naam: **${client.queues[message.guild.id].nowPlaying.songInfo.title}**\nChannel: **${client.queues[message.guild.id].nowPlaying.songInfo.channelTitle}**\nLive **:x:**`).setImage(client.queues[message.guild.id].nowPlaying.songInfo.thumbnail)});
      }
      break;
    case "skip":
      if (queue.dispatcher) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name)) && message.author.id !== client.queues[message.guild.id].nowPlaying.author.id) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben of de song requester zijn om dit liedje te skippen! Je kan wel **${client.database.get(`${message.guild.id}.prefix`)}voteskip** doen om te voten om een liedje te skippen!`);
        let song = client.queues[message.guild.id].nowPlaying.songInfo.title;
        let dispatcher = client.queues[message.guild.id].dispatcher;
        dispatcher.end();
        message.reply(`ik heb het liedje **${client.queues[message.guild.id].nowPlaying.songInfo.title}** geskipt!`);
      } else message.reply("ik speel nu niets!");
      break;
    case "queue":
      if (queue.dispatcher) {
        let i;
        let queue = `__Queue van **${message.guild.name}**:__\n\n`;
        for (i = 0; i < client.queues[message.guild.id].songs.length; i++) {
          queue += `${i+1}. **${client.queues[message.guild.id].songs[i].songInfo.title}** aangevraagd door **${client.queues[message.guild.id].songs[i].author.username}**\n`;
        }
        message.channel.send(queue);
      } else message.reply("ik speel nu niets!");
      break;
    case "voteskip":
      if (queue.dispatcher) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (client.queues[message.guild.id].voteSkip.users.includes(message.author.id)) return message.reply("je hebt al gestemt!");
        if (client.queues[message.guild.id].songs[0].author.id === message.author.id) return message.reply("jij hebt dit liedje aangevraagd, dus jij kan gewoon normaal skippen!");
        client.queues[message.guild.id].voteSkip.users.push(message.author.id);
        client.queues[message.guild.id].voteSkip.total++;
        if (client.queues[message.guild.id].voteSkip.total >= Math.ceil(message.member.voiceChannel.members.size/2)) {
          client.queues[message.guild.id].voteSkip = {
            users: [],
            total: 0
          }
          let dispatcher = client.queues[message.guild.id].dispatcher;
          let song = client.queues[message.guild.id].nowPlaying.songInfo.title;
          let i;
          dispatcher.end();
          message.channel.send(`Het liedje **${song}** is geskipt!`);
        } else return message.channel.send(`Stem **${client.queues[message.guild.id].voteSkip.total}/${Math.ceil(message.member.voiceChannel.members.size/2)}** opgegeven! Er moeten nog **${Math.ceil(message.member.voiceChannel.members.size/2)-client.queues[message.guild.id].voteSkip.total}** mensen voten om te skippen!`);
      } else message.reply("ik speel nu niets!");
      break;
    case "volume":
      if (queue.dispatcher) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name)) && message.author.id !== client.queues[message.guild.id].nowPlaying.author.id) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben of de song requester zijn om de volume aan te passen!`);
        if (!args[0]) return message.reply("geef een nummer op tussen 1 en 100!");
        if (isNaN(Number(args[0]))) return message.reply("geef een nummer op tussen 1 en 100!");
        if (Number(args[0]) >= 100) return message.reply("geef een nummer op tussen 1 en 100!");
        if (Number(args[0]) <= 1) return message.reply("geef een nummer op tussen 1 en 100!");
        let dispatcher = client.queues[message.guild.id].dispatcher;
        dispatcher.setVolume(Number(args[0]));
        message.channel.send(`Het volume is aangepast naar **${Number(args[0])}**!`);
      } else message.reply("ik speel nu niets!");
      break;
    case "pause":
      if (queue.dispatcher) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name)) && message.author.id !== client.queues[message.guild.id].nowPlaying.author.id) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben of de song requester zijn om de player te pauzeren!`);
        let dispatcher = client.queues[message.guild.id].dispatcher;
        dispatcher.pause();
        message.channel.send("De player staat op **pauze**!");
      } else message.reply("ik speel nu niets!");
      break;
    case "resume":
      if (queue.dispatcher) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name)) && message.author.id !== client.queues[message.guild.id].nowPlaying.author.id) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben of de song requester zijn om de player verder te laten gaan!`);
        let dispatcher = client.queues[message.guild.id].dispatcher;
        dispatcher.resume();
        message.channel.send("De player gaat **verder**!");
      } else message.reply("ik speel nu niets!");
      break;
    case "help":
      message.channel.send(`**<>** is verplicht\n**[]** is optioneel\n\n\`${client.database.get(`${message.guild.id}.prefix`)}play <zoekterm/url>\` - Speel muziek af!\n\`${client.database.get(`${message.guild.id}.prefix`)}leave\` - Laat mij een voiceChannel leaven!\n\`${client.database.get(`${message.guild.id}.prefix`)}join\` - Laat mij een voiceChannel joinen!\n\`${client.database.get(`${message.guild.id}.prefix`)}loop <off/song/queue>\` - Zet een loop aan!\n\`${client.database.get(`${message.guild.id}.prefix`)}np\` - Kijk wat er nu speet!\n\`${client.database.get(`${message.guild.id}.prefix`)}skip\` - Skip een liedje!\n\`${client.database.get(`${message.guild.id}.prefix`)}queue\` - Bekijk de wachtrij!\n\`${client.database.get(`${message.guild.id}.prefix`)}voteskip\` - Vote om een liedje te skippen!\n\`${client.database.get(`${message.guild.id}.prefix`)}volume <volume>\` - Verander de volume\n\`${client.database.get(`${message.guild.id}.prefix`)}pause\` - Zet de player op pauze!\n\`${client.database.get(`${message.guild.id}.prefix`)}resume\` - Laat de player verder gaan!\n\`${client.database.get(`${message.guild.id}.prefix`)}help\` - Krijg hulp!\n\`${client.database.get(`${message.guild.id}.prefix`)}settings [key] [value]\` - Verander een setting!\n\`${client.database.get(`${message.guild.id}.prefix`)}stop\` - Laat mij stoppen met afspelen!`);
      break;
    case "settings":
      if (!args[0]) return message.channel.send(`Prefix: **${client.database.get(`${message.guild.id}.prefix`)}**\nDJ role: **${client.database.get(`${message.guild.id}.role.dj`)}**`);
      if (!args[1]) return message.channel.send(`Prefix: **${client.database.get(`${message.guild.id}.prefix`)}**\nDJ role: **${client.database.get(`${message.guild.id}.role.dj`)}**`);
      if (message.author.id !== message.guild.owner.id) return message.reply("je moet de guild owner zijn als je settings wilt veranderen!");
      if (args[0].toLowerCase() === "prefix") {
        client.database.set(`${message.guild.id}.prefix`, args[1]);
        message.reply(`de prefix is aangepast naar **${client.database.get(`${message.guild.id}.prefix`)}**!`);
      } else if (args[0].toLowerCase() === "dj" && args[1].toLowerCase() === "role") {
        if (!args[2]) return message.channel.send(`Prefix: **${client.database.get(`${message.guild.id}.prefix`)}**\nDJ role: **${client.database.get(`${message.guild.id}.role.dj`)}**`);
        try {
          args[2].split("<@&")[1].split(">")[0];
        } catch(err) {return message.reply("mention een DJ rol!")}
        let role = message.guild.roles.find("id", args[2].split("<@&")[1].split(">")[0]);
        if (!role) return message.reply("mention een DJ rol!");
        client.database.set(`${message.guild.id}.role.dj`, role.name);
        message.reply(`de dj rol is aangepast naar **${data.get(`${message.guild.id}.role.dj`)}**!`);
      } else return message.channel.send(`Prefix: **${client.database.get(`${message.guild.id}.prefix`)}**\nDJ role: **${client.database.get(`${message.guild.id}.role.dj`)}**`);
      break;
    case "stop":
      if (client.queues[message.guild.id].dispatcher) {
        if (!message.member.voiceChannel) return message.reply("je moet wel in een voiceChannel zitten!");
        if (message.member.voiceChannel.id !== queue.voiceChannel.id) return message.reply("jij zit niet bij mij in de voiceChannel!");
        if (!message.member.roles.some(r => [client.database.get(`${message.guild.id}.role.dj`)].includes(r.name))) return message.reply(`je moet de **${client.database.get(`${message.guild.id}.role.dj`)}** rol hebben om mij te laten leaven!`);
        let leaveCommand = true;
        await message.member.voiceChannel.leave();
        if (queue.connection) {
          queue = {};
          client.queues[message.guild.id] === queue;
        }
        await message.reply("ik heb de player gestopt en je voiceChannel geleavd!");
        setTimeout(function() {let leaveCommand = false}, 1000);
      } else message.reply("ik zit nu niet in een voiceChannel!");
      break;
    default: break;
  }
});

//Play function
async function play(client, message, msg) {
  if (!client.queues[message.guild.id].songs[0]) {
    client.queues[message.guild.id] = {playing: false};
    if (leaveCommand === false) return message.channel.send("De wachtrij is leeg, dus ik stop met afspelen!");
  }
  let dispatcher;
  if (client.queues[message.guild.id].songs[0].songInfo.liveBroadcastContent === "live") dispatcher = await client.queues[message.guild.id].connection.playStream(ytdl(client.queues[message.guild.id].songs[0].url, {audioonly: true}));
  else dispatcher = await client.queues[message.guild.id].connection.playStream(ytdl(client.queues[message.guild.id].songs[0].url, {audioonly: true, quality: "highestaudio"}));
  client.queues[message.guild.id].dispatcher = dispatcher;
  dispatcher.on("start", () => {
    if (msg) msg.delete();
    client.queues[message.guild.id].songs[0].started = true;
    client.queues[message.guild.id].nowPlaying = client.queues[message.guild.id].songs[0];
    message.channel.send(`Ik speel nu **${client.queues[message.guild.id].songs[0].songInfo.title}** voor **${client.queues[message.guild.id].songs[0].author.username}**!`);
  });
  dispatcher.on("error", (err) => {
    error(client, message, err);
    checkLoop(message);
  });
  dispatcher.on("end", (reason) => {
    checkLoop(message);
  });
}

//Error function
function error(client, message, e) {
  console.log(e);
  try {
    client.channels.find("id", "467650472635924490").send(`Er ging iets fout! Error: \`\`\`${e}\`\`\``);
  } catch(err) {}
}

//Create song function
function createSong(result, type, url, message) {
  return {
    type: type,
    url: url,
    started: false,
    author: {
      id: message.author.id,
      tag: message.author.tag,
      username: message.author.username
    },
    songInfo: {
      title: result.title,
      publishedAt: result.publishedAt,
      channelId: result.channelId,
      description: result.description,
      thumbnail: result.thumbnails.high.url,
      channelTitle: result.channelTitle,
      tags: result.tags,
      liveBroadcastContent: result.liveBroadcastContent
    },
    guild: {
      id: message.guild.id,
      name: message.guild.name
    }
  }
}

//Check loop
async function checkLoop(message) {
  if (client.queues[message.guild.id].loop === false) {
    client.queues[message.guild.id].songs.shift();
    play(client, message, undefined);
  } else if (client.queues[message.guild.id].loop === "song") {
    if (client.queues[message.guild.id].songs[0].started === true) {
      client.queues[message.guild.id].songs[0].started = false;
      let c = await client.channels.find("id", client.queues[message.guild.id].voiceChannel.id);
      await c.leave();
      let connection = await c.join();
      client.queues[message.guild.id].connection = connection;
      play(client, message, undefined);
    }
    else {
      message.channel.send(`Er ging iets fout voordat ik het liedje kon afspelen, dus ik skip het liedje **${client.queues[message.guild.id].songs[0].songInfo.title}**!`);
      client.queues[message.guild.id].songs.shift();
      play(client, message, undefined);
    }
  } else if (client.queues[message.guild.id].loop === "queue") {
    if (client.queues[message.guild.id].songs.length > 1) {
      client.queues[message.guild.id].songs.push(client.queues[message.guild.id].songs[0]);
      client.queues[message.guild.id].songs.shift();
      play(client, message, undefined);
    } else {
      if (client.queues[message.guild.id].songs[0].started === true) {
        client.queues[message.guild.id].songs[0].started = false;
        let c = await client.channels.find("id", client.queues[message.guild.id].voiceChannel.id);
        await c.leave();
        let connection = await c.join();
        client.queues[message.guild.id].connection = connection;
        play(client, message, undefined);
      }
      else {
        message.channel.send(`Er ging iets fout voordat ik het liedje kon afspelen, dus ik skip het liedje **${client.queues[message.guild.id].songs[0].songInfo.title}**!`);
        client.queues[message.guild.id].songs.shift();
        play(client, message, undefined);
      }
    }
  }
  return;
}
