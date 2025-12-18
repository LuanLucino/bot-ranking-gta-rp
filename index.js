// index.js
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();

/* ================= CONFIG ================= */

const GUILD_ID = "1399382584101703723";
const CANAL_ANUNCIO_ID = "1450842612557938769";

const CARGO_GERENCIA_ID = "1399390797098520591";
const CARGO_LIDER_ID = "1399389445546971206";

/* ========================================== */

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

/* ================= DATABASE ================= */

const db = new sqlite3.Database("./ranking.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS ranking (
      userId TEXT PRIMARY KEY,
      username TEXT,
      money INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ranking_mensal (
      userId TEXT PRIMARY KEY,
      username TEXT,
      money INTEGER DEFAULT 0
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS ranking_fechado (
      mes TEXT,
      userId TEXT,
      username TEXT,
      money INTEGER
    )
  `);

  console.log("🗄️ Tabelas verificadas/criadas com sucesso.");
});

/* ================= UTIL ================= */

const formatarDinheiro = v => `R$ ${v.toLocaleString("pt-BR")}`;

const temPermissao = member =>
  member.roles.cache.has(CARGO_GERENCIA_ID) ||
  member.roles.cache.has(CARGO_LIDER_ID);

const nomeExibicao = (member, user) =>
  member?.nickname ?? user.username;

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder().setName("ajuda").setDescription("Lista de comandos"),
  new SlashCommandBuilder().setName("ranking").setDescription("Ranking semanal"),
  new SlashCommandBuilder().setName("rankingmensal").setDescription("Ranking mensal"),

  new SlashCommandBuilder()
    .setName("adddinheiro")
    .setDescription("Adicionar dinheiro")
    .addIntegerOption(o =>
      o.setName("valor").setDescription("Valor").setRequired(true)
    )
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário (gerência/líder)")
    ),

  new SlashCommandBuilder()
    .setName("forcar-anuncio")
    .setDescription("Forçar anúncio do TOP 3"),

  new SlashCommandBuilder()
    .setName("forcar-reset")
    .setDescription("Forçar reset semanal"),

  new SlashCommandBuilder()
    .setName("salvar-mes")
    .setDescription("Salvar e arquivar ranking mensal")
].map(c => c.toJSON());

/* ================= READY ================= */

client.once("ready", async () => {
  const rest = new REST({ version: "10" }).setToken(process.env.TOKEN);
  await rest.put(
    Routes.applicationGuildCommands(client.user.id, GUILD_ID),
    { body: commands }
  );
  console.log(`✅ Bot online como ${client.user.tag}`);
});

/* ================= INTERACTIONS ================= */

client.on("interactionCreate", async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, member, guild } = interaction;

  /* ===== RANKING SEMANAL ===== */
  if (commandName === "ranking") {
    await interaction.deferReply();

    db.all("SELECT * FROM ranking ORDER BY money DESC", [], (_, rows) => {
      if (!rows.length)
        return interaction.editReply("📭 Ranking semanal vazio.");

      const embed = new EmbedBuilder()
        .setTitle("🏆 RANKING SEMANAL")
        .setColor(0x2f3136)
        .setTimestamp();

      rows.forEach((r, i) =>
        embed.addFields({
          name: `${i + 1}º ${r.username}`,
          value: formatarDinheiro(r.money)
        })
      );

      interaction.editReply({ embeds: [embed] });
    });
  }

  /* ===== RANKING MENSAL ===== */
  if (commandName === "rankingmensal") {
    await interaction.deferReply();

    db.all("SELECT * FROM ranking_mensal ORDER BY money DESC", [], (_, rows) => {
      if (!rows.length)
        return interaction.editReply("📭 Ranking mensal vazio.");

      const embed = new EmbedBuilder()
        .setTitle("🏆 RANKING MENSAL")
        .setColor(0xffd700)
        .setTimestamp();

      rows.forEach((r, i) =>
        embed.addFields({
          name: `${i + 1}º ${r.username}`,
          value: formatarDinheiro(r.money)
        })
      );

      interaction.editReply({ embeds: [embed] });
    });
  }

  /* ===== ADD DINHEIRO ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply();

    const valor = interaction.options.getInteger("valor");
    const userOpt = interaction.options.getUser("usuario");

    let targetUser = interaction.user;
    let targetMember = member;

    if (userOpt) {
      if (!temPermissao(member))
        return interaction.editReply("⛔ Sem permissão.");
      targetUser = userOpt;
      targetMember = await guild.members.fetch(userOpt.id);
    }

    const nome = nomeExibicao(targetMember, targetUser);

    const atualizar = tabela => {
      db.get(
        `SELECT * FROM ${tabela} WHERE userId = ?`,
        [targetUser.id],
        (_, row) => {
          if (row)
            db.run(
              `UPDATE ${tabela} SET money = money + ?, username = ? WHERE userId = ?`,
              [valor, nome, targetUser.id]
            );
          else
            db.run(
              `INSERT INTO ${tabela} VALUES (?, ?, ?)`,
              [targetUser.id, nome, valor]
            );
        }
      );
    };

    atualizar("ranking");
    atualizar("ranking_mensal");

    const embed = new EmbedBuilder()
      .setTitle("💰 Dinheiro Adicionado")
      .setColor(0x00ff99)
      .setDescription(`**${nome}** recebeu ${formatarDinheiro(valor)}`)
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  }

  /* ===== FORÇAR ANÚNCIO ===== */
  if (commandName === "forcar-anuncio") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member))
      return interaction.editReply("⛔ Sem permissão.");

    db.all(
      "SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3",
      [],
      async (_, rows) => {
        if (!rows.length)
          return interaction.editReply("📭 Sem dados.");

        const medalhas = ["🥇", "🥈", "🥉"];
        const embed = new EmbedBuilder()
          .setTitle("🏆 TOP 3 FINANCEIRO — TŌRYŪ SHINKAI")
          .setColor(0xffd700)
          .setTimestamp();

        rows.forEach((r, i) =>
          embed.addFields({
            name: `${medalhas[i]} ${r.username}`,
            value: formatarDinheiro(r.money)
          })
        );

        const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);
        await canal.send({ embeds: [embed] });

        interaction.editReply("📢 Anúncio enviado.");
      }
    );
  }

  /* ===== FORÇAR RESET ===== */
  if (commandName === "forcar-reset") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member))
      return interaction.editReply("⛔ Sem permissão.");

    db.run("DELETE FROM ranking", () =>
      interaction.editReply("♻️ Ranking semanal resetado.")
    );
  }

  /* ===== SALVAR MÊS ===== */
  if (commandName === "salvar-mes") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member))
      return interaction.editReply("⛔ Sem permissão.");

    const mes = new Date().toLocaleString("pt-BR", {
      month: "long",
      year: "numeric"
    });

    db.all("SELECT * FROM ranking_mensal", [], (_, rows) => {
      rows.forEach(r =>
        db.run(
          "INSERT INTO ranking_fechado VALUES (?, ?, ?, ?)",
          [mes, r.userId, r.username, r.money]
        )
      );

      db.run("DELETE FROM ranking_mensal");
      interaction.editReply(`📦 Ranking de **${mes}** salvo e resetado.`);
    });
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
