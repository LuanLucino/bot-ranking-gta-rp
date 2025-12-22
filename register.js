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

// cargos
const CARGO_TORYU_ID = "1399392960751341689";
const CARGO_RESTAURANTE_ID = "1448888223714644111";

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

/* ===== UTIL TELEFONE ===== */
// Aceita qualquer formato e padroniza para (666) 123-456
function normalizarTelefone(input) {
  let numeros = input.replace(/\D/g, "");

  if (numeros.startsWith("666")) {
    numeros = numeros.slice(3);
  }

  if (numeros.length !== 6) return null;

  return `(666) ${numeros.slice(0, 3)}-${numeros.slice(3)}`;
}

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

    // 🔒 Verifica se já existe cadastro
    db.get(
      "SELECT userId FROM cadastro WHERE userId = ?",
      [interaction.user.id],
      async (_, row) => {
        if (row) {
          return interaction.reply({
            content: "❌ Você já possui um cadastro registrado.",
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
          .setLabel("Telefone GTA (ex: 123456 ou 123-456)")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const empresa = new TextInputBuilder()
          .setCustomId("empresa")
          .setLabel("Empresa (Toryu ou Restaurante)")
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
      }
    );
  });

  /* ================= SUBMIT DO MODAL ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "modal_cadastro") return;

    const personagemId = interaction.fields.getTextInputValue("personagemId");
    const nome = interaction.fields.getTextInputValue("nome");
    const vulgo = interaction.fields.getTextInputValue("vulgo");
    const telefoneInput = interaction.fields.getTextInputValue("telefone");
    const empresaInput = interaction.fields.getTextInputValue("empresa");

    /* ===== TELEFONE ===== */
    const telefone = normalizarTelefone(telefoneInput);
    if (!telefone) {
      return interaction.reply({
        content: "❌ Telefone inválido. Use apenas números. Ex: 123456",
        ephemeral: true
      });
    }

    /* ===== EMPRESA (VALIDAÇÃO) ===== */
    let empresaFinal = null;

    if (empresaInput.toLowerCase().includes("toryu")) {
      empresaFinal = "Toryu Shinkai";
      await interaction.member.roles.add(CARGO_TORYU_ID);
    } else if (empresaInput.toLowerCase().includes("restaurante")) {
      empresaFinal = "Restaurante";
      await interaction.member.roles.add(CARGO_RESTAURANTE_ID);
    } else {
      return interaction.reply({
        content: "❌ Empresa inválida. Use apenas: Toryu ou Restaurante.",
        ephemeral: true
      });
    }

    const nicknameFinal = `#${personagemId} ${nome}`;

    /* ===== SALVAR NO BANCO ===== */
    db.run(
      `
      INSERT INTO cadastro
      (userId, personagemId, nome, vulgo, telefone, empresa)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        interaction.user.id,
        personagemId,
        nome,
        vulgo,
        telefone,
        empresaFinal
      ]
    );

    /* ===== ALTERAR NICK ===== */
    try {
      await interaction.member.setNickname(nicknameFinal);
    } catch (err) {
      console.log("❌ Não foi possível alterar nickname");
    }

    /* ===== EMBED PÚBLICO ===== */
    const embed = new EmbedBuilder()
      .setTitle("✅ Novo Cadastro Realizado")
      .setColor(0x2ecc71)
      .addFields(
        { name: "👤 Personagem", value: nome, inline: true },
        { name: "🆔 ID", value: personagemId, inline: true },
        { name: "📞 Telefone", value: telefone, inline: true },
        { name: "🏢 Empresa", value: empresaFinal, inline: true }
      )
      .setFooter({ text: "Cadastro confirmado" })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  });
};
