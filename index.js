// index.js
// Bot de Ranking Financeiro GTA RP
// Discord.js v14 + SQLite
// Ranking semanal + Ranking mensal
// Reset automático semanal

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
const cron = require('node-cron');

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

// ---------- RESET SEMANAL ----------
function resetSemanalAutomatico() {
  console.log('⏳ Reset semanal iniciado...');

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
      console.log('✅ Ranking semanal resetado.');
    }
  );
}

// ---------- CRON (SEGUNDA 00:00 BR = 03:00 UTC) ----------
cron.schedule('0 3 * * 1', () => {
  resetSemanalAutomatico();
});

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking semanal'),

  new SlashCommandBuilder()
    .setName('rankingmensal')
    .setDescription('Mostra o ranking mensal'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adiciona dinheiro ao ranking semanal')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define valor no ranking semanal')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

// ---------- REGISTER ----------
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

  if (commandName === 'rankingmensal') {
    db.all(
      'SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3',
      [],
      (err, rows) => {
        if (!rows || rows.length === 0) {
          return interaction.reply('📭 Ranking mensal vazio.');
        }

        const medalhas = ['🥇', '🥈', '🥉'];
        let msg = '🏆 **RANKING MENSAL — GTA RP**\n\n';

        rows.forEach((r, i) => {
          msg += `${medalhas[i]} ${r.username} — ${formatarDinheiro(r.money)}\n`;
        });

        interaction.reply(msg);
      }
    );
  }

  if (commandName === 'adddinheiro') {
    const user = interaction.options.getUser('usuario');
    const member = await guild.members.fetch(user.id);
    const valor = interaction.options.getInteger('valor');
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
          `✅ ${formatarDinheiro(valor)} adicionado para **${nome}**`
        );
      }
    );
  }

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
});

client.login(process.env.TOKEN);
