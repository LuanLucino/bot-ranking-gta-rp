// register.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

/* ================= CONFIG ================= */

const CANAL_CADASTRO_ID = "1399386829542654034";

const CARGO_TORYU_ID = "1399392960751341689";
const CARGO_RESTAURANTE_ID = "1448888223714644111";

const CARGO_GERENCIA_ID = "1399390797098520591";
const CARGO_LIDER_ID = "1399389445546971206";

/* ========================================= */

const db = new sqlite3.Database("/data/ranking.db");

/* ===== TABELA CADASTRO ===== */
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cadastro (
      userId TEXT PRIMARY KEY,
      personagemId TEXT,
      nome TEXT,
      vulgo TEXT,
      telefone TEXT,
      familia TEXT
    )
  `);
});

module.exports = client => {

  /* ================= /cadastro ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "cadastro") return;

    if (interaction.channelId !== CANAL_CADASTRO_ID) {
      return interaction.reply({
        content: "⛔ Use este comando apenas no canal de cadastro.",
        ephemeral: true
      });
    }

    // Bloquear múltiplos cadastros
    db.get(
      "SELECT userId FROM cadastro WHERE userId = ?",
      [interaction.user.id],
      async (_, row) => {
        if (row) {
          return interaction.reply({
            content: "⚠️ Você já possui um cadastro.",
            ephemeral: true
          });
        }

        // SELECT DE FAMÍLIA
        const select = new StringSelectMenuBuilder()
          .setCustomId("select_familia")
          .setPlaceholder("Selecione sua família")
          .addOptions([
            {
              label: "Tōryū Shinkai",
              value: "Toryu Shinkai",
              emoji: "🐉"
            },
            {
              label: "Restaurante",
              value: "Restaurante",
              emoji: "🍜"
            }
          ]);

        const rowSelect = new ActionRowBuilder().addComponents(select);

        await interaction.reply({
          content: "🏢 **Escolha sua família para continuar o cadastro:**",
          components: [rowSelect],
          ephemeral: true
        });
      }
    );
  });

  /* ================= SELECT FAMÍLIA ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== "select_familia") return;

    const familia = interaction.values[0];

    // MODAL
    const modal = new ModalBuilder()
      .setCustomId(`modal_cadastro_${familia}`)
      .setTitle("📋 Cadastro de Personagem");

    const idPersonagem = new TextInputBuilder()
      .setCustomId("personagemId")
      .setLabel("ID do personagem")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const nome = new TextInputBuilder()
      .setCustomId("nome")
      .setLabel("Nome do personagem")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const vulgo = new TextInputBuilder()
      .setCustomId("vulgo")
      .setLabel("Vulgo / Apelido")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const telefone = new TextInputBuilder()
      .setCustomId("telefone")
      .setLabel("Telefone GTA (123-456)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(idPersonagem),
      new ActionRowBuilder().addComponents(nome),
      new ActionRowBuilder().addComponents(vulgo),
      new ActionRowBuilder().addComponents(telefone)
    );

    await interaction.showModal(modal);
  });

  /* ================= SUBMIT MODAL ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("modal_cadastro_")) return;

    const familia = interaction.customId.replace("modal_cadastro_", "");

    let telefone = interaction.fields.getTextInputValue("telefone").replace(/\D/g, "");
    telefone = `(666) ${telefone.slice(0, 3)}-${telefone.slice(3, 6)}`;

    const personagemId = interaction.fields.getTextInputValue("personagemId");
    const nome = interaction.fields.getTextInputValue("nome");
    const vulgo = interaction.fields.getTextInputValue("vulgo");

    const nicknameFinal = `#${personagemId} ${nome}`;

    // SALVAR
    db.run(
      `
      INSERT INTO cadastro
      (userId, personagemId, nome, vulgo, telefone, familia)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        interaction.user.id,
        personagemId,
        nome,
        vulgo,
        telefone,
        familia
      ]
    );

    // ALTERAR NICK
    try {
      await interaction.member.setNickname(nicknameFinal);
    } catch {}

    // CARGOS
    if (familia === "Toryu Shinkai") {
      await interaction.member.roles.add(CARGO_TORYU_ID);
    }

    if (familia === "Restaurante") {
      await interaction.member.roles.add(CARGO_RESTAURANTE_ID);
    }

    // EMBED PÚBLICO
    const embed = new EmbedBuilder()
      .setTitle("✅ Novo Cadastro Realizado")
      .setColor(0x2ecc71)
      .addFields(
        { name: "👤 Personagem", value: nome, inline: true },
        { name: "🆔 ID", value: personagemId, inline: true },
        { name: "🗣️ Vulgo", value: vulgo, inline: true },
        { name: "📞 Telefone", value: telefone, inline: true },
        { name: "🏢 Família", value: familia, inline: true }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  });

  /* ================= /removercadastro ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "removercadastro") return;

    if (
      !interaction.member.roles.cache.has(CARGO_GERENCIA_ID) &&
      !interaction.member.roles.cache.has(CARGO_LIDER_ID)
    ) {
      return interaction.reply({ content: "⛔ Sem permissão.", ephemeral: true });
    }

    const user = interaction.options.getUser("usuario");

    db.run("DELETE FROM cadastro WHERE userId = ?", [user.id]);

    await interaction.reply(`🗑️ Cadastro de **${user.username}** removido.`);
  });

  /* ================= /membros ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "membros") return;

    db.all("SELECT * FROM cadastro", [], (_, rows) => {
      if (!rows.length)
        return interaction.reply("📭 Nenhum membro cadastrado.");

      const embed = new EmbedBuilder()
        .setTitle("📋 Membros Cadastrados")
        .setColor(0x3498db);

      rows.forEach(r => {
        embed.addFields({
          name: `#${r.personagemId} ${r.nome}`,
          value: `🗣️ ${r.vulgo}\n📞 ${r.telefone}\n🏢 ${r.familia}`
        });
      });

      interaction.reply({ embeds: [embed] });
    });
  });
};
