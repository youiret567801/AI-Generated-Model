const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField } = require('discord.js');
const fs = require('fs');
const math = require('mathjs');
const seedrandom = require('seedrandom');
const config = require('./config.json');

// --- File Paths for Persistent Storage ---
const DATA_FILE = './data.json';
const RATINGS_FILE = './ratingsData.json';
const CONVERSATION_FILE = './conversations.json';
const MARKOV_FILE = './markovData.json';  // For persisting Markov chain

// --- Data Variables ---
let messagesData = [];
let ratingsData = [];
let conversations = [];
let markovChain = {};  // Custom Markov chain data

// --- Load Data from Files ---
function loadData() {
  try {
    if (fs.existsSync(DATA_FILE))
      messagesData = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || [];
    if (fs.existsSync(RATINGS_FILE)) {
      ratingsData = JSON.parse(fs.readFileSync(RATINGS_FILE, 'utf8')) || [];
      if (!Array.isArray(ratingsData)) ratingsData = [];
    }
    if (fs.existsSync(CONVERSATION_FILE))
      conversations = JSON.parse(fs.readFileSync(CONVERSATION_FILE, 'utf8')) || [];
    if (fs.existsSync(MARKOV_FILE))
      markovChain = JSON.parse(fs.readFileSync(MARKOV_FILE, 'utf8')) || {};
  } catch (err) {
    console.error("Error loading data:", err);
  }
}

// --- Save Data to Files ---
function saveData() {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(messagesData, null, 2));
    fs.writeFileSync(RATINGS_FILE, JSON.stringify(ratingsData, null, 2));
    fs.writeFileSync(CONVERSATION_FILE, JSON.stringify(conversations, null, 2));
    fs.writeFileSync(MARKOV_FILE, JSON.stringify(markovChain, null, 2));
  } catch (err) {
    console.error("Error saving data:", err);
  }
}

// --- Save Message Data ---
function saveMessageData(username, content, timestamp) {
  messagesData.push({ username, content, timestamp });
  saveData();
}

// --- Markov Chain Functions ---
function trainMarkovChain(input) {
  const words = input.split(' ');
  for (let i = 0; i < words.length - 1; i++) {
    const word = words[i];
    const nextWord = words[i + 1];
    if (!markovChain[word]) {
      markovChain[word] = [];
    }
    markovChain[word].push(nextWord);
  }
  saveData();
}

function generateMarkovResponse(input, seed = Date.now().toString()) {
  const rng = seedrandom(seed);
  const words = input.split(' ');
  let responseWords = words.slice(0, 3); // Start with first 3 words
  while (responseWords.length < 50) { // Limit to 50 words total
    const lastWord = responseWords[responseWords.length - 1];
    if (!markovChain[lastWord] || markovChain[lastWord].length === 0) break;
    const possibleNext = markovChain[lastWord];
    const index = Math.floor(rng() * possibleNext.length);
    responseWords.push(possibleNext[index]);
  }
  return responseWords.join(' ');
}

// --- Remove Messages Containing a Phrase ---
// Removes any entries in messagesData, conversations, ratingsData, and markovChain that contain the phrase.
function removeMessagesContaining(phrase) {
  messagesData = messagesData.filter(entry => entry.content && !entry.content.includes(phrase));
  conversations = conversations.filter(entry =>
    entry.original && entry.reply && 
    !entry.original.includes(phrase) && !entry.reply.includes(phrase)
  );
  ratingsData = ratingsData.filter(entry => !entry.message || !entry.message.includes(phrase));

  Object.keys(markovChain).forEach(word => {
    markovChain[word] = markovChain[word].filter(nextWord => nextWord && !nextWord.includes(phrase));
    if (markovChain[word].length === 0) delete markovChain[word];
  });

  saveData();
}

// --- Bot Command Information ---
const botInfo = `
**Discord AI Bot – Enhanced Learning & Response System**

Features:
• **Markov Chain Learning**:
  - Learns from every message in the designated channel.
  - Persists learned data (messages & Markov chain) across restarts.
  - Generates responses based on weighted word transitions using seeded randomness.
  - Limits generated responses to 50 words.

• **Conversation Context**:
  - Tracks conversation pairs (original message → reply) for context-aware responses.

• **Math Capabilities**:
  - Supports arithmetic commands: \`-add\`, \`-sub\`, \`-mul\`, \`-div\`.
  - Use \`-calc\` to evaluate expressions (e.g., \`5+5\`, \`10/2\`, \`4^3\`).

• **Timestamp**:
  - Provides the current Unix timestamp with \`-timestamp\`.

• **Reactions & Feedback**:
  - Automatically reacts with 👍 and 👎.
  - Saves reaction feedback to improve response quality over time.

• **Administration**:
  - Admins can remove all entries containing a phrase using \`-rm <phrase>\`.

Usage:
- Commands work only in the designated bot channel.
- The bot learns from every message in that channel.
- Enjoy interacting and help improve the AI with your feedback!
`;

// --- Command Prefix ---
const prefix = "-";

// --- Initialize Discord Client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  loadData();
});

// Utility to sanitize text (prevent unwanted pings)
function sanitize(text) {
  return text.replace(/@/g, '@\u200b');
}

// --- Listen for Messages ---
client.on('messageCreate', async message => {
  try {
    if (message.author.id==='1345231962734071808') return;
    if (message.channel.id !== config.CHANNEL_ID) return;

    // Process admin command: -rm <phrase>
    if (message.content.startsWith("-rm")) {
      if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return message.reply("❌ You need **Administrator** permissions to use this command.");
      }
      const phrase = message.content.slice(3).trim();
      if (!phrase) return message.reply("Please provide a phrase to remove.");
      removeMessagesContaining(phrase);
      return message.reply(`✅ Removed all entries containing: **"${phrase}"**`);
    }

    // Process commands starting with prefix "-"
    if (message.content.startsWith(prefix)) {
      const args = message.content.slice(prefix.length).trim().split(/\s+/);
      const command = args.shift().toLowerCase();

      if (command === "info") {
        const embed = new EmbedBuilder()
          .setTitle("Bot Information")
          .setDescription(botInfo)
          .setColor(0x00FF00)
          .setTimestamp();
        return message.channel.send({ embeds: [embed] });
      } else if (["add", "sub", "mul", "div"].includes(command)) {
        if (args.length < 2) {
          return message.reply("Please provide two numbers. Example: `-add 3 5`");
        }
        const num1 = parseFloat(args[0]);
        const num2 = parseFloat(args[1]);
        let result;
        try {
          switch (command) {
            case "add":
              result = math.add(num1, num2);
              break;
            case "sub":
              result = math.subtract(num1, num2);
              break;
            case "mul":
              result = math.multiply(num1, num2);
              break;
            case "div":
              result = math.divide(num1, num2);
              break;
          }
          return message.reply(`Result: ${result}`);
        } catch (err) {
          return message.reply("Error processing your math request.");
        }
      } else if (command === "calc") {
        const expression = args.join(" ");
        try {
          const result = math.evaluate(expression);
          return message.reply(`Result: ${result}`);
        } catch (err) {
          return message.reply("Error processing your expression. Make sure it is valid.");
        }
      } else if (command === "timestamp") {
        const unixTimestamp = Math.floor(Date.now() / 1000);
        return message.reply(`Current Unix Timestamp: ${unixTimestamp}`);
      } else {
        return message.reply("Unknown command. Try `-info` for a list of available commands.");
      }
    }

    // For non-command messages, learn and auto-reply.
    saveMessageData(message.author.username, message.content, message.createdTimestamp);
    trainMarkovChain(message.content);

    const seed = Date.now().toString();
    let generatedResponse = generateMarkovResponse(message.content, seed);
    if (!generatedResponse || generatedResponse.trim() === "") {
      generatedResponse = message.content;
    }

    if (message.reference) {
      const originalMessage = await message.channel.messages.fetch(message.reference.messageId);
      if (originalMessage) {
        conversations.push({
          original: originalMessage.content,
          reply: message.content,
          timestamp: message.createdTimestamp
        });
        saveData();
      }
    }

    const sanitizedUsername = sanitize(message.author.username);
    const sanitizedResponse = sanitize(generatedResponse);
    const sanitizedOriginal = sanitize(message.content)
    const botMessage = await message.reply({content: sanitizedResponse});
    await botMessage.react('👍');
    await botMessage.react('👎');
  } catch (error) {
    console.error("Error processing message:", error);
  }
});

// --- Check Reactions on Last 5 Bot Messages ---
async function checkReactions(channel) {
  try {
    const fetchedMessages = await channel.messages.fetch({ limit: 50 });
    const botMessages = fetchedMessages.filter(m => m.author.id === client.user.id);
    const last5 = botMessages.first(5);

    let feedback = [];
    for (const m of last5) {
      const thumbsUp = m.reactions.cache.get('👍') ? m.reactions.cache.get('👍').count : 0;
      const thumbsDown = m.reactions.cache.get('👎') ? m.reactions.cache.get('👎').count : 0;
      feedback.push({ message: m.content, thumbsUp, thumbsDown });
    }
    console.log('Reaction feedback on last 5 messages:', feedback);
    ratingsData.push(...feedback);
    saveData();
  } catch (err) {
    console.error("Error checking reactions:", err);
  }
}

client.login(config.BOT_TOKEN);
