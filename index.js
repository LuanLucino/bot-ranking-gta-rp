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
    .setName("anunciar-top3")
    .setDescription("Anunciar TOP 3 financeiro"),

  new SlashCommandBuilder()
    .setName("deletar-semanal")
    .setDescription("Deletar ranking semanal"),

  new SlashCommandBuilder()
    .setName("deletar-mensal")
    .setDescription("Deletar ranking mensal"),

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

  /* ===== AJUDA ===== */
  if (commandName === "ajuda") {
    await interaction.deferReply({ ephemeral: true });

    const embed = new EmbedBuilder()
      .setTitle("📘 Central de Ajuda — Ranking")
      .setColor(0x2f3136)
      .setDescription(`
**Comandos de Membro**
• /ranking  
• /rankingmensal  
• /adddinheiro  

**Comandos de Gerência / Líder**
• /anunciar-top3  
• /deletar-semanal  
• /deletar-mensal  
• /salvar-mes
      `)
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
  }

  /* ===== ADD DINHEIRO ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply();

    const valor = interaction.options.getInteger("valor");
    const userOpt = interaction.options.getUser("usuario");

    if (valor <= 0) {
      return interaction.editReply("❌ Valor inválido.");
    }

    let targetUser = interaction.user;
    let targetMember = member;

    if (userOpt) {
      if (!temPermissao(member)) {
        return interaction.editReply("⛔ Você só pode adicionar dinheiro para si mesmo.");
      }
      targetUser = userOpt;
      targetMember = await guild.members.fetch(userOpt.id);
    }

    const nome = nomeExibicao(targetMember, targetUser);

    db.get("SELECT * FROM ranking WHERE userId = ?", [targetUser.id], (_, row) => {
      if (row) {
        db.run(
          "UPDATE ranking SET money = money + ?, username = ? WHERE userId = ?",
          [valor, nome, targetUser.id]
        );
      } else {
        db.run(
          "INSERT INTO ranking VALUES (?, ?, ?)",
          [targetUser.id, nome, valor]
        );
      }

      const embed = new EmbedBuilder()
        .setTitle("💰 Dinheiro Adicionado")
        .setColor(0x00ff99)
        .setDescription(`**${nome}** recebeu ${formatarDinheiro(valor)}`)
        .setTimestamp();

      interaction.editReply({ embeds: [embed] });
    });
  }

  /* ===== ANUNCIAR TOP 3 ===== */
  if (commandName === "anunciar-top3") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member)) {
      return interaction.editReply("⛔ Sem permissão.");
    }

    const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);

    db.all(
      "SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 3",
      [],
      (_, rows) => {
        if (!rows.length) {
          return interaction.editReply("📭 Sem dados para anunciar.");
        }

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

  /* ===== DELETAR SEMANAL ===== */
  if (commandName === "deletar-semanal") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member)) {
      return interaction.editReply("⛔ Sem permissão.");
    }

    db.run("DELETE FROM ranking", () =>
      interaction.editReply("♻️ Ranking semanal deletado.")
    );
  }

  /* ===== DELETAR MENSAL ===== */
  if (commandName === "deletar-mensal") {
    await interaction.deferReply({ ephemeral: true });

    if (!temPermissao(member)) {
      return interaction.editReply("⛔ Sem permissão.");
    }

    db.run("DELETE FROM ranking_mensal", () =>
      interaction.editReply("♻️ Ranking mensal deletado.")
    );
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
