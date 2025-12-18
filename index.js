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

// Cargos
const CARGO_GERENCIA_ID = "1399390797098520591";
const CARGO_LIDER_ID = "1399389445546971206";

/* ========================================== */

// CLIENT
const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// DATABASE
const db = new sqlite3.Database("./ranking.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS ranking (
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
  new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Lista de comandos"),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Exibe o ranking semanal"),

  new SlashCommandBuilder()
    .setName("rankingmensal")
    .setDescription("Exibe o ranking mensal"),

  new SlashCommandBuilder()
    .setName("adddinheiro")
    .setDescription("Adicionar dinheiro")
    .addIntegerOption(o =>
      o.setName("valor").setDescription("Valor").setRequired(true)
    )
    .addUserOption(o =>
      o.setName("usuario").setDescription("Usuário (opcional)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("forcar-anuncio")
    .setDescription("Forçar anúncio manual")
    .addStringOption(o =>
      o.setName("mensagem").setDescription("Mensagem").setRequired(true)
    )
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
        "/adddinheiro — Adicionar seu dinheiro\n" +
        "/ranking — Ranking semanal\n" +
        "/rankingmensal — Ranking mensal\n\n" +
        "**🛡️ Gerência / Líder**\n" +
        "/forcar-anuncio — Forçar anúncio"
      );

    return interaction.reply({ embeds: [embed], flags: 64 });
  }

  /* ===== ADD DINHEIRO (PÚBLICO) ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply(); // público

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

        interaction.editReply(
          `💰 **${formatarDinheiro(valor)}** adicionados para **${nome}**`
        );
      }
    );
  }

  /* ===== RANKING ===== */
  if (commandName === "ranking") {
    await interaction.deferReply();

    db.all(
      "SELECT * FROM ranking ORDER BY money DESC LIMIT 10",
      [],
      async (err, rows) => {
        if (!rows.length) {
          return interaction.editReply("📭 Ranking vazio.");
        }

        let texto = "🏆 **Ranking Semanal**\n\n";

        rows.forEach((r, i) => {
          texto += `**${i + 1}º** ${r.username} — ${formatarDinheiro(r.money)}\n`;
        });

        interaction.editReply(texto);
      }
    );
  }

  /* ===== FORÇAR ANÚNCIO ===== */
  if (commandName === "forcar-anuncio") {
    if (!temPermissao(member)) {
      return interaction.reply({
        content: "⛔ Sem permissão.",
        flags: 64
      });
    }

    const msg = interaction.options.getString("mensagem");
    await interaction.channel.send(`📢 **ANÚNCIO**\n\n${msg}`);

    interaction.reply({
      content: "✅ Anúncio enviado.",
      flags: 64
    });
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
