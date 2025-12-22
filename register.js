// register.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder
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

// 🔧 MIGRAÇÃO: garantir coluna "familia"
db.serialize(() => {
  db.all("PRAGMA table_info(cadastro);", (err, columns) => {
    if (err) return;

    const existeFamilia = columns.some(col => col.name === "familia");

    if (!existeFamilia) {
      db.run("ALTER TABLE cadastro ADD COLUMN familia TEXT", err => {
        if (!err) {
          console.log("🛠️ Coluna 'familia' adicionada à tabela cadastro.");
        }
      });
    }
  });
});


module.exports = client => {
  client.on("interactionCreate", async interaction => {

    /* ================= /cadastro ================= */
    if (interaction.isChatInputCommand() && interaction.commandName === "cadastro") {
      if (interaction.channelId !== CANAL_CADASTRO_ID) {
        return interaction.reply({
          content: "⛔ Use este comando apenas no canal de cadastro.",
          ephemeral: true
        });
      }

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

          const select = new StringSelectMenuBuilder()
            .setCustomId("select_familia")
            .setPlaceholder("Selecione sua família")
            .addOptions(
              { label: "Tōryū Shinkai", value: "Toryu Shinkai", emoji: "🐉" },
              { label: "Restaurante", value: "Restaurante", emoji: "🍜" }
            );

          await interaction.reply({
            content: "🏢 **Escolha sua família para continuar o cadastro:**",
            components: [new ActionRowBuilder().addComponents(select)],
            ephemeral: true
          });
        }
      );
      return;
    }

    /* ================= SELECT FAMÍLIA ================= */
    if (interaction.isStringSelectMenu() && interaction.customId === "select_familia") {
      const familia = interaction.values[0];

      const modal = new ModalBuilder()
        .setCustomId(`modal_cadastro_${familia}`)
        .setTitle("📋 Cadastro de Personagem");

      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("personagemId")
            .setLabel("ID do personagem")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("nome")
            .setLabel("Nome do personagem")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("vulgo")
            .setLabel("Vulgo / Apelido")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("telefone")
            .setLabel("Telefone GTA (123-456)")
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
        )
      );

      await interaction.showModal(modal);
      return;
    }

    /* ================= SUBMIT MODAL ================= */
    if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_cadastro_")) {
      const familia = interaction.customId.replace("modal_cadastro_", "");

      let telefone = interaction.fields.getTextInputValue("telefone").replace(/\D/g, "");
      telefone = `(666) ${telefone.slice(0, 3)}-${telefone.slice(3, 6)}`;

      const personagemId = interaction.fields.getTextInputValue("personagemId");
      const nome = interaction.fields.getTextInputValue("nome");
      const vulgo = interaction.fields.getTextInputValue("vulgo");

      db.run(
        `
        INSERT INTO cadastro (userId, personagemId, nome, vulgo, telefone, familia)
        VALUES (?, ?, ?, ?, ?, ?)
        `,
        [interaction.user.id, personagemId, nome, vulgo, telefone, familia]
      );

      try {
        await interaction.member.setNickname(`#${personagemId} ${nome}`);
      } catch {}

      if (familia === "Toryu Shinkai") {
        await interaction.member.roles.add(CARGO_TORYU_ID);
      }
      if (familia === "Restaurante") {
        await interaction.member.roles.add(CARGO_RESTAURANTE_ID);
      }

      const embed = new EmbedBuilder()
  .setTitle("✅ Cadastro Realizado com Sucesso")
  .setColor(0x2ecc71)
  .setDescription("📄 **Dados do personagem registrado:**")
  .addFields(
    { name: "🆔 ID do Personagem", value: personagemId },
    { name: "👤 Nome", value: nome },
    { name: "🗣️ Vulgo", value: vulgo },
    { name: "📞 Telefone", value: telefone },
    { name: "🏢 Família", value: familia }
  )
  .setFooter({ text: "Sistema de Cadastro • Tōryū Shinkai" })
  .setTimestamp();


      await interaction.reply({ embeds: [embed] });
      return;
    }

    /* ================= /removercadastro ================= */
    if (interaction.isChatInputCommand() && interaction.commandName === "removercadastro") {
      if (
        !interaction.member.roles.cache.has(CARGO_GERENCIA_ID) &&
        !interaction.member.roles.cache.has(CARGO_LIDER_ID)
      ) {
        return interaction.reply({ content: "⛔ Sem permissão.", ephemeral: true });
      }

      const user = interaction.options.getUser("usuario");
      db.run("DELETE FROM cadastro WHERE userId = ?", [user.id]);

      return interaction.reply(`🗑️ Cadastro de **${user.username}** removido.`);
    }

    /* ================= /membros ================= */
    if (interaction.isChatInputCommand() && interaction.commandName === "membros") {
      db.all("SELECT * FROM cadastro", [], (_, rows) => {
        if (!rows.length) {
          return interaction.reply("📭 Nenhum membro cadastrado.");
        }

        const embed = new EmbedBuilder()
  .setTitle("📋 Membros Cadastrados")
  .setColor(0x3498db)
  .setDescription("Lista completa de personagens registrados no sistema:");

rows.forEach(r => {
  embed.addFields({
    name: `#${r.personagemId} — ${r.nome}`,
    value:
      `🗣️ **Vulgo:** ${r.vulgo}\n` +
      `📞 **Telefone:** ${r.telefone}\n` +
      `🏢 **Família:** ${r.familia}`
        });
    });

        interaction.reply({ embeds: [embed] });
      });
    }
  });
};


