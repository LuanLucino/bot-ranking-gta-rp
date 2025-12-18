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

const medalhaPosicao = pos => {
  if (pos === 1) return "🥇";
  if (pos === 2) return "🥈";
  if (pos === 3) return "🥉";
  return `${pos}º`;
};

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
    .addAttachmentOption(o =>
      o
        .setName("comprovante")
        .setDescription("Imagem do comprovante")
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

  const { commandName, member, guild } = interaction;

  /* ===== AJUDA ===== */
  if (commandName === "ajuda") {
    const embed = new EmbedBuilder()
      .setTitle("📌 Central de Comandos")
      .setColor(0x2f3136)
      .setDescription(`
/ranking — Ranking semanal  
/rankingmensal — Ranking mensal  
/adddinheiro — Registrar ganhos  

**Gerência / Líder**
/money — Ajustes administrativos  
/deletar-semanal — Reset semanal  
/deletar-mensal — Reset mensal
      `);

    return interaction.reply({ embeds: [embed] });
  }

  /* ===== ADD DINHEIRO ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply();

    const valor = interaction.options.getInteger("valor");
    const comprovante = interaction.options.getAttachment("comprovante");

    if (!comprovante.contentType?.startsWith("image/"))
      return interaction.editReply("❌ O comprovante deve ser uma imagem.");

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
      .setTitle("💰 Registro de Ganho")
      .setColor(0x2ecc71)
      .setDescription(
        `**${nickname}** adicionou ${formatarDinheiro(valor)}`
      )
      .setImage(comprovante.url)
      .setTimestamp();

    interaction.editReply({ embeds: [embed] });
  }

  /* ===== MONEY ===== */
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

  /* ===== RANKING SEMANAL ===== */
  if (commandName === "ranking") {
    await interaction.deferReply();

    db.all("SELECT * FROM ranking ORDER BY money DESC", [], (_, rows) => {
      if (!rows.length)
        return interaction.editReply("📭 Ranking semanal vazio.");

      const embed = new EmbedBuilder()
        .setTitle("🏆 RANKING SEMANAL")
        .setColor(0x3498db)
        .setFooter({ text: "Boa sorte a todos 💰" });

      rows.forEach((r, i) =>
        embed.addFields({
          name: `${medalhaPosicao(i + 1)} ${r.username}`,
          value: formatarDinheiro(r.money),
          inline: false
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
        .setTitle("👑 RANKING MENSAL")
        .setColor(0xf1c40f)
        .setFooter({ text: "Top financeiro do mês 💎" });

      rows.forEach((r, i) =>
        embed.addFields({
          name: `${medalhaPosicao(i + 1)} ${r.username}`,
          value: formatarDinheiro(r.money),
          inline: false
        })
      );

      interaction.editReply({ embeds: [embed] });
    });
  }

  /* ===== DELETAR SEMANAL ===== */
  if (commandName === "deletar-semanal") {
    if (!temPermissao(member))
      return interaction.reply("⛔ Sem permissão.");

    db.run("DELETE FROM ranking");
    interaction.reply("🗑️ Ranking semanal resetado.");
  }

  /* ===== DELETAR MENSAL ===== */
  if (commandName === "deletar-mensal") {
    if (!temPermissao(member))
      return interaction.reply("⛔ Sem permissão.");

    db.run("DELETE FROM ranking_mensal");
    interaction.reply("🗑️ Ranking mensal resetado.");
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
