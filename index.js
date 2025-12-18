// index.js
require("dotenv").config();
const {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  REST,
  Routes,
  EmbedBuilder,
  PermissionFlagsBits
} = require("discord.js");
const sqlite3 = require("sqlite3").verbose();
const cron = require("node-cron");

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
    .setDescription("Adicionar dinheiro (com comprovante obrigatório)")
    .addIntegerOption(o =>
      o.setName("valor").setDescription("Valor").setRequired(true)
    )
    .addAttachmentOption(o =>
      o
        .setName("comprovante")
        .setDescription("Imagem do comprovante (obrigatório)")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("money")
    .setDescription("Ajustar dinheiro (Gerência/Líder)")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário").setRequired(true)
    )
    .addIntegerOption(o =>
      o.setName("valor").setDescription("Valor").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("deletar-semanal")
    .setDescription("Deletar ranking semanal")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder()
    .setName("deletar-mensal")
    .setDescription("Deletar ranking mensal")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
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

  try {
    const { commandName, member, guild } = interaction;

    /* ===== AJUDA ===== */
    if (commandName === "ajuda") {
      const embed = new EmbedBuilder()
        .setTitle("📌 Central de Comandos")
        .setColor(0x2f3136)
        .setDescription(`
/ranking — Ranking semanal  
/rankingmensal — Ranking mensal  
/adddinheiro — Adicionar dinheiro (com comprovante)  

**Gerência / Líder**
/money — Ajustar valores  
/deletar-semanal — Reset semanal  
/deletar-mensal — Reset mensal
        `);

      return interaction.reply({ embeds: [embed] });
    }

    /* ===== ADD DINHEIRO (USO GERAL) ===== */
    if (commandName === "adddinheiro") {
      await interaction.deferReply();

      const valor = interaction.options.getInteger("valor");
      const comprovante = interaction.options.getAttachment("comprovante");

      const alvo = interaction.user;
      const nickname = nomeNick(guild, alvo);

      db.run(
        `
        INSERT INTO ranking (userId, username, money)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET money = money + ?
        `,
        [alvo.id, nickname, valor, valor]
      );

      db.run(
        `
        INSERT INTO ranking_mensal (userId, username, money)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET money = money + ?
        `,
        [alvo.id, nickname, valor, valor]
      );

      const embed = new EmbedBuilder()
        .setTitle("💰 Dinheiro Adicionado")
        .setColor(0x2f3136)
        .addFields(
          { name: "Usuário", value: nickname, inline: true },
          { name: "Valor", value: formatarDinheiro(valor), inline: true }
        )
        .setImage(comprovante.url)
        .setTimestamp();

      interaction.editReply({ embeds: [embed] });
    }

    /* ===== MONEY (ADMIN) ===== */
    if (commandName === "money") {
      await interaction.deferReply();

      if (!temPermissao(member))
        return interaction.editReply("⛔ Sem permissão.");

      const usuario = interaction.options.getUser("usuario");
      const valor = interaction.options.getInteger("valor");
      const nickname = nomeNick(guild, usuario);

      db.run(
        `
        INSERT INTO ranking (userId, username, money)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET money = money + ?
        `,
        [usuario.id, nickname, valor, valor]
      );

      db.run(
        `
        INSERT INTO ranking_mensal (userId, username, money)
        VALUES (?, ?, ?)
        ON CONFLICT(userId) DO UPDATE SET money = money + ?
        `,
        [usuario.id, nickname, valor, valor]
      );

      interaction.editReply(
        `🛠️ Ajuste aplicado: ${formatarDinheiro(valor)} → **${nickname}**`
      );
    }

    /* ===== RANKINGS ===== */
    if (commandName === "ranking" || commandName === "rankingmensal") {
      await interaction.deferReply();

      const tabela =
        commandName === "ranking" ? "ranking" : "ranking_mensal";

      const titulo =
        commandName === "ranking"
          ? "🏆 RANKING SEMANAL"
          : "🏆 RANKING MENSAL";

      const cor =
        commandName === "ranking" ? 0x2f3136 : 0xffd700;

      db.all(`SELECT * FROM ${tabela} ORDER BY money DESC`, [], (_, rows) => {
        if (!rows.length)
          return interaction.editReply("📭 Ranking vazio.");

        const embed = new EmbedBuilder()
          .setTitle(titulo)
          .setColor(cor);

        rows.forEach((r, i) =>
          embed.addFields({
            name: `${i + 1}º ${r.username}`,
            value: formatarDinheiro(r.money)
          })
        );

        interaction.editReply({ embeds: [embed] });
      });
    }

    /* ===== DELETES ===== */
    if (commandName === "deletar-semanal") {
      if (!temPermissao(member))
        return interaction.reply("⛔ Sem permissão.");

      db.run("DELETE FROM ranking");
      interaction.reply("🗑️ Ranking semanal resetado.");
    }

    if (commandName === "deletar-mensal") {
      if (!temPermissao(member))
        return interaction.reply("⛔ Sem permissão.");

      db.run("DELETE FROM ranking_mensal");
      interaction.reply("🗑️ Ranking mensal resetado.");
    }

  } catch (err) {
    console.error("❌ Erro:", err);

    if (interaction.deferred || interaction.replied) {
      interaction.editReply("⚠️ Erro ao executar o comando.");
    } else {
      interaction.reply({ content: "⚠️ Erro ao executar.", ephemeral: true });
    }
  }
});

/* ================= CRON JOBS ================= */

// Domingo 19h – TOP 3 semanal
cron.schedule("0 19 * * 0", async () => {
  const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);

  db.all(
    "SELECT * FROM ranking ORDER BY money DESC LIMIT 3",
    [],
    (_, rows) => {
      if (!rows.length) return;

      const medalhas = ["🥇", "🥈", "🥉"];
      const embed = new EmbedBuilder()
        .setTitle("🏆 TOP 3 SEMANAL — TŌRYŪ SHINKAI")
        .setColor(0x2f3136);

      rows.forEach((r, i) =>
        embed.addFields({
          name: `${medalhas[i]} ${r.username}`,
          value: formatarDinheiro(r.money)
        })
      );

      canal.send({ embeds: [embed] });
    }
  );
}, { timezone: "America/Sao_Paulo" });

// Segunda 00h – reset semanal
cron.schedule("0 0 * * 1", () => {
  db.run("DELETE FROM ranking");
  console.log("🔄 Ranking semanal resetado automaticamente.");
}, { timezone: "America/Sao_Paulo" });

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
