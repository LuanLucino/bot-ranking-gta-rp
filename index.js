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

  console.log("🗄️ Tabelas verificadas/criadas com sucesso.");
});

/* ================= UTIL ================= */

const formatarDinheiro = v => `R$ ${v.toLocaleString("pt-BR")}`;

const temPermissao = member =>
  member.roles.cache.has(CARGO_GERENCIA_ID) ||
  member.roles.cache.has(CARGO_LIDER_ID);

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder().setName("ajuda").setDescription("Lista de comandos"),

  new SlashCommandBuilder().setName("ranking").setDescription("Ranking semanal"),

  new SlashCommandBuilder()
    .setName("rankingmensal")
    .setDescription("Ranking mensal"),

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
    .setName("anunciar-top3")
    .setDescription("Anunciar TOP 3 financeiro"),

  new SlashCommandBuilder()
    .setName("deletar-semanal")
    .setDescription("Deletar ranking semanal"),

  new SlashCommandBuilder()
    .setName("deletar-mensal")
    .setDescription("Deletar ranking mensal")
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

  const { commandName, member } = interaction;

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

    db.all(
      "SELECT * FROM ranking_mensal ORDER BY money DESC",
      [],
      (_, rows) => {
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
      }
    );
  }

  /* ===== ANUNCIAR TOP 3 ===== */
  if (commandName === "anunciar-top3") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member))
      return interaction.editReply("⛔ Sem permissão.");

    const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);

    db.all(
      "SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3",
      [],
      (_, rows) => {
        if (!rows.length)
          return interaction.editReply("📭 Sem dados para anunciar.");

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

        canal.send({ embeds: [embed] });
        interaction.editReply("📢 TOP 3 anunciado com sucesso.");
      }
    );
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
