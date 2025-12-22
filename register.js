// register.js
const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  EmbedBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle
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

/* ===== MIGRAÇÃO ===== */
db.all("PRAGMA table_info(cadastro);", (_, columns) => {
  if (!columns?.some(c => c.name === "familia")) {
    db.run("ALTER TABLE cadastro ADD COLUMN familia TEXT");
  }
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
  });

  /* ================= SELECT FAMÍLIA ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== "select_familia") return;

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

    db.run(
      `
      INSERT INTO cadastro (userId, personagemId, nome, vulgo, telefone, familia)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [interaction.user.id, personagemId, nome, vulgo, telefone, familia]
    );

    await interaction.member.setNickname(`#${personagemId} ${nome}`).catch(() => {});

    if (familia === "Toryu Shinkai") {
      await interaction.member.roles.add(CARGO_TORYU_ID).catch(() => {});
    }
    if (familia === "Restaurante") {
      await interaction.member.roles.add(CARGO_RESTAURANTE_ID).catch(() => {});
    }

    const embed = new EmbedBuilder()
      .setTitle("✅ Cadastro Realizado com Sucesso")
      .setColor(0x2ecc71)
      .addFields(
        { name: "🆔 ID", value: personagemId },
        { name: "👤 Nome", value: nome },
        { name: "🗣️ Vulgo", value: vulgo },
        { name: "📞 Telefone", value: telefone },
        { name: "🏢 Família", value: familia }
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
    const member = await interaction.guild.members.fetch(user.id);

    db.get("SELECT familia FROM cadastro WHERE userId = ?", [user.id], async (_, row) => {
      if (!row) return interaction.reply("⚠️ Usuário não cadastrado.");

      if (row.familia === "Toryu Shinkai") {
        await member.roles.remove(CARGO_TORYU_ID).catch(() => {});
      }
      if (row.familia === "Restaurante") {
        await member.roles.remove(CARGO_RESTAURANTE_ID).catch(() => {});
      }

      await member.setNickname(null).catch(() => {});
      db.run("DELETE FROM cadastro WHERE userId = ?", [user.id]);

      interaction.reply(`🗑️ Cadastro de **${user.username}** removido.`);
    });
  });

  /* ================= /membros ================= */
  client.on("interactionCreate", async interaction => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "membros") return;

    if (
      !interaction.member.roles.cache.has(CARGO_GERENCIA_ID) &&
      !interaction.member.roles.cache.has(CARGO_LIDER_ID)
    ) {
      return interaction.reply({ content: "⛔ Sem permissão.", ephemeral: true });
    }

    db.all("SELECT * FROM cadastro", [], async (_, rows) => {
      if (!rows.length) return interaction.reply("📭 Nenhum cadastro.");

      let page = 0;
      const perPage = 4;

      const buildEmbed = () => {
        const embed = new EmbedBuilder()
          .setTitle("📋 Membros Cadastrados")
          .setColor(0x3498db)
          .setFooter({ text: `Página ${page + 1}` });

        rows.slice(page * perPage, page * perPage + perPage).forEach(r => {
          embed.addFields({
            name: `#${r.personagemId} — ${r.nome}`,
            value: `🗣️ ${r.vulgo}\n📞 ${r.telefone}\n🏢 ${r.familia}`
          });
        });

        return embed;
      };

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("prev").setLabel("⬅️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId("next").setLabel("➡️").setStyle(ButtonStyle.Secondary)
      );

      const msg = await interaction.reply({
        embeds: [buildEmbed()],
        components: [row],
        fetchReply: true
      });

      msg.createMessageComponentCollector({ time: 120000 }).on("collect", async i => {
        if (i.customId === "prev" && page > 0) page--;
        if (i.customId === "next" && (page + 1) * perPage < rows.length) page++;
        await i.update({ embeds: [buildEmbed()] });
      });
    });
  });
};
