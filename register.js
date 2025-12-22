// register.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

/* ===== CONFIG ===== */
const CANAL_CADASTRO_ID = "1399386829542654034";

// cargos (ajuste se necessário)
const CARGO_TORYU_ID = "ID_CARGO_TORYU_SHINKAI";
const CARGO_RESTAURANTE_ID = "ID_CARGO_RESTAURANTE";

/* ================== */

const db = new sqlite3.Database("./ranking.db");

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS cadastro (
      userId TEXT PRIMARY KEY,
      personagemId TEXT,
      nome TEXT,
      vulgo TEXT,
      telefone TEXT,
      empresa TEXT
    )
  `);
});

module.exports = (client) => {
  /* ================= COMANDO /cadastro ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName !== "cadastro") return;

    if (interaction.channelId !== CANAL_CADASTRO_ID) {
      return interaction.reply({
        content: "⛔ Este comando só pode ser usado no canal de cadastro.",
        ephemeral: true
      });
    }

    const modal = new ModalBuilder()
      .setCustomId("modal_cadastro")
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
      .setLabel("Telefone GTA (*** *** ***)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    const empresa = new TextInputBuilder()
      .setCustomId("empresa")
      .setLabel("Empresa (Toryu / Restaurante)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(idPersonagem),
      new ActionRowBuilder().addComponents(nome),
      new ActionRowBuilder().addComponents(vulgo),
      new ActionRowBuilder().addComponents(telefone),
      new ActionRowBuilder().addComponents(empresa)
    );

    await interaction.showModal(modal);
  });

  /* ================= SUBMIT DO MODAL ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "modal_cadastro") return;

    const personagemId = interaction.fields.getTextInputValue("personagemId");
    const nome = interaction.fields.getTextInputValue("nome");
    const vulgo = interaction.fields.getTextInputValue("vulgo");
    const telefone = interaction.fields.getTextInputValue("telefone");
    const empresa = interaction.fields.getTextInputValue("empresa");

    const nicknameFinal = `#${personagemId} ${nome}`;

    /* ===== SALVAR NO BANCO ===== */
    db.run(
      `
      INSERT OR REPLACE INTO cadastro
      (userId, personagemId, nome, vulgo, telefone, empresa)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        interaction.user.id,
        personagemId,
        nome,
        vulgo,
        telefone,
        empresa
      ]
    );

    /* ===== ALTERAR NICK ===== */
    try {
      await interaction.member.setNickname(nicknameFinal);
    } catch (err) {
      console.log("❌ Não foi possível alterar nickname");
    }

    /* ===== CARGOS ===== */
    if (empresa.toLowerCase().includes("toryu")) {
      await interaction.member.roles.add(CARGO_TORYU_ID);
    }

    if (empresa.toLowerCase().includes("restaurante")) {
      await interaction.member.roles.add(CARGO_RESTAURANTE_ID);
    }

    /* ===== EMBED PÚBLICO ===== */
    const embed = new EmbedBuilder()
      .setTitle("✅ Novo Cadastro Realizado")
      .setColor(0x2ecc71)
      .addFields(
        { name: "👤 Personagem", value: nome, inline: true },
        { name: "🆔 ID", value: personagemId, inline: true },
        { name: "📞 Telefone", value: telefone, inline: true },
        { name: "🏢 Empresa", value: empresa, inline: true }
      )
      .setFooter({ text: "Cadastro realizado com sucesso" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  });
};
