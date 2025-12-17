// index.js
// Bot de Ranking Financeiro para GTA RP
// Discord.js v14 + SQLite

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
});

// ---------- FORMATAR DINHEIRO ----------
function formatarDinheiro(valor) {
  return valor.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL"
  });
}

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder()
    .setName('ranking')
    .setDescription('Mostra o ranking financeiro'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adiciona dinheiro a um usuário')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuário')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('valor')
        .setDescription('Valor a adicionar')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define um valor fixo para o usuário')
    .addUserOption(opt =>
      opt.setName('usuario')
        .setDescription('Usuário')
        .setRequired(true)
    )
    .addIntegerOption(opt =>
      opt.setName('valor')
        .setDescription('Valor')
        .setRequired(true)
    )
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

  console.log(`✅ Bot online como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guild } = interaction;

  // ---------- RANKING ----------
  if (commandName === 'ranking') {
    db.all('SELECT * FROM ranking ORDER BY money DESC', [], (err, rows) => {
      if (!rows || rows.length === 0) {
        return interaction.reply('📭 Ranking vazio no momento.');
      }

      let msg = '🏆 **RANKING FINANCEIRO — GTA RP**\n\n';

      rows.forEach((r, i) => {
        msg += `${i + 1}️⃣ ${r.username} — ${formatarDinheiro(r.money)}\n`;
      });

      interaction.reply(msg);
    });
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

    const nomeExibido = member.nickname ?? user.username;
    const valorFormatado = formatarDinheiro(valor);

    db.get('SELECT * FROM ranking WHERE userId = ?', [user.id], (err, row) => {
      if (row) {
        const novoValor = row.money + valor;
        db.run(
          'UPDATE ranking SET money = ?, username = ? WHERE userId = ?',
          [novoValor, nomeExibido, user.id]
        );
      } else {
        db.run(
          'INSERT INTO ranking (userId, username, money) VALUES (?, ?, ?)',
          [user.id, nomeExibido, valor]
        );
      }

      interaction.reply(
        `✅ Valor de ${valorFormatado} adicionado para **${nomeExibido}**`
      );
    });
  }

  // ---------- SET DINHEIRO ----------
  if (commandName === 'setdinheiro') {
    const user = interaction.options.getUser('usuario');
    const member = await guild.members.fetch(user.id);
    const valor = interaction.options.getInteger('valor');

    const nomeExibido = member.nickname ?? user.username;

    db.run(
      `
      INSERT INTO ranking (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = excluded.money, username = excluded.username
      `,
      [user.id, nomeExibido, valor]
    );

    interaction.reply(
      `✏️ Valor definido como ${formatarDinheiro(valor)} para **${nomeExibido}**`
    );
  }

  // ---------- RESET RANKING ----------
  if (commandName === 'resetranking') {
    db.run('DELETE FROM ranking');
    interaction.reply('♻️ Ranking resetado com sucesso.');
  }
});

client.login(process.env.TOKEN);
