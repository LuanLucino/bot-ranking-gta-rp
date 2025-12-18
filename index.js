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
  if (err) console.error('Erro ao abrir banco:', err);
  else console.log('📦 Banco de dados conectado.');
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
    console.log('♻️ Reset semanal executado.');
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
cron.schedule('0 3 * * 1', resetSemanalAutomatico); // Segunda 00h BR
cron.schedule('0 22 * * 0', anunciarTop3);          // Domingo 19h BR

// ---------- COMMANDS ----------
const commands = [
  new SlashCommandBuilder().setName('ajuda').setDescription('Lista de comandos'),
  new SlashCommandBuilder().setName('ranking').setDescription('Ranking semanal'),
  new SlashCommandBuilder().setName('rankingmensal').setDescription('Ranking mensal'),

  new SlashCommandBuilder()
    .setName('adddinheiro')
    .setDescription('Adicionar dinheiro ao SEU ranking')
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    ),

  new SlashCommandBuilder().setName('forcar-anuncio').setDescription('Força anúncio'),
  new SlashCommandBuilder().setName('forcar-reset').setDescription('Força reset'),

  new SlashCommandBuilder()
    .setName('removedinheiro')
    .setDescription('Remove dinheiro de um usuário')
    .addUserOption(o =>
      o.setName('usuario').setDescription('Usuário').setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName('valor').setDescription('Valor').setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('setdinheiro')
    .setDescription('Define dinheiro de um usuário')
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
  await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), {
    body: commands
  });
  console.log(`✅ Bot online como ${client.user.tag}`);
});

// ---------- INTERACTIONS ----------
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName, member } = interaction;

  // ---------- AJUDA ----------
  if (commandName === 'ajuda') {
    const embed = new EmbedBuilder()
      .setTitle('📘 Painel de Comandos')
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

  // ---------- PERMISSÃO ----------
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

  // ---------- ADDDINHEIRO ----------
  if (commandName === 'adddinheiro') {
    await interaction.deferReply({ flags: 64 });

    const valor = interaction.options.getInteger('valor');
    if (valor <= 0) {
      return interaction.editReply('❌ Valor inválido.');
    }

    const nome = member.nickname ?? interaction.user.username;

    db.get(
      'SELECT * FROM ranking WHERE userId = ?',
      [interaction.user.id],
      (err, row) => {
        if (row) {
          db.run(
            'UPDATE ranking SET money = ? WHERE userId = ?',
            [row.money + valor, interaction.user.id]
          );
        } else {
          db.run(
            'INSERT INTO ranking VALUES (?, ?, ?)',
            [interaction.user.id, nome, valor]
          );
        }

        interaction.editReply(
          `💰 **${formatarDinheiro(valor)}** adicionado para **${nome}**`
        );
      }
    );
  }

  // ---------- FORÇAR ANÚNCIO ----------
  if (commandName === 'forcar-anuncio') {
    await interaction.deferReply({ flags: 64 });
    await anunciarTop3();
    return interaction.editReply('📢 Anúncio enviado com sucesso.');
  }

  // ---------- FORÇAR RESET ----------
  if (commandName === 'forcar-reset') {
    await interaction.deferReply({ flags: 64 });
    resetSemanalAutomatico();
    return interaction.editReply('♻️ Reset semanal executado.');
  }

  // ---------- REMOVE DINHEIRO ----------
  if (commandName === 'removedinheiro') {
    await interaction.deferReply({ flags: 64 });

    const user = interaction.options.getUser('usuario');
    const valor = interaction.options.getInteger('valor');

    db.get(
      'SELECT * FROM ranking WHERE userId = ?',
      [user.id],
      (err, row) => {
        if (!row) {
          return interaction.editReply('❌ Usuário não encontrado.');
        }

        const novoValor = Math.max(0, row.money - valor);

        db.run(
          'UPDATE ranking SET money = ? WHERE userId = ?',
          [novoValor, user.id]
        );

        interaction.editReply(
          `➖ **${formatarDinheiro(valor)}** removido de **${row.username}**`
        );
      }
    );
  }

  // ---------- SET DINHEIRO ----------
  if (commandName === 'setdinheiro') {
    await interaction.deferReply({ flags: 64 });

    const user = interaction.options.getUser('usuario');
    const valor = interaction.options.getInteger('valor');
    const target = await interaction.guild.members.fetch(user.id);
    const nome = target.nickname ?? user.username;

    db.run(
      `
      INSERT INTO ranking (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = excluded.money, username = excluded.username
      `,
      [user.id, nome, valor]
    );

    interaction.editReply(
      `✏️ Valor de **${nome}** definido para **${formatarDinheiro(valor)}**`
    );
  }

  // ---------- RANKING ----------
  if (commandName === 'ranking') {
    await interaction.deferReply();

    db.all('SELECT * FROM ranking ORDER BY money DESC', [], (err, rows) => {
      if (!rows?.length) {
        return interaction.editReply('📭 Ranking vazio.');
      }

      let msg = '🏆 **RANKING SEMANAL**\n\n';
      rows.forEach((r, i) => {
        msg += `${i + 1}️⃣ ${r.username} — ${formatarDinheiro(r.money)}\n`;
      });

      interaction.editReply(msg);
    });
  }

  // ---------- RANKING MENSAL ----------
  if (commandName === 'rankingmensal') {
    await interaction.deferReply();

    db.all(
      'SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 10',
      [],
      (err, rows) => {
        if (!rows?.length) {
          return interaction.editReply('📭 Ranking mensal vazio.');
        }

        let msg = '🏆 **RANKING MENSAL**\n\n';
        rows.forEach((r, i) => {
          msg += `${i + 1}️⃣ ${r.username} — ${formatarDinheiro(r.money)}\n`;
        });

        interaction.editReply(msg);
      }
    );
  }
});

client.login(process.env.TOKEN);
