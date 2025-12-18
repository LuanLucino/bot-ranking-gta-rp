import {
  Client,
  GatewayIntentBits,
  SlashCommandBuilder,
  PermissionsBitField,
  Collection,
  InteractionType,
} from "discord.js";
import sqlite3 from "sqlite3";
import { open } from "sqlite";
import dotenv from "dotenv";

dotenv.config();

/* =========================
   CONFIGURAÇÕES
========================= */

const TOKEN = process.env.DISCORD_TOKEN;

// IDs de cargos (AJUSTE SE NECESSÁRIO)
const CARGO_GERENTE = "ID_DO_CARGO_GERENTE";
const CARGO_LIDER = "ID_DO_CARGO_LIDER";

/* =========================
   CLIENT
========================= */

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

/* =========================
   BANCO DE DADOS
========================= */

const db = await open({
  filename: "./ranking.db",
  driver: sqlite3.Database,
});

await db.exec(`
  CREATE TABLE IF NOT EXISTS ranking (
    userId TEXT PRIMARY KEY,
    dinheiro INTEGER DEFAULT 0
  );
`);

console.log("🗄️ Tabelas verificadas/criadas com sucesso.");
console.log("📦 Banco de dados conectado.");

/* =========================
   FUNÇÕES AUXILIARES
========================= */

function formatarDinheiro(valor) {
  return `R$ ${valor.toLocaleString("pt-BR")}`;
}

function isGerenteOuLider(member) {
  return (
    member.roles.cache.has(CARGO_GERENTE) ||
    member.roles.cache.has(CARGO_LIDER)
  );
}

/* =========================
   COMANDOS
========================= */

const commands = [
  new SlashCommandBuilder()
    .setName("adddinheiro")
    .setDescription("Adicionar dinheiro ao ranking")
    .addUserOption((opt) =>
      opt
        .setName("usuario")
        .setDescription("Usuário que receberá o dinheiro")
        .setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName("valor")
        .setDescription("Valor a ser adicionado")
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("ranking")
    .setDescription("Ver o ranking semanal"),

  new SlashCommandBuilder()
    .setName("rankingmensal")
    .setDescription("Ver o ranking mensal"),

  new SlashCommandBuilder()
    .setName("ajuda")
    .setDescription("Exibe o painel de ajuda"),

  new SlashCommandBuilder()
    .setName("forcar-anuncio")
    .setDescription("Força um anúncio manual")
    .addStringOption((opt) =>
      opt
        .setName("mensagem")
        .setDescription("Mensagem do anúncio")
        .setRequired(true)
    ),
].map((cmd) => cmd.toJSON());

/* =========================
   READY
========================= */

client.once("ready", async () => {
  await client.application.commands.set(commands);
  console.log(`✅ Bot online como ${client.user.tag}`);
});

/* =========================
   INTERACTIONS
========================= */

client.on("interactionCreate", async (interaction) => {
  if (interaction.type !== InteractionType.ApplicationCommand) return;

  const { commandName } = interaction;

  /* ===== ADD DINHEIRO ===== */
  if (commandName === "adddinheiro") {
    await interaction.deferReply(); // PÚBLICO

    const usuario = interaction.options.getUser("usuario");
    const valor = interaction.options.getInteger("valor");
    const member = interaction.member;

    if (valor <= 0) {
      return interaction.editReply("❌ O valor precisa ser maior que zero.");
    }

    // Regra de permissão
    if (!isGerenteOuLider(member) && usuario.id !== interaction.user.id) {
      return interaction.editReply(
        "❌ Você só pode adicionar dinheiro para si mesmo."
      );
    }

    // Garante que o usuário existe no banco
    await db.run(
      `INSERT OR IGNORE INTO ranking (userId, dinheiro) VALUES (?, 0)`,
      usuario.id
    );

    // Soma o dinheiro
    await db.run(
      `UPDATE ranking SET dinheiro = dinheiro + ? WHERE userId = ?`,
      valor,
      usuario.id
    );

    interaction.editReply(
      `💰 **${formatarDinheiro(valor)}** adicionados ao ranking de **${usuario.username}**`
    );
  }

  /* ===== RANKING ===== */
  if (commandName === "ranking") {
    await interaction.deferReply(); // PÚBLICO

    const rows = await db.all(
      `SELECT * FROM ranking ORDER BY dinheiro DESC LIMIT 10`
    );

    if (rows.length === 0) {
      return interaction.editReply("📭 Ranking vazio.");
    }

    let texto = "🏆 **Ranking Semanal**\n\n";
    let pos = 1;

    for (const r of rows) {
      const user = await client.users.fetch(r.userId);
      texto += `**${pos}º** ${user.username} — ${formatarDinheiro(
        r.dinheiro
      )}\n`;
      pos++;
    }

    interaction.editReply(texto);
  }

  /* ===== RANKING MENSAL ===== */
  if (commandName === "rankingmensal") {
    await interaction.deferReply(); // PÚBLICO
    interaction.editReply("📊 Ranking mensal em desenvolvimento.");
  }

  /* ===== AJUDA ===== */
  if (commandName === "ajuda") {
    await interaction.deferReply({ flags: 64 }); // PRIVADO

    interaction.editReply(
      `
📌 **Painel de Ajuda**

• /adddinheiro — Adiciona dinheiro ao ranking
• /ranking — Ranking semanal
• /rankingmensal — Ranking mensal

👑 **Administração**
• /forcar-anuncio
`
    );
  }

  /* ===== FORÇAR ANÚNCIO ===== */
  if (commandName === "forcar-anuncio") {
    await interaction.deferReply({ flags: 64 }); // PRIVADO

    if (!isGerenteOuLider(interaction.member)) {
      return interaction.editReply("❌ Sem permissão.");
    }

    const msg = interaction.options.getString("mensagem");

    await interaction.channel.send(`📢 **ANÚNCIO**\n\n${msg}`);

    interaction.editReply("✅ Anúncio enviado com sucesso.");
  }
});

/* =========================
   LOGIN
========================= */

client.login(TOKEN);
