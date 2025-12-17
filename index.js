// index.js
// Bot de Ranking Financeiro para GTA RP
// Discord.js v14 + SQLite

require('dotenv').config();
const { Client, GatewayIntentBits, SlashCommandBuilder, REST, Routes, PermissionFlagsBits } = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// ---------- CLIENT ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---------- DATABASE ----------
const db = new sqlite3.Database('./ranking.db');

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS ranking (
    userId TEXT PRIMARY KEY,
    username TEXT,
    money INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
  )`);
});

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking financeiro'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adiciona dinheiro a um usuário')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(opt => opt.setName('valor').setDescription('Valor a adicionar').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define um valor fixo para o usuário')
    .addUserOption(opt => opt.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(opt => opt.setName('valor').setDescription('Valor').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('resetranking')
    .setDescription('Reseta todo o ranking')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// ---------- REGISTER COMMANDS ----------
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log(`Bot online como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  if (commandName === 'ranking') {
    db.all('SELECT * FROM ranking ORDER BY money DESC', [], (err, rows) => {
      if (!rows || rows.length === 0) {
        return interaction.reply('📭 Ranking vazio no momento.');
      }

      let msg = '🏆 **RANKING FINANCEIRO — GTA RP**\n\n';
      rows.forEach((r, i) => {
        msg += `${i + 1}️⃣ ${r.username} — R$ ${r.money.toLocaleString('pt-BR')}\n`;
      });

      interaction.reply(msg);
    });
  }

  if (commandName === 'adddinheiro') {
    const user = interaction.options.getUser('usuario');
    const valor = interaction.options.getInteger('valor');

    db.get('SELECT * FROM ranking WHERE userId = ?', [user.id], (err, row) => {
      if (row) {
        const novoValor = row.money + valor;
        db.run('UPDATE ranking SET money = ? WHERE userId = ?', [novoValor, user.id]);
      } else {
        db.run('INSERT INTO ranking VALUES (?, ?, ?)', [user.id, user.username, valor]);
      }
      interaction.reply(`💰 Valor atualizado para **${user.username}**.`);
    });
  }

  if (commandName === 'setdinheiro') {
    const user = interaction.options.getUser('usuario');
    const valor = interaction.options.getInteger('valor');

    db.run(
      'INSERT INTO ranking (userId, username, money) VALUES (?, ?, ?) ON CONFLICT(userId) DO UPDATE SET money = excluded.money',
      [user.id, user.username, valor]
    );

    interaction.reply(`✏️ Valor definido para **${user.username}**.`);
  }

  if (commandName === 'resetranking') {
    db.run('DELETE FROM ranking');
    interaction.reply('♻️ Ranking resetado com sucesso.');
  }
});

client.login(process.env.TOKEN);
