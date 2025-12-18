// index.js
require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require('discord.js');
const sqlite3 = require('sqlite3').verbose();
const cron = require('node-cron');

// ================== CONFIG ==================
const CANAL_ANUNCIO_ID = '1450842612557938769';
const GUILD_ID = '1399382584101703723';

const CARGO_GERENCIA_ID = '1399390797098520591';
const CARGO_LIDER_ID = '1399389445546971206';
// ============================================

// ---------- CLIENT ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// ---------- DATABASE ----------
const db = new sqlite3.Database('./ranking.db', err => {
  if (err) {
    console.error('Erro ao abrir o banco:', err);
  } else {
    console.log('📦 Banco de dados conectado.');
  }
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS ranking (
      userId TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      money INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ranking_mensal (
      userId TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      money INTEGER NOT NULL DEFAULT 0
    )
  `);

  console.log('🗄️ Tabelas verificadas/criadas com sucesso.');
});


// ---------- UTIL ----------
function formatarDinheiro(valor) {
  return `R$ ${valor.toLocaleString('pt-BR')}`;
}

function temPermissao(member) {
  return (
    member.roles.cache.has(CARGO_GERENCIA_ID) ||
    member.roles.cache.has(CARGO_LIDER_ID)
  );
}

// ---------- RESET SEMANAL ----------
function resetSemanalAutomatico() {
  db.all('SELECT * FROM ranking ORDER BY money DESC LIMIT 3', [], (err, top3) => {
    if (top3?.length) {
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
  });
}

// ---------- ANÚNCIO ----------
async function anunciarTop3() {
  const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);
  if (!canal) return;

  db.all(
    'SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3',
    [],
    (err, rows) => {
      if (!rows?.length) {
        canal.send('📭 Sem dados para o TOP 3.');
        return;
      }

      const medalhas = ['🥇', '🥈', '🥉'];
      const embed = new EmbedBuilder()
        .setTitle('🏆 TOP 3 FINANCEIRO — TŌRYŪ SHINKAI')
        .setColor(0xFFD700)
        .setTimestamp();

      rows.forEach((r, i) => {
        embed.addFields({
          name: `${medalhas[i]} ${r.username}`,
          value: `💰 ${formatarDinheiro(r.money)}`
        });
      });

      canal.send({ embeds: [embed] });
    }
  );
}

// ---------- CRONS ----------
cron.schedule('0 3 * * 1', resetSemanalAutomatico);
cron.schedule('0 22 * * 0', anunciarTop3);

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('ajuda').setDescription('Lista de comandos'),
  new SlashCommandBuilder().setName('ranking').setDescription('Ranking semanal'),
  new SlashCommandBuilder().setName('rankingmensal').setDescription('Ranking mensal'),
  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adicionar seu dinheiro ao ranking')
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    ),
  new SlashCommandBuilder().setName('forcar-anuncio').setDescription('Força anúncio'),
  new SlashCommandBuilder().setName('forcar-reset').setDescription('Força reset'),
  new SlashCommandBuilder()
    .setName('removedinheiro')
    .setDescription('Remove dinheiro')
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Valor').setRequired(true)),
  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define dinheiro')
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Valor').setRequired(true))
].map(c => c.toJSON());

// ---------- READY ----------
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
    body: commands
  });
  console.log(`✅ Bot online como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member } = interaction;

  // AJUDA
  if (commandName === 'ajuda') {
    const embed = new EmbedBuilder()
      .setTitle('📘 Comandos Disponíveis')
      .setColor(0x2f3136)
      .setDescription(
        '**👤 Membros**\n' +
        '/adddinheiro — Adicionar seu dinheiro\n' +
        '/ranking — Ranking semanal\n' +
        '/rankingmensal — Ranking mensal\n\n' +
        '**🛡️ Gerência / Líder**\n' +
        '/forcar-anuncio — Forçar anúncio\n' +
        '/forcar-reset — Forçar reset\n' +
        '/removedinheiro — Remover dinheiro\n' +
        '/setdinheiro — Definir dinheiro'
      );

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  // PERMISSÃO
  const comandosRestritos = [
    'forcar-anuncio',
    'forcar-reset',
    'removedinheiro',
    'setdinheiro'
  ];

  if (comandosRestritos.includes(commandName) && !temPermissao(member)) {
    return interaction.reply({
      content: '⛔ Você não tem permissão para usar este comando.',
      ephemeral: true
    });
  }

  // ADDDINHEIRO (MEMBRO)
  if (commandName === 'adddinheiro') {
  const user = interaction.options.getUser('usuario');
  const valor = interaction.options.getInteger('valor');

  if (valor <= 0) {
    return interaction.reply({
      content: '❌ O valor precisa ser maior que zero.',
      ephemeral: true
    });
  }

  const member = await interaction.guild.members.fetch(interaction.user.id);
  const targetMember = await interaction.guild.members.fetch(user.id);

  const cargosGerencia = ['GERENCIA_ROLE_ID', 'LIDER_ROLE_ID']; // ajuste aqui
  const isGerencia = member.roles.cache.some(r => cargosGerencia.includes(r.id));

  // 🔒 MEMBRO só pode adicionar para si mesmo
  if (!isGerencia && interaction.user.id !== user.id) {
    return interaction.reply({
      content: '❌ Você só pode adicionar dinheiro para si mesmo.',
      ephemeral: true
    });
  }

  const nome = targetMember.nickname ?? user.username;

  db.get(
    'SELECT * FROM ranking WHERE userId = ?',
    [user.id],
    (err, row) => {
      if (err) {
        console.error(err);
        return interaction.reply('❌ Erro ao acessar o banco.');
      }

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
        `💰 **${formatarDinheiro(valor)}** adicionado para **${nome}**`
      );
    }
  );
}


client.login(process.env.TOKEN);
