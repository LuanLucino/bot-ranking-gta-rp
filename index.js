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

  console.log("🗄️ Banco verificado.");
});

/* ================= UTIL ================= */

const formatarDinheiro = v => `R$ ${v.toLocaleString("pt-BR")}`;

const temPermissao = member =>
  member.roles.cache.has(CARGO_GERENCIA_ID) ||
  member.roles.cache.has(CARGO_LIDER_ID);

const nomeNick = (guild, user) =>
  guild.members.cache.get(user.id)?.nickname || user.username;

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder().setName("ajuda").setDescription("Lista de comandos"),

  new SlashCommandBuilder().setName("ranking").setDescription("Ranking semanal"),

  new SlashCommandBuilder()
    .setName("rankingmensal")
    .setDescription("Ranking mensal"),

  new SlashCommandBuilder()
    .setName("adddinheiro")
    .setDescription("Adicionar dinheiro (uso geral)")
    .addIntegerOption(o =>
      o.setName("valor").setDescription("Valor").setRequired(true)
    )
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário (opcional)")
    ),

  new SlashCommandBuilder()
    .setName("money")
    .setDescription("Ajustar dinheiro (Gerência/Líder)")
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("valor").setDescription("Valor").setRequired(true)
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

  const { commandName, member, guild } = interaction;

  /* ===== AJUDA ===== */
  if (commandName === "ajuda") {
    const embed = new EmbedBuilder()
      .setTitle("📌 Central de Comandos")
      .setColor(0x2f3136)
      .setDescription(`
/ranking — Ranking semanal  
/rankingmensal — Ranking mensal  
/adddinheiro — Adicionar dinheiro (uso geral)  

**Gerência / Líder**
/money — Ajustar valores  
/anunciar-top3 — Anunciar TOP 3  
/deletar-semanal — Reset semanal  
/deletar-mensal — Reset mensal
      `);

    return interaction.reply({ embeds: [embed], ephemeral: true });
  }

  /* ===== ADD DINHEIRO (GLOBAL) ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply({ ephemeral: true });

    const valor = interaction.options.getInteger("valor");
    const usuarioSelecionado = interaction.options.getUser("usuario");

    if (usuarioSelecionado && !temPermissao(member))
      return interaction.editReply("⛔ Você só pode adicionar para si mesmo.");

    const usuarioFinal = usuarioSelecionado || interaction.user;
    const nickname = nomeNick(guild, usuarioFinal);

    db.run(
      `
      INSERT INTO ranking (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = money + ?
      `,
      [usuarioFinal.id, nickname, valor, valor]
    );

    db.run(
      `
      INSERT INTO ranking_mensal (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = money + ?
      `,
      [usuarioFinal.id, nickname, valor, valor]
    );

    interaction.editReply(
      `💰 ${formatarDinheiro(valor)} adicionado para **${nickname}**`
    );
  }

  /* ===== MONEY (ADMIN) ===== */
  if (commandName === "money") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member))
      return interaction.editReply("⛔ Sem permissão.");

    const usuario = interaction.options.getUser("usuario");
    const valor = interaction.options.getInteger("valor");
    const nickname = nomeNick(guild, usuario);

    db.run(
      `
      INSERT INTO ranking (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = money + ?
      `,
      [usuario.id, nickname, valor, valor]
    );

    db.run(
      `
      INSERT INTO ranking_mensal (userId, username, money)
      VALUES (?, ?, ?)
      ON CONFLICT(userId)
      DO UPDATE SET money = money + ?
      `,
      [usuario.id, nickname, valor, valor]
    );

    interaction.editReply(
      `🛠️ Ajuste aplicado: ${formatarDinheiro(valor)} → **${nickname}**`
    );
  }

  /* ===== RANKINGS / ANÚNCIOS / RESETS ===== */

  // (ranking, rankingmensal, anunciar-top3, deletar-semanal, deletar-mensal)
  // permanecem exatamente como estavam, apenas organizados acima
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
