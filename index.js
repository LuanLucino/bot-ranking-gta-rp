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

function formatarDinheiro(valor) {
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

function temPermissao(member) {
  return (
    member.roles.cache.has(CARGO_GERENCIA_ID) ||
    member.roles.cache.has(CARGO_LIDER_ID)
  );
}

/* ================= COMMANDS ================= */

const commands = [
  new SlashCommandBuilder().setName("ajuda").setDescription("Lista de comandos"),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Ranking semanal"),

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
      o.setName("usuario").setDescription("Usuário (gerência/líder)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("forcar-anuncio")
    .setDescription("Forçar anúncio do TOP 3")
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

  /* ===== AJUDA ===== */
  if (commandName === "ajuda") {
    const embed = new EmbedBuilder()
      .setTitle("📘 Comandos Disponíveis")
      .setColor(0x2f3136)
      .setDescription(
        "**👤 Membros**\n" +
        "• /adddinheiro — Adicionar seu dinheiro\n" +
        "• /ranking — Ranking semanal\n" +
        "• /rankingmensal — Ranking mensal\n\n" +
        "**🛡️ Gerência / Líder**\n" +
        "• /forcar-anuncio — Forçar anúncio"
      );

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  /* ===== ADD DINHEIRO (PÚBLICO) ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply();

    const valor = interaction.options.getInteger("valor");
    const usuarioOpcional = interaction.options.getUser("usuario");

    if (valor <= 0) {
      return interaction.editReply("❌ Valor inválido.");
    }

    let targetUser = interaction.user;

    if (usuarioOpcional) {
      if (!temPermissao(member)) {
        return interaction.editReply(
          "⛔ Você só pode adicionar dinheiro para si mesmo."
        );
      }
      targetUser = usuarioOpcional;
    }

    const nome = targetUser.username;

    db.get(
      "SELECT * FROM ranking WHERE userId = ?",
      [targetUser.id],
      (err, row) => {
        if (row) {
          db.run(
            "UPDATE ranking SET money = money + ? WHERE userId = ?",
            [valor, targetUser.id]
          );
        } else {
          db.run(
            "INSERT INTO ranking VALUES (?, ?, ?)",
            [targetUser.id, nome, valor]
          );
        }

        const embed = new EmbedBuilder()
          .setColor(0x00ff99)
          .setTitle("💰 Dinheiro Adicionado")
          .setDescription(
            `**Usuário:** ${nome}\n**Valor:** ${formatarDinheiro(valor)}`
          )
          .setTimestamp();

        interaction.editReply({ embeds: [embed] });
      }
    );
  }

  /* ===== RANKING SEMANAL ===== */
  if (commandName === "ranking") {
    await interaction.deferReply();

    db.all(
      "SELECT * FROM ranking ORDER BY money DESC LIMIT 10",
      [],
      (err, rows) => {
        if (!rows.length) {
          return interaction.editReply("📭 Ranking vazio.");
        }

        const embed = new EmbedBuilder()
          .setTitle("🏆 Ranking Semanal")
          .setColor(0xffd700)
          .setTimestamp();

        rows.forEach((r, i) => {
          embed.addFields({
            name: `${i + 1}º ${r.username}`,
            value: formatarDinheiro(r.money)
          });
        });

        interaction.editReply({ embeds: [embed] });
      }
    );
  }

  /* ===== RANKING MENSAL ===== */
  if (commandName === "rankingmensal") {
    await interaction.deferReply();

    db.all(
      "SELECT * FROM ranking_mensal ORDER BY money DESC LIMIT 10",
      [],
      (err, rows) => {
        if (!rows.length) {
          return interaction.editReply("📭 Ranking mensal vazio.");
        }

        const embed = new EmbedBuilder()
          .setTitle("📆 Ranking Mensal")
          .setColor(0x3498db)
          .setTimestamp();

        rows.forEach((r, i) => {
          embed.addFields({
            name: `${i + 1}º ${r.username}`,
            value: formatarDinheiro(r.money)
          });
        });

        interaction.editReply({ embeds: [embed] });
      }
    );
  }

  /* ===== FORÇAR ANÚNCIO (MODELO ANTIGO) ===== */
  if (commandName === "forcar-anuncio") {
    if (!temPermissao(member)) {
      return interaction.reply({
        content: "⛔ Sem permissão.",
        flags: 64
      });
    }

    const canal = await client.channels.fetch(CANAL_ANUNCIO_ID);

    db.all(
      "SELECT * FROM ranking ORDER BY money DESC LIMIT 3",
      [],
      (err, rows) => {
        if (!rows.length) return;

        const medalhas = ["🥇", "🥈", "🥉"];
        const embed = new EmbedBuilder()
          .setTitle("🏆 TOP 3 FINANCEIRO — TŌRYŪ SHINKAI")
          .setColor(0xffd700)
          .setTimestamp();

        rows.forEach((r, i) => {
          embed.addFields({
            name: `${medalhas[i]} ${r.username}`,
            value: formatarDinheiro(r.money)
          });
        });

        canal.send({ embeds: [embed] });
        interaction.reply({ content: "✅ Anúncio enviado.", flags: 64 });
      }
    );
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
