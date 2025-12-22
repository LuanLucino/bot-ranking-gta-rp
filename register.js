const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder
} = require("discord.js");

const sqlite3 = require("sqlite3").verbose();

/* ===== CONFIG ===== */
const CANAL_CADASTRO_ID = "1399386829542654034";

const CARGO_TORYU_ID = "1399392960751341689";
const CARGO_RESTAURANTE_ID = "1448888223714644111";

const CARGO_GERENCIA_ID = "1399390797098520591";
const CARGO_LIDER_ID = "1399389445546971206";
/* ================== */

const db = new sqlite3.Database("./data/ranking.db");

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

    db.get(
      "SELECT * FROM cadastro WHERE userId = ?",
      [interaction.user.id],
      async (err, row) => {
        if (row) {
          return interaction.reply({
            content: "❌ Você já possui um cadastro.",
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
          .setLabel("Telefone GTA (666) 123-456")
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(idPersonagem),
          new ActionRowBuilder().addComponents(nome),
          new ActionRowBuilder().addComponents(vulgo),
          new ActionRowBuilder().addComponents(telefone)
        );

        await interaction.showModal(modal);
      }
    );
  });

  /* ================= MODAL SUBMIT ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (interaction.customId !== "modal_cadastro") return;

    const personagemId = interaction.fields.getTextInputValue("personagemId");
    const nome = interaction.fields.getTextInputValue("nome");
    const vulgo = interaction.fields.getTextInputValue("vulgo");
    let telefone = interaction.fields.getTextInputValue("telefone");

    if (!telefone.startsWith("(666)")) {
      telefone = `(666) ${telefone}`;
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId("select_empresa")
      .setPlaceholder("Selecione sua empresa")
      .addOptions(
        { label: "Toryu Shinkai", value: "Toryu Shinkai" },
        { label: "Restaurante", value: "Restaurante" }
      );

    await interaction.reply({
      content: "🏢 Escolha sua empresa:",
      components: [new ActionRowBuilder().addComponents(select)],
      ephemeral: true
    });

    client.once("interactionCreate", async selectInteraction => {
      if (!selectInteraction.isStringSelectMenu()) return;
      if (selectInteraction.customId !== "select_empresa") return;

      const empresa = selectInteraction.values[0];
      const nicknameFinal = `#${personagemId} ${nome}`;

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
          empresa
        ]
      );

      try {
        await interaction.member.setNickname(nicknameFinal);
      } catch {}

      if (empresa === "Toryu Shinkai") {
        await interaction.member.roles.add(CARGO_TORYU_ID);
      }

      if (empresa === "Restaurante") {
        await interaction.member.roles.add(CARGO_RESTAURANTE_ID);
      }

      const embed = new EmbedBuilder()
        .setTitle("✅ Cadastro Realizado")
        .setColor(0x2ecc71)
        .addFields(
          { name: "🆔 ID", value: personagemId, inline: true },
          { name: "👤 Nome", value: nome, inline: true },
          { name: "🏷️ Vulgo", value: vulgo, inline: true },
          { name: "📞 Telefone", value: telefone, inline: true },
          { name: "🏢 Empresa", value: empresa, inline: true }
        )
        .setTimestamp();

      await selectInteraction.update({
        embeds: [embed],
        components: []
      });
    });
  });

  /* ================= COMANDO /membros ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "membros") return;

    const empresaFiltro = interaction.options.getString("empresa");

    const query = empresaFiltro
      ? "SELECT * FROM cadastro WHERE empresa = ?"
      : "SELECT * FROM cadastro";

    const params = empresaFiltro ? [empresaFiltro] : [];

    db.all(query, params, (_, rows) => {
      if (!rows.length) {
        return interaction.reply("📭 Nenhum membro cadastrado.");
      }

      const embed = new EmbedBuilder()
        .setTitle("👥 Membros Cadastrados")
        .setColor(0x3498db)
        .setTimestamp();

      rows.forEach(r => {
        embed.addFields({
          name: `#${r.personagemId} ${r.nome}`,
          value: `🏷️ **Vulgo:** ${r.vulgo}\n📞 **Tel:** ${r.telefone}\n🏢 **Empresa:** ${r.empresa}`,
          inline: false
        });
      });

      interaction.reply({ embeds: [embed] });
    });
  });

  /* ================= COMANDO /removercadastro ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "removercadastro") return;

    if (
      !interaction.member.roles.cache.has(CARGO_GERENCIA_ID) &&
      !interaction.member.roles.cache.has(CARGO_LIDER_ID)
    ) {
      return interaction.reply({
        content: "⛔ Sem permissão.",
        ephemeral: true
      });
    }

    const usuario = interaction.options.getUser("usuario");

    db.run(
      "DELETE FROM cadastro WHERE userId = ?",
      [usuario.id],
      () => {
        interaction.reply(
          `🗑️ Cadastro de **${usuario.username}** removido com sucesso.`
        );
      }
    );
  });
};
