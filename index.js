// index.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  PermissionFlagsBits,
  EmbedBuilder
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');

// ================== CONFIG ==================
const CANAL_ANUNCIO_ID = '1450842612557938769';
const CARGO_GERENCIA_ID = 'COLOQUE_AQUI_O_ID_DO_CARGO';
// ============================================

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

// ---------- UTIL ----------
function formatarDinheiro(valor) {
  return `R$ ${valor.toLocaleString('pt-BR')}`;
}

function temCargoGerencia(member) {
  return member.roles.cache.has(CARGO_GERENCIA_ID);
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

// ---------- ANÚNCIO TOP 3 ----------
async function anunciarTop3() {
  try {
    const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);
    if (!canal) return;

    db.all(
      'SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3',
      [],
      (err, rows) => {
        if (err || !rows || rows.length === 0) {
          canal.send('📭 Não há dados suficientes para gerar o TOP 3.');
          return;
        }

        const medalhas = ['🥇', '🥈', '🥉'];

        const embed = new EmbedBuilder()
          .setTitle('🏆 TOP 3 FINANCEIRO — TŌRYŪ SHINKAI')
          .setDescription(
            'Resultado oficial do **ranking financeiro semanal**.\n' +
            'Parabéns aos membros que mais se destacaram.'
          )
          .setColor(0xFFD700)
          .setThumbnail('https://i.imgur.com/8QfZQbT.png')
          .setFooter({
            text: `Atualizado em ${new Date().toLocaleString('pt-BR')}`
          })
          .setTimestamp();

        rows.forEach((r, i) => {
          embed.addFields({
            name: `${medalhas[i]} ${r.username}`,
            value: `💰 **${formatarDinheiro(r.money)}**`,
            inline: false
          });
        });

        canal.send({ embeds: [embed] });
        console.log('📢 Anúncio TOP 3 enviado.');
      }
    );
  } catch (e) {
    console.error('Erro no anúncio TOP 3:', e);
  }
}

// ---------- CRONS ----------
cron.schedule('0 3 * * 1', resetSemanalAutomatico);
cron.schedule('0 22 * * 0', anunciarTop3);

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('ranking').setDescription('Mostra o ranking semanal'),

  new SlashCommandBuilder().setName('rankingmensal').setDescription('Mostra o ranking mensal'),

  new SlashCommandBuilder()
    .setName('forcar-anuncio')
    .setDescription('Força o anúncio do TOP 3')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('forcar-reset')
    .setDescription('Força o reset semanal')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adiciona dinheiro')
    .addUserOption(o => o.setName('usuario').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('removedinheiro')
    .setDescription('Remove dinheiro')
    .addUserOption(o => o.setName('usuario').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define valor no ranking')
    .addUserOption(o => o.setName('usuario').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
].map(c => c.toJSON());

// ---------- READY ----------
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  const GUILD_ID = '1399382584101703723';

  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: commands }
  );

  console.log(`✅ Bot online como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const member = interaction.member;

  if (
    ['adddinheiro', 'removedinheiro', 'setdinheiro', 'forcar-reset', 'forcar-anuncio']
      .includes(interaction.commandName)
  ) {
    if (!temCargoGerencia(member)) {
      return interaction.reply({
        content: '❌ Você não tem permissão para este comando.',
        ephemeral: true
      });
    }
  }

  if (interaction.commandName === 'forcar-reset') {
    resetSemanalAutomatico();
    return interaction.reply({ content: '♻️ Reset executado com sucesso.', ephemeral: true });
  }

  if (interaction.commandName === 'removedinheiro') {
    const user = interaction.options.getUser('usuario');
    const valor = interaction.options.getInteger('valor');

    db.get('SELECT * FROM ranking WHERE userId = ?', [user.id], (err, row) => {
      if (!row) return interaction.reply('Usuário não encontrado.');

      const novoValor = Math.max(0, row.money - valor);
      db.run('UPDATE ranking SET money = ? WHERE userId = ?', [novoValor, user.id]);

      interaction.reply(`➖ ${formatarDinheiro(valor)} removido.`);
    });
  }
});

client.login(process.env.TOKEN);
