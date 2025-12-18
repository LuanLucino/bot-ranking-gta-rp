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
const GUILD_ID = '1399382584101703723';
const CANAL_ANUNCIO_ID = '1450842612557938769';

const CARGO_GERENCIA_ID = '1399390797098520591';
const CARGO_LIDER_ID = '1399389445546971206';
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
  db.all(
    'SELECT * FROM ranking ORDER BY money DESC LIMIT 3',
    [],
    (err, top3) => {
      if (!top3?.length) return;

      top3.forEach(u => {
        db.get(
          'SELECT * FROM ranking_mensal WHERE userId = ?',
          [u.userId],
          (err, row) => {
            if (row) {
              db.run(
                'UPDATE ranking_mensal SET money = ? WHERE userId = ?',
                [row.money + u.money, u.userId]
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

      db.run('DELETE FROM ranking');
    }
  );
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
        .setColor(0xffd700)
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

// ---------- CRON ----------
cron.schedule('0 3 * * 1', resetSemanalAutomatico);
cron.schedule('0 22 * * 0', anunciarTop3);

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('ajuda').setDescription('Lista de comandos'),

  new SlashCommandBuilder().setName('ranking').setDescription('Ranking semanal'),

  new SlashCommandBuilder()
    .setName('rankingmensal')
    .setDescription('Ranking mensal'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adicionar dinheiro')
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    )
    .addUserOption(o =>
      o
        .setName('usuario')
        .setDescription('Usuário que receberá o dinheiro (gerência/líder)')
        .setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName('forcar-anuncio')
    .setDescription('Forçar anúncio do TOP 3'),

  new SlashCommandBuilder()
    .setName('forcar-reset')
    .setDescription('Forçar reset semanal'),

  new SlashCommandBuilder()
    .setName('removedinheiro')
    .setDescription('Remover dinheiro de um usuário')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Definir dinheiro de um usuário')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    )
].map(c => c.toJSON());

// ---------- READY ----------
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: commands }
  );

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

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // COMANDOS RESTRITOS
  const restritos = [
    'forcar-anuncio',
    'forcar-reset',
    'removedinheiro',
    'setdinheiro'
  ];

  if (restritos.includes(commandName) && !temPermissao(member)) {
    return interaction.reply({
      content: '⛔ Você não tem permissão para usar este comando.',
      flags: 64
    });
  }

  // ADDDINHEIRO
  if (commandName === 'adddinheiro') {
    await interaction.deferReply({ flags: 64 });

    const valor = interaction.options.getInteger('valor');
    const usuarioOpcional = interaction.options.getUser('usuario');

    if (valor <= 0) {
      return interaction.editReply('❌ Valor inválido.');
    }

    let targetUser = interaction.user;

    if (usuarioOpcional) {
      if (!temPermissao(member)) {
        return interaction.editReply(
          '⛔ Você só pode adicionar dinheiro para si mesmo.'
        );
      }
      targetUser = usuarioOpcional;
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    const nome = targetMember.nickname ?? targetUser.username;

    db.get(
      'SELECT * FROM ranking WHERE userId = ?',
      [targetUser.id],
      (err, row) => {
        if (row) {
          db.run(
            'UPDATE ranking SET money = ? WHERE userId = ?',
            [row.money + valor, targetUser.id]
          );
        } else {
          db.run(
            'INSERT INTO ranking VALUES (?, ?, ?)',
            [targetUser.id, nome, valor]
          );
        }

        interaction.editReply(
          `💰 **${formatarDinheiro(valor)}** adicionado para **${nome}**`
        );
      }
    );
  }
});

// ---------- LOGIN ----------
client.login(process.env.TOKEN);
