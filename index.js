// index.js
// Bot de Ranking Financeiro GTA RP
// Discord.js v14 + SQLite
// Ranking semanal + Top 3 mensal acumulado

require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();

// ---------- CLIENT ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---------- DATABASE ----------
const db = new sqlite3.Database('./ranking.db');

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS ranking (
      userId TEXT PRIMARY KEY,
      username TEXT,
      money INTEGER
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ranking_mensal (
      userId TEXT PRIMARY KEY,
      username TEXT,
      money INTEGER
    )
  `);
});

// ---------- FORMATAR DINHEIRO ----------
function formatarDinheiro(valor) {
  return `R$ ${valor.toLocaleString('pt-BR')}`;
}

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking semanal'),

  new SlashCommandBuilder()
    .setName('topmes')
    .setDescription('Mostra o TOP 3 mensal'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adiciona dinheiro (ranking semanal)')
    .addUserOption(opt =>
      opt.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('valor').setDescription('Valor a adicionar').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define um valor fixo (ranking semanal)')
    .addUserOption(opt =>
      opt.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('valor').setDescription('Valor').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('resetranking')
    .setDescription('Salva TOP 3 da semana e reseta o ranking semanal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(cmd => cmd.toJSON());

// ---------- REGISTER COMMANDS ----------
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: commands }
  );

  console.log(`✅ Bot online como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild } = interaction;

  // ---------- RANKING SEMANAL ----------
  if (commandName === 'ranking') {
    db.all(
      'SELECT * FROM ranking ORDER BY money DESC',
      [],
      (err, rows) => {
        if (!rows || rows.length === 0) {
          return interaction.reply('📭 Ranking semanal vazio.');
        }

        let msg = '🏆 **RANKING SEMANAL — GTA RP**\n\n';
        rows.forEach((r, i) => {
          msg += `${i + 1}️⃣ ${r.username} — ${formatarDinheiro(r.money)}\n`;
        });

        interaction.reply(msg);
      }
    );
  }

  // ---------- TOP MENSAL ----------
  if (commandName === 'topmes') {
    db.all(
      'SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3',
      [],
      (err, rows) => {
        if (!rows || rows.length === 0) {
          return interaction.reply('📭 Ranking mensal vazio.');
        }

        let msg = '🏆 **TOP 3 MENSAL — GTA RP**\n\n';
        const medalhas = ['🥇', '🥈', '🥉'];

        rows.forEach((r, i) => {
          msg += `${medalhas[i]} ${r.username} — ${formatarDinheiro(r.money)}\n`;
        });

        interaction.reply(msg);
      }
    );
  }

  // ---------- ADD DINHEIRO ----------
  if (commandName === 'adddinheiro') {
    const user = interaction.options.getUser('usuario');
    const member = await guild.members.fetch(user.id);
    const valor = interaction.options.getInteger('valor');

    if (valor <= 0) {
      return interaction.reply({
        content: '❌ O valor deve ser maior que zero.',
        ephemeral: true
      });
    }

    const nome = member.nickname ?? user.username;

    db.get(
      'SELECT * FROM ranking WHERE userId = ?',
      [user.id],
      (err, row) => {
        if (row) {
          db.run(
            'UPDATE ranking SET money = ?, username = ? WHERE userId = ?',
            [row.money + valor, nome, user.id]
          );
        } else {
          db.run(
            'INSERT INTO ranking VALUES (?, ?, ?)',
            [user.id, nome, valor]
          );
        }

        interaction.reply(
          `✅ Valor de ${formatarDinheiro(valor)} adicionado para **${nome}**`
        );
      }
    );
  }

  // ---------- SET DINHEIRO ----------
  if (commandName === 'setdinheiro') {
    const user = interaction.options.getUser('usuario');
    const member = await guild.members.fetch(user.id);
    const valor = interaction.options.getInteger('valor');
    const nome = member.nickname ?? user.username;

    db.run(
      `
      INSERT INTO ranking (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = excluded.money, username = excluded.username
      `,
      [user.id, nome, valor]
    );

    interaction.reply(
      `✏️ Valor definido como ${formatarDinheiro(valor)} para **${nome}**`
    );
  }

  // ---------- RESET SEMANAL ----------
  if (commandName === 'resetranking') {
    db.all(
      'SELECT * FROM ranking ORDER BY money DESC LIMIT 3',
      [],
      (err, top3) => {
        if (top3 && top3.length > 0) {
          top3.forEach(u => {
            db.get(
              'SELECT * FROM ranking_mensal WHERE userId = ?',
              [u.userId],
              (err, row) => {
                if (row) {
                  db.run(
                    'UPDATE ranking_mensal SET money = ?, username = ? WHERE userId = ?',
                    [row.money + u.money, u.username, u.userId]
                  );
                } else {
                  db.run(
                    'INSERT INTO ranking_mensal VALUES (?, ?, ?)',
                    [u.userId, u.username, u.money]
                  );
                }
              }
            );
          });
        }

        db.run('DELETE FROM ranking');

        interaction.reply(
          '♻️ Ranking semanal resetado e TOP 3 salvo no ranking mensal.'
        );
      }
    );
  }
});

client.login(process.env.TOKEN);
