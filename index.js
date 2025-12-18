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
  new SlashCommandBuilder().setName('rankingmensal').setDescription('Ranking mensal'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adicionar dinheiro')
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    )
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuário (gerência/líder)').setRequired(false)
    ),

  new SlashCommandBuilder().setName('forcar-anuncio').setDescription('Forçar anúncio'),
  new SlashCommandBuilder().setName('forcar-reset').setDescription('Forçar reset'),

  new SlashCommandBuilder()
    .setName('removedinheiro')
    .setDescription('Remover dinheiro')
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Valor').setRequired(true)),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Definir dinheiro')
    .addUserOption(o => o.setName('usuario').setDescription('Usuário').setRequired(true))
    .addIntegerOption(o => o.setName('valor').setDescription('Valor').setRequired(true))
].map(c => c.toJSON());

// ---------- READY ----------
client.once('ready', async () => {
  const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

   // REMOVE comandos globais antigos
  await rest.put(
    Routes.applicationCommands(client.user.id),
    { body: [] }
  );

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
      .setTitle('📘 Painel de Comandos')
      .setColor(0x2f3136)
      .setDescription(
        '**👤 Membros**\n' +
        '/adddinheiro\n/ranking\n/rankingmensal\n\n' +
        '**🛡️ Gerência / Líder**\n' +
        '/forcar-anuncio\n/forcar-reset\n/removedinheiro\n/setdinheiro'
      );
    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  // RESTRITOS
  const restritos = ['forcar-anuncio','forcar-reset','removedinheiro','setdinheiro'];
  if (restritos.includes(commandName) && !temPermissao(member)) {
    return interaction.reply({ content: '⛔ Sem permissão.', flags: 64 });
  }

  // RANKING
  if (commandName === 'ranking') {
    db.all('SELECT * FROM ranking ORDER BY money DESC', [], (err, rows) => {
      if (!rows?.length) {
        return interaction.reply({ content: '📭 Ranking vazio.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking Semanal')
        .setColor(0x00bfff);

      rows.forEach((r, i) => {
        embed.addFields({
          name: `${i + 1}º ${r.username}`,
          value: formatarDinheiro(r.money)
        });
      });

      interaction.reply({ embeds: [embed] });
    });
  }

  // RANKING MENSAL
  if (commandName === 'rankingmensal') {
    db.all('SELECT * FROM ranking_mensal ORDER BY money DESC', [], (err, rows) => {
      if (!rows?.length) {
        return interaction.reply({ content: '📭 Ranking mensal vazio.', flags: 64 });
      }

      const embed = new EmbedBuilder()
        .setTitle('🏆 Ranking Mensal')
        .setColor(0xffa500);

      rows.forEach((r, i) => {
        embed.addFields({
          name: `${i + 1}º ${r.username}`,
          value: formatarDinheiro(r.money)
        });
      });

      interaction.reply({ embeds: [embed] });
    });
  }

  // FORÇAR ANÚNCIO
  if (commandName === 'forcar-anuncio') {
    await anunciarTop3();
    return interaction.reply({ content: '📢 Anúncio enviado.', flags: 64 });
  }

  // FORÇAR RESET
  if (commandName === 'forcar-reset') {
    resetSemanalAutomatico();
    return interaction.reply({ content: '♻️ Reset executado.', flags: 64 });
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
        return interaction.editReply('⛔ Você só pode adicionar para si mesmo.');
      }
      targetUser = usuarioOpcional;
    }

    const targetMember = await interaction.guild.members.fetch(targetUser.id);
    const nome = targetMember.nickname ?? targetUser.username;

    db.get('SELECT * FROM ranking WHERE userId = ?', [targetUser.id], (err, row) => {
      if (row) {
        db.run(
          'UPDATE ranking SET money = ?, username = ? WHERE userId = ?',
          [row.money + valor, nome, targetUser.id]
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
    });
  }
});

// ---------- LOGIN ----------
client.login(process.env.TOKEN);
