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

function formatarDinheiro(valor) {
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

function temPermissao(member) {
  return (
    member.roles.cache.has(CARGO_GERENCIA_ID) ||
    member.roles.cache.has(CARGO_LIDER_ID)
  );
}

function getNome(member, user) {
  return member?.nickname ?? user.username;
}

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
      o.setName("usuario").setDescription("Usuário (gerência/líder)").setRequired(false)
    ),

  new SlashCommandBuilder()
    .setName("forcar-reset")
    .setDescription("Forçar reset semanal"),

  new SlashCommandBuilder()
    .setName("salvar-mes")
    .setDescription("Salvar ranking mensal atual"),

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

  /* ===== ADD DINHEIRO ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply();

    const valor = interaction.options.getInteger("valor");
    const userOpt = interaction.options.getUser("usuario");

    let targetUser = interaction.user;
    let targetMember = member;

    if (userOpt) {
      if (!temPermissao(member)) {
        return interaction.editReply("⛔ Você só pode adicionar para si mesmo.");
      }
      targetUser = userOpt;
      targetMember = await interaction.guild.members.fetch(userOpt.id);
    }

    const nome = getNome(targetMember, targetUser);

    db.get(
      "SELECT * FROM ranking WHERE userId = ?",
      [targetUser.id],
      (err, row) => {
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
          .setColor(0x00ff99)
          .setTitle("💰 Dinheiro Adicionado")
          .setDescription(`**${nome}** recebeu ${formatarDinheiro(valor)}`)
          .setTimestamp();

        interaction.editReply({ embeds: [embed] });
      }
    );
  }

  /* ===== RESET SEMANAL ===== */
  if (commandName === "forcar-reset") {
    if (!temPermissao(member)) {
      return interaction.reply({ content: "⛔ Sem permissão.", flags: 64 });
    }

    db.all(
      "SELECT * FROM ranking ORDER BY money DESC LIMIT 3",
      [],
      (err, rows) => {
        rows.forEach(r => {
          db.get(
            "SELECT * FROM ranking_mensal WHERE userId = ?",
            [r.userId],
            (err, row) => {
              if (row) {
                db.run(
                  "UPDATE ranking_mensal SET money = money + ?, username = ? WHERE userId = ?",
                  [r.money, r.username, r.userId]
                );
              } else {
                db.run(
                  "INSERT INTO ranking_mensal VALUES (?, ?, ?)",
                  [r.userId, r.username, r.money]
                );
              }
            }
          );
        });

        db.run("DELETE FROM ranking");

        interaction.reply({
          content: "✅ Reset semanal realizado com sucesso.",
          flags: 64
        });
      }
    );
  }

  /* ===== SALVAR MÊS ===== */
  if (commandName === "salvar-mes") {
    if (!temPermissao(member)) {
      return interaction.reply({ content: "⛔ Sem permissão.", flags: 64 });
    }

    const mes = new Date().toLocaleString("pt-BR", {
      month: "long",
      year: "numeric"
    });

    db.all("SELECT * FROM ranking_mensal", [], (err, rows) => {
      rows.forEach(r => {
        db.run(
          "INSERT INTO ranking_fechado VALUES (?, ?, ?, ?)",
          [mes, r.userId, r.username, r.money]
        );
      });

      interaction.reply({
        content: `📦 Ranking de **${mes}** salvo com sucesso.`,
        flags: 64
      });
    });
  }
});

/* ================= LOGIN ================= */

client.login(process.env.TOKEN);
