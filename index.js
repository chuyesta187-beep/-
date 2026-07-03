const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🏆 Bot Mundial de Cartas V2 activo y funcionando.');
});

app.get('/status', (req, res) => {
    res.json({
        estado: 'online',
        bot: client?.user?.tag || 'Iniciando...',
        version: '2.0.0'
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🌐 Servidor web activo en el puerto ${PORT}`);
});

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// Inicialización de la Base de Datos SQLite V2
const db = new Database(path.join(__dirname, 'database.db'));

db.prepare(`
    CREATE TABLE IF NOT EXISTS usuarios (
        id TEXT PRIMARY KEY,
        sobres_abiertos INTEGER DEFAULT 0,
        legendarias_contador INTEGER DEFAULT 0,
        logro_album INTEGER DEFAULT 0
    )
`).run();

db.prepare(`
    CREATE TABLE IF NOT EXISTS cartas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id TEXT,
        nombre TEXT,
        rareza TEXT,
        pais TEXT,
        posicion TEXT,
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
`).run();

// Migración segura por si existen residuos de tablas previas
try { db.prepare("ALTER TABLE cartas ADD COLUMN posicion TEXT DEFAULT 'Desconocida'").run(); } catch (e) {}
try { db.prepare("ALTER TABLE cartas ADD COLUMN rareza TEXT DEFAULT '🟢 Común'").run(); } catch (e) {}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

const cooldowns = new Map();
const PREFIXES = ['=', '!'];

// ⚽ BASE DE DATOS EXCLUSIVA: MUNDIAL 2026
const JUGADORES_2026 = [
  { nombre: "Lionel Messi 🐐", pais: "Argentina", posicion: "Delantero" },
  { nombre: "Julián Álvarez 🕷️", pais: "Argentina", posicion: "Delantero" },
  { nombre: "Rodrigo De Paul 🛡️", pais: "Argentina", posicion: "Centrocampista" },
  { nombre: "Vinícius Jr ⚡", pais: "Brasil", posicion: "Extremo" },
  { nombre: "Rodrygo 🔥", pais: "Brasil", posicion: "Delantero" },
  { nombre: "Casemiro 🧱", pais: "Brasil", posicion: "Centrocampista" },
  { nombre: "Kylian Mbappé 🥷", pais: "Francia", posicion: "Delantero" },
  { nombre: "Antoine Griezmann 🪄", pais: "Francia", posicion: "Delantero" },
  { nombre: "Eduardo Camavinga 🏃‍♂️", pais: "Francia", posicion: "Centrocampista" },
  { nombre: "Lamine Yamal 💎", pais: "España", posicion: "Delantero" },
  { nombre: "Pedri 🪄", pais: "España", posicion: "Centrocampista" },
  { nombre: "Gavi 🧬", pais: "España", posicion: "Centrocampista" },
  { nombre: "Jude Bellingham 👑", pais: "Inglaterra", posicion: "Centrocampista" },
  { nombre: "Bukayo Saka 🌶️", pais: "Delantero" },
  { nombre: "Harry Kane 🎯", pais: "Inglaterra", posicion: "Delantero" },
  { nombre: "Fede Valverde 🦅", pais: "Uruguay", posicion: "Centrocampista" },
  { nombre: "Darwin Núñez 🏹", pais: "Uruguay", posicion: "Delantero" },
  { nombre: "Santiago Giménez 🌪️", pais: "México", posicion: "Delantero" },
  { nombre: "Edson Álvarez 🚜", pais: "México", posicion: "Centrocampista" },
  { nombre: "Christian Pulisic 🇺🇸", pais: "Estados Unidos", posicion: "Extremo" }
];

// Extraer lista única de países válidos dinámicamente
const PAISES_MUNDIAL = [...new Set(JUGADORES_2026.map(j => j.pais))];

// IDs de roles de Discord para recompensas automáticas por Leyendas
const ROL_COLECCIONISTA_ID = "1522439934814851122"; 
const ROL_MAESTRO_ID = "1522439778203865210";

// SISTEMA DE PROGRESIÓN "NEXT LEVEL"
function obtenerRangoMundial(totalCartas) {
    if (totalCartas >= 300) return "👑 Legend";
    if (totalCartas >= 151) return "⭐⭐⭐ Master";
    if (totalCartas >= 51)  return "⭐⭐ Pro";
    return "⭐ Rookie";
}

function asegurarUsuario(userId) {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(userId);
    if (!usuario) {
        db.prepare('INSERT INTO usuarios (id, sobres_abiertos, legendarias_contador, logro_album) VALUES (?, 0, 0, 0)').run(userId);
    }
}

// 🎴 GENERADOR DE CARTAS V2 (COMPATIBLE CON CONFIGURACIONES DE PROBABILIDADES)
function generarCartaAleatoria() {
    const jugadorBase = JUGADORES_2026[Math.floor(Math.random() * JUGADORES_2026.length)];
    const r = Math.random() * 100;
    let rareza;

    if (r <= 0.1) rareza = "🔴 Exclusiva";
    else if (r <= 4.1) rareza = "🟡 Legendaria"; 
    else if (r <= 14.1) rareza = "🟣 Épica"; 
    else if (r <= 39.1) rareza = "🔵 Rara"; 
    else rareza = "🟢 Común";

    return {
        nombre: jugadorBase.nombre,
        posicion: jugadorBase.posicion,
        pais: jugadorBase.pais,
        rareza: rareza
    };
}

// ==========================================
// LÓGICA MODULAR DE COMANDOS V2
// ==========================================

async function comandoAyuda(ctx) {
    const embedAyuda = new EmbedBuilder()
        .setTitle("🏆 BOT MUNDIAL DE CARTAS — V2 🏆")
        .setDescription(
            `¡Te damos la bienvenida a la versión 2.0 adaptada al Mundial 2026!\n\n` +
            `📦 \`=sobre\` / \`/sobre\` → Abre un sobre de 5 cartas de jugadores del Mundial.\n` +
            `📚 \`=coleccion\` / \`/coleccion\` → Panel de cartas ordenadas con páginas avanzadas.\n` +
            `👤 \`=perfil\` / \`/perfil\` → Consulta tu nivel de progresión, rango y estadísticas.\n` +
            `🌍 \`=album\` / \`/album\` → Control de las selecciones completadas.\n` +
            `🏆 \`=ranking\` / \`/ranking\` → Tabla de clasificación global del servidor.`
        )
        .setColor("#1e1f22");
    await ctx.reply({ embeds: [embedAyuda] });
}

async function comandoSobre(ctx, user, guild, member) {
    if (cooldowns.has(user.id)) {
        const tiempoRestante = cooldowns.get(user.id) - Date.now();
        if (tiempoRestante > 0) {
            const msg = `⏳ Debes esperar **${Math.ceil(tiempoRestante / 1000)} segundos** para abrir otro sobre del Mundial.`;
            return ctx.isChatInputCommand?.() ? ctx.reply({ content: msg, ephemeral: true }) : ctx.reply(msg);
        }
    }

    cooldowns.set(user.id, Date.now() + 30000);
    setTimeout(() => cooldowns.delete(user.id), 30000);

    const esSlash = typeof ctx.deferReply === 'function';
    if (esSlash) await ctx.deferReply();

    const cartasAbiertas = [];
    let legendariasEnEsteSobre = 0;

    for (let i = 0; i < 5; i++) {
        const c = generarCartaAleatoria();
        cartasAbiertas.push(c);
        db.prepare("INSERT INTO cartas (usuario_id, nombre, rareza, pais, posicion) VALUES (?, ?, ?, ?, ?)").run(user.id, c.nombre, c.rareza, c.pais, c.posicion);

        if (c.rareza.includes("🟡")) legendariasEnEsteSobre++;
    }

    db.prepare('UPDATE usuarios SET sobres_abiertos = sobres_abiertos + 1, legendarias_contador = legendarias_contador + ? WHERE id = ?')
      .run(legendariasEnEsteSobre, user.id);

    const textoCartas = cartasAbiertas.map(c => 
        `> 🧾 **${c.nombre}** (${c.rareza})\n⚽ Posición: *${c.posicion}*\n🌍 País: *${c.pais}*`
    ).join("\n\n");

    const embedSobre = new EmbedBuilder()
        .setTitle("🎴 SOBRE ABIERTO — MUNDIAL 2026")
        .setDescription(textoCartas)
        .setColor("#FFD700");

    if (esSlash) await ctx.followUp({ embeds: [embedSobre] });
    else await ctx.channel.send({ embeds: [embedSobre] });

    try {
        if (member && guild) {
            const usuarioStats = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(user.id);
            if (usuarioStats.legendarias_contador >= 1 && usuarioStats.legendarias_contador < 5) {
                const rolCol = guild.roles.cache.get(ROL_COLECCIONISTA_ID);
                if (rolCol && !member.roles.cache.has(ROL_COLECCIONISTA_ID)) await member.roles.add(rolCol);
            } else if (usuarioStats.legendarias_contador >= 5) {
                const rolMaestro = guild.roles.cache.get(ROL_MAESTRO_ID);
                if (rolMaestro && !member.roles.cache.has(ROL_MAESTRO_ID)) await member.roles.add(rolMaestro);
            }
        }
    } catch (e) { console.error("⚠️ Control roles:", e); }
}

async function comandoColeccion(ctx, user) {
    const cartas = db.prepare("SELECT * FROM cartas WHERE usuario_id = ? ORDER BY id DESC").all(user.id);

    if (!cartas.length) return ctx.reply("❌ No tienes cartas en tu inventario todavía.");

    const porPagina = 10;
    let pagina = 0;
    let totalPaginas = Math.ceil(cartas.length / porPagina);

    const generarComponentesYEmbed = (p) => {
        const inicio = p * porPagina;
        const slice = cartas.slice(inicio, inicio + porPagina);

        const textoColeccion = slice.map(c =>
            `• **${c.nombre}** (${c.rareza}) - _${c.pais}_\n   ↳ ⚽ Position: *${c.posicion}*`
        ).join("\n");

        const embed = new EmbedBuilder()
            .setTitle(`📚 Colección de ${user.username}`)
            .setDescription(textoColeccion)
            .setColor("#00AAFF")
            .setFooter({ text: `Página ${p + 1} de ${totalPaginas} | Total: ${cartas.length} cartas` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('back')
                .setLabel('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(p === 0),
            new ButtonBuilder()
                .setCustomId('next')
                .setLabel('➡️')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(p >= totalPaginas - 1)
        );

        return { embeds: [embed], components: [row] };
    };

    const esSlash = typeof ctx.deferReply === 'function';
    const opcionesMensaje = generarComponentesYEmbed(pagina);
    let msg = esSlash ? await ctx.reply({ ...opcionesMensaje, fetchReply: true }) : await ctx.reply(opcionesMensaje);

    const collector = msg.createMessageComponentCollector({ time: 120000 });

    collector.on("collect", async i => {
        if (i.user.id !== user.id) {
            return i.reply({ content: "❌ Esta no es tu colección de cartas.", ephemeral: true });
        }

        if (i.customId === 'back' && pagina > 0) pagina--;
        if (i.customId === 'next' && pagina < totalPaginas - 1) pagina++;

        const nuevaConfiguracion = generarComponentesYEmbed(pagina);
        await i.update(nuevaConfiguracion);
    });

    collector.on("end", () => {
        const deshabilitadoRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('back').setLabel('⬅️').setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('next').setLabel('➡️').setStyle(ButtonStyle.Secondary).setDisabled(true)
        );
        msg.edit({ components: [deshabilitadoRow] }).catch(() => {});
    });
}

async function comandoPerfil(ctx, user) {
    const usuarioStats = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(user.id);
    const totalCartas = db.prepare('SELECT COUNT(*) as count FROM cartas WHERE usuario_id = ?').get(user.id).count;
    const paisesQuery = db.prepare('SELECT DISTINCT pais FROM cartas WHERE usuario_id = ?').all(user.id);
    
    // Obtener la mejor rareza del usuario en la base de datos
    const mejorRarezaObtenida = db.prepare(`
        SELECT rareza FROM cartas WHERE usuario_id = ? 
        ORDER BY 
            CASE 
                WHEN rareza LIKE '%🔴%' THEN 1
                WHEN rareza LIKE '%🟡%' THEN 2
                WHEN rareza LIKE '%🟣%' THEN 3
                WHEN rareza LIKE '%🔵%' THEN 4
                ELSE 5
            END ASC LIMIT 1
    `).get(user.id)?.rareza || "Ninguna";

    const rangoActual = obtenerRangoMundial(totalCartas);

    const embedPerfil = new EmbedBuilder()
        .setTitle(`👤 Perfil Mundialista: ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor("#00FF66")
        .addFields(
            { name: "🎴 Cartas Totales", value: `**${totalCartas}** cartas`, inline: true },
            { name: "📊 Nivel / Rango", value: `\`${rangoActual}\``, inline: true },
            { name: "🌍 Países Hallados", value: `**${paisesQuery.length}** / ${PAISES_MUNDIAL.length}`, inline: true },
            { name: "🌟 Mejor Rareza", value: `${mejorRarezaObtenida}`, inline: true }
        );

    await ctx.reply({ embeds: [embedPerfil] });
}

async function comandoAlbum(ctx, user) {
    const paisesQuery = db.prepare('SELECT DISTINCT pais FROM cartas WHERE usuario_id = ?').all(user.id);
    const paisesObtenidos = new Set(paisesQuery.map(p => p.pais));
    let progresoTexto = "";

    PAISES_MUNDIAL.forEach(pais => {
        progresoTexto += paisesObtenidos.has(pais) ? `✅ **${pais}**\n` : `❌ ${pais}\n`;
    });

    const embedAlbum = new EmbedBuilder()
        .setTitle(`🌍 Progreso del Álbum 2026: ${user.username}`)
        .setDescription(progresoTexto)
        .setColor("#FF9900")
        .setFooter({ text: `${paisesObtenidos.size}/${PAISES_MUNDIAL.length} Naciones completas` });

    await ctx.reply({ embeds: [embedAlbum] });
}

async function comandoRanking(ctx) {
    const ranking = db.prepare(`
        SELECT usuario_id, COUNT(*) as total FROM cartas GROUP BY usuario_id ORDER BY total DESC LIMIT 10
    `).all();

    if (ranking.length === 0) return ctx.reply("El ranking está esperando jugadores.");

    let tablaRanking = "";
    ranking.forEach((u, index) => {
        tablaRanking += `**#${index + 1}** <@${u.usuario_id}> — **${u.total}** cartas de colección\n`;
    });

    const embedRanking = new EmbedBuilder()
        .setTitle("🏆 TOP 10 COLECCIONISTAS DEL MUNDIAL 🏆")
        .setDescription(tablaRanking)
        .setColor("#EEEEEE");

    await ctx.reply({ embeds: [embedRanking] });
}

// ==========================================
// REGISTRO Y GESTORES DE EVENTOS DISCORD
// ==========================================

client.on('ready', async () => {
    console.log(`🤖 Bot V2 activo bajo el tag ${client.user.tag}`);
    const commands = [
        new SlashCommandBuilder().setName('ayuda').setDescription('Muestra el panel de comandos V2'),
        new SlashCommandBuilder().setName('help').setDescription('Muestra el panel de comandos V2'),
        new SlashCommandBuilder().setName('sobre').setDescription('Abre un sobre del Mundial 2026 (5 cartas)'),
        new SlashCommandBuilder().setName('coleccion').setDescription('Mira tu colección de cartas con páginas (⬅️ ➡️)'),
        new SlashCommandBuilder().setName('perfil').setDescription('Revisa tus estadísticas, nivel y rango de jugador'),
        new SlashCommandBuilder().setName('album').setDescription('Verifica los países recolectados del álbum'),
        new SlashCommandBuilder().setName('ranking').setDescription('Muestra la tabla de líderes del servidor')
    ];
    await client.application.commands.set(commands);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const { commandName, user, guild, member } = interaction;
    asegurarUsuario(user.id);

    if (commandName === 'ayuda' || commandName === 'help') await comandoAyuda(interaction);
    if (commandName === 'sobre') await comandoSobre(interaction, user, guild, member);
    if (commandName === 'coleccion') await comandoColeccion(interaction, user);
    if (commandName === 'perfil') await comandoPerfil(interaction, user);
    if (commandName === 'album') await comandoAlbum(interaction, user);
    if (commandName === 'ranking') await comandoRanking(interaction);
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    const prefix = PREFIXES.find(p => message.content.startsWith(p));
    if (!prefix) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    
    asegurarUsuario(message.author.id);

    if (command === 'ayuda' || command === 'help') await comandoAyuda(message);
    if (command === 'sobre') await comandoSobre(message, message.author, message.guild, message.member);
    if (command === 'coleccion') await comandoColeccion(message, message.author);
    if (command === 'perfil') await comandoPerfil(message, message.author);
    if (command === 'album') await comandoAlbum(message, message.author);
    if (command === 'ranking') await comandoRanking(message);
});

process.on('unhandledRejection', error => console.error('❌ Error asíncrono capturado en V2:', error));
process.on('uncaughtException', error => console.error('❌ Error crítico capturado en V2:', error));

client.login(process.env.TOKEN);
