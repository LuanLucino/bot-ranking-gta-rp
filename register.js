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

// cargos
const CARGO_TORYU_ID = "1399392960751341689";
const CARGO_RESTAURANTE_ID = "1448888223714644111";

const CARGO_GERENCIA_ID = "1399390797098520591";
const CARGO_LIDER_ID = "1399389445546971206";

/* ========================================== */

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

  /* ============== /cadastro ============== */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "cadastro") return;

    if (interaction.channelId !== CANAL_CADASTRO_ID) {
      return interaction.reply({
        content: "⛔ Este comando só pode ser usado no canal de cadastro.",
        ephemeral: true
      });
    }

    // Verifica se já tem cadastro
    db.get(
      "SELECT userId FROM cadastro WHERE userId = ?",
      [interaction.user.id],
      async (_, row) => {
        if (row) {
          return interaction.reply({
            content: "⚠️ Você já possui um cadastro registrado.",
            ephemeral: true
          });
        }

        // Select de empresa
        const select = new StringSelectMenuBuilder()
          .setCustomId("select_empresa")
          .setPlaceholder("Selecione sua empresa")
          .addOptions([
            {
              label: "Toryu Shinkai",
              value: "toryu",
              emoji: "🐉"
            },
            {
              label: "Restaurante",
              value: "restaurante",
              emoji: "🍽️"
            }
          ]);

        const rowSelect = new ActionRowBuilder().addComponents(select);

        await interaction.reply({
          content: "🏢 Escolha a empresa para continuar o cadastro:",
          components: [rowSelect],
          ephemeral: true
        });
      }
    );
  });

  /* ============== SELECT EMPRESA ============== */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== "select_empresa") return;

    const empresa = interaction.values[0];

    const modal = new ModalBuilder()
      .setCustomId(`modal_cadastro_${empresa}`)
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
      .setPlaceholder("(666) 000-000")
      .setRequired(true);

    modal.addComponents(
      new ActionRowBuilder().addComponents(idPersonagem),
      new ActionRowBuilder().addComponents(nome),
      new ActionRowBuilder().addComponents(vulgo),
      new ActionRowBuilder().addComponents(telefone)
    );

    await interaction.showModal(modal);
  });

  /* ============== SUBMIT MODAL ============== */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isModalSubmit()) return;
    if (!interaction.customId.startsWith("modal_cadastro_")) return;

    const empresa = interaction.customId.replace("modal_cadastro_", "");

    const personagemId = interaction.fields.getTextInputValue("personagemId");
    const nome = interaction.fields.getTextInputValue("nome");
    const vulgo = interaction.fields.getTextInputValue("vulgo");
    let telefone = interaction.fields.getTextInputValue("telefone");

    // Normaliza telefone
    telefone = telefone.replace(/\D/g, "");
    telefone = `(666) ${telefone.slice(-6, -3)}-${telefone.slice(-3)}`;

    const nicknameFinal = `#${personagemId} ${nome}`;

    /* ===== SALVAR ===== */
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

    /* ===== NICK ===== */
    try {
      await interaction.member.setNickname(nicknameFinal);
    } catch {}

    /* ===== CARGOS ===== */
    if (empresa === "toryu") {
      await interaction.member.roles.add(CARGO_TORYU_ID);
    }

    if (empresa === "restaurante") {
      await interaction.member.roles.add(CARGO_RESTAURANTE_ID);
    }

    /* ===== EMBED ===== */
    const embed = new EmbedBuilder()
      .setTitle("✅ Cadastro Realizado")
      .setColor(0x2ecc71)
      .addFields(
        { name: "👤 Personagem", value: nome, inline: true },
        { name: "🆔 ID", value: personagemId, inline: true },
        { name: "📞 Telefone", value: telefone, inline: true },
        {
          name: "🏢 Empresa",
          value: empresa === "toryu" ? "Toryu Shinkai" : "Restaurante",
          inline: true
        }
      )
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  });

  /* ============== /removercadastro ============== */
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

    const user = interaction.options.getUser("usuario");

    db.get(
      "SELECT empresa FROM cadastro WHERE userId = ?",
      [user.id],
      async (_, row) => {
        if (!row) {
          return interaction.reply("⚠️ Este usuário não possui cadastro.");
        }

        db.run("DELETE FROM cadastro WHERE userId = ?", [user.id]);

        const member = await interaction.guild.members.fetch(user.id);

        await member.roles.remove([CARGO_TORYU_ID, CARGO_RESTAURANTE_ID]);
        await member.setNickname(null).catch(() => {});

        interaction.reply(`🗑️ Cadastro de **${user.username}** removido.`);
      }
    );
  });
};
