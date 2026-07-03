const express = require('express');
const app = express();

app.get('/', (req, res) => {
    res.send('🏆 Bot Mundial de Cartas activo y funcionando.');
});

app.get('/status', (req, res) => {
    res.json({
        estado: 'online',
        bot: client?.user?.tag || 'Iniciando...',
        tiempo: new Date()
    });
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`🌐 Servidor web activo en el puerto ${PORT}`);
});

const { Client, GatewayIntentBits, SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const path = require('path');

// Inicialización de la Base de Datos SQLite
const db = new Database(path.join(__dirname, 'database.db'));

// Crear las tablas necesarias si no existen
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
        FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
    )
`).run();

// Inicialización del cliente con los Intents necesarios
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// MAPA PARA MANEJAR LOS COOLDOWNS EN MEMORIA
const cooldowns = new Map();

// ✅ Configuración de múltiples prefijos
const PREFIXES = ['=', '!'];

const PAISES = [
    "Argentina", "Brasil", "Colombia", "Francia", "España", "Portugal", 
    "Alemania", "México", "Estados Unidos", "Japón", "Croacia", "Ghana", 
    "Uruguay", "Inglaterra", "Italia", "Marruecos", "Bélgica", "Países Bajos"
];

const RAREZAS = {
    COMUN: { nombre: "🟢 Común" },
    RARA: { nombre: "🔵 Rara" },
    EPICA: { nombre: "🟣 Épica" },
    LEGENDARIA: { nombre: "🟡 Legendaria" },
    EXCLUSIVA: { nombre: "🔴 Exclusiva" }
};

const CARTAS_EXCLUSIVAS = [
    { 
        nombre: "Lionel Messi 🐐", 
        rolId: "1522431003036090408", 
        imagen: "https://i.imgur.com/B7Y8wB2.png" 
    },
    { 
        nombre: "Cristiano Ronaldo 👑", 
        rolId: "1522431404602822766", 
        imagen: "https://i.imgur.com/Y1ZbeO6.png" 
    },
    { 
        nombre: "Neymar Jr. ⚡", 
        rolId: "1522431635050598411", 
        imagen: "https://i.imgur.com/gK0Kz0v.png" 
    }
];

// IDs de roles reales
const ROL_COLECCIONISTA_ID = "1522439934814851122"; 
const ROL_MAESTRO_ID = "1522439778203865210";

// FUNCIONES DE BASE DE DATOS
function asegurarUsuario(userId) {
    const usuario = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(userId);
    if (!usuario) {
        db.prepare('INSERT INTO usuarios (id, sobres_abiertos, legendarias_contador, logro_album) VALUES (?, 0, 0, 0)').run(userId);
    }
}

function agregarCartaDB(userId, nombre, rareza, pais) {
    db.prepare('INSERT INTO cartas (usuario_id, nombre, rareza, pais) VALUES (?, ?, ?, ?)').run(userId, nombre, rareza, pais);
}

function generarCartaAleatoria() {
    const r = Math.random() * 100;
    let rarezaSeleccionada;

    if (r <= 0.1) rarezaSeleccionada = "EXCLUSIVA";
    else if (r <= 4.1) rarezaSeleccionada = "LEGENDARIA"; 
    else if (r <= 14.1) rarezaSeleccionada = "EPICA"; 
    else if (r <= 39.1) rarezaSeleccionada = "RARA"; 
    else rarezaSeleccionada = "COMUN";

    const pais = PAISES[Math.floor(Math.random() * PAISES.length)];

    if (rarezaSeleccionada === "EXCLUSIVA") {
        const exclusiva = CARTAS_EXCLUSIVAS[Math.floor(Math.random() * CARTAS_EXCLUSIVAS.length)];
        return { nombre: exclusiva.nombre, rareza: RAREZAS.EXCLUSIVA.nombre, pais: pais, esExclusiva: true, rolId: exclusiva.rolId, imagen: exclusiva.imagen };
    }

    const jugadoresPorPais = ["Capitán", "Delantero Estrella", "Portero Muro", "Mediocentro Maestro"];
    const jugador = jugadoresPorPais[Math.floor(Math.random() * jugadoresPorPais.length)];
    
    return { nombre: `${jugador} de ${pais}`, rareza: RAREZAS[rarezaSeleccionada].nombre, pais: pais, esExclusiva: false };
}

// ==========================================
// LÓGICA MODULAR DE LOS COMANDOS
// ==========================================

async function comandoAyuda(ctx) {
    const embedAyuda = new EmbedBuilder()
        .setTitle("🏆 BOT MUNDIAL DE CARTAS 🏆")
        .setDescription(
            `¡Bienvenido al sistema oficial de coleccionismo! Puedes usar los comandos a través de **Slash (/)** o con los prefijos **=** o **!**\n\n` +
            `📦 \`=sobre\` / \`!sobre\` / \`/sobre\` → Abre un sobre con cartas aleatorias.\n` +
            `📚 \`=coleccion\` / \`!coleccion\` / \`/coleccion\` → Revisa tus cartas obtenidas.\n` +
            `👤 \`=perfil\` / \`!perfil\` / \`/perfil\` → Mira tus estadísticas del Mundial.\n` +
            `🌍 \`=album\` / \`!album\` / \`/album\` → Revisa qué países te faltan.\n` +
            `🏆 \`=ranking\` / \`!ranking\` / \`/ranking\` → Top 10 mejores del servidor.`
        )
        .setColor("#FFD700")
        .setFooter({ text: "¡Buena suerte coleccionista!" });

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

    const framesAnimacion = [
        "🎁 Abriendo sobre...\n🟨⬜⬜⬜⬜",
        "⏳ Buscando cartas...\n🟨🟨⬜⬜⬜",
        "✨ Revelando...\n🟨🟨🟨⬜⬜",
        "🌟 ¡Casi listo!\n🟨🟨🟨🟨⬜",
        "💥 ¡SOBRE ABIERTO!\n🟨🟨🟨🟨🟨"
    ];

    let mensajeAnimacion;
    if (esSlash) {
        await ctx.editReply(`━━━━━━━━━━━━━━━\n🎬 **Animación de apertura**\n\n${framesAnimacion[0]}\n━━━━━━━━━━━━━━━`);
    } else {
        mensajeAnimacion = await ctx.reply(`━━━━━━━━━━━━━━━\n🎬 **Animación de apertura**\n\n${framesAnimacion[0]}\n━━━━━━━━━━━━━━━`);
    }

    for (let i = 1; i < framesAnimacion.length; i++) {
        await new Promise(resolve => setTimeout(resolve, 750));
        const contenidoFrame = `━━━━━━━━━━━━━━━\n🎬 **Animación de apertura**\n\n${framesAnimacion[i]}\n━━━━━━━━━━━━━━━`;
        if (esSlash) await ctx.editReply(contenidoFrame);
        else await mensajeAnimacion.edit(contenidoFrame);
    }

    const cantidadCartas = Math.floor(Math.random() * 3) + 3; 
    let stringCartas = "";
    let exclusivasGanadas = [];
    let legendariasEnEsteSobre = 0;

    for (let i = 0; i < cantidadCartas; i++) {
        const nuevaCarta = generarCartaAleatoria();
        agregarCartaDB(user.id, nuevaCarta.nombre, nuevaCarta.rareza, nuevaCarta.pais);

        if (nuevaCarta.rareza.includes("🟡")) legendariasEnEsteSobre++;
        if (nuevaCarta.esExclusiva) exclusivasGanadas.push(nuevaCarta);

        stringCartas += `• **${nuevaCarta.nombre}** (${nuevaCarta.rareza}) - _${nuevaCarta.pais}_\n`;
    }

    db.prepare('UPDATE usuarios SET sobres_abiertos = sobres_abiertos + 1, legendarias_contador = legendarias_contador + ? WHERE id = ?')
      .run(legendariasEnEsteSobre, user.id);

    const usuarioStats = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(user.id);

    const embedSobre = new EmbedBuilder()
        .setTitle("🏆 SOBRE DEL MUNDIAL ABIERTO 🏆")
        .setDescription(`¡Has recibido **${cantidadCartas} cartas**!\n\n${stringCartas}`)
        .setColor("#FFD700")
        .setFooter({ text: `Sobres abiertos: ${usuarioStats.sobres_abiertos} | ¡Usa /coleccion o =coleccion para verlas!` });

    if (esSlash) await ctx.followUp({ embeds: [embedSobre] });
    else await ctx.channel.send({ embeds: [embedSobre] });

    try {
        if (exclusivasGanadas.length > 0 && member) {
            for (const exclusiva of exclusivasGanadas) {
                const rolExclusivo = guild.roles.cache.get(exclusiva.rolId);
                if (rolExclusivo && !member.roles.cache.has(exclusiva.rolId)) {
                    await member.roles.add(rolExclusivo);
                }

                const embedExclusiva = new EmbedBuilder()
                    .setTitle("🌟 ¡CARTA EXCLUSIVA CONSEGUIDA!")
                    .setDescription(`🏆 **${exclusiva.nombre}**\n\n🎉 ¡Felicidades ${user}!\n👑 Has desbloqueado tu rol exclusivo.\n\n🔥 ¡Con un 0.1% de probabilidad, eres oficialmente una de las pocas Leyendas del servidor!`)
                    .setThumbnail(exclusiva.imagen)
                    .setColor("#FFD700");

                const contenidoExclusiva = { content: `🎉 **${user.username}** consiguió la mítica carta exclusiva de **${exclusiva.nombre}** 🏆🔥`, embeds: [embedExclusiva] };
                if (esSlash) await ctx.followUp(contenidoExclusiva);
                else await ctx.channel.send(contenidoExclusiva);
            }
        }

        const paisesQuery = db.prepare('SELECT DISTINCT pais FROM cartas WHERE usuario_id = ?').all(user.id);
        if (paisesQuery.length === PAISES.length && usuarioStats.logro_album === 0) {
            db.prepare('UPDATE usuarios SET logro_album = 1 WHERE id = ?').run(user.id);
            const msgLogro = `🌍🏆 **¡LOGRO MUNDIALISTA CONSEGUIDO!** ${user} ha conseguido al menos una carta de **cada país participante** y ha completado oficialmente el Álbum Mundial. ¡👑!`;
            if (esSlash) await ctx.followUp({ content: msgLogro });
            else await ctx.channel.send(msgLogro);
        }

        if (usuarioStats.legendarias_contador >= 1 && usuarioStats.legendarias_contador < 5) {
            const rolCol = guild.roles.cache.get(ROL_COLECCIONISTA_ID);
            if (rolCol && !member.roles.cache.has(ROL_COLECCIONISTA_ID)) await member.roles.add(rolCol);
        } else if (usuarioStats.legendarias_contador >= 5) {
            const rolMaestro = guild.roles.cache.get(ROL_MAESTRO_ID);
            if (rolMaestro && !member.roles.cache.has(ROL_MAESTRO_ID)) await member.roles.add(rolMaestro);
        }
    } catch (error) {
        console.error("⚠️ Error en asignación de recompensas:", error);
    }
}

async function comandoColeccion(ctx, user) {
    const cartasUser = db.prepare('SELECT * FROM cartas WHERE usuario_id = ? ORDER BY id DESC').all(user.id);

    if (cartasUser.length === 0) {
        return ctx.reply("❌ Tu inventario está vacío. Abre tu primer sobre.");
    }

    const listaCartas = cartasUser.map(c => `• [${c.rareza}] **${c.nombre}**`).slice(0, 20).join("\n");
    const totalCartas = cartasUser.length;

    const embedColeccion = new EmbedBuilder()
        .setTitle(`📚 Colección de ${user.username}`)
        .setDescription(`Tus últimas capturas:\n\n${listaCartas}\n\n... y ${totalCartas > 20 ? totalCartas - 20 : 0} más.`)
        .setColor("#00AAFF")
        .addFields({ name: "Inventario Total", value: `🎴 **${totalCartas}** cartas guardadas`, inline: true });

    await ctx.reply({ embeds: [embedColeccion] });
}

async function comandoPerfil(ctx, user) {
    const usuarioStats = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(user.id);
    const paisesQuery = db.prepare('SELECT DISTINCT pais FROM cartas WHERE usuario_id = ?').all(user.id);
    const totalCartas = db.prepare('SELECT COUNT(*) as count FROM cartas WHERE usuario_id = ?').get(user.id).count;

    const estatusAlbum = usuarioStats.logro_album === 1 ? "🏆 COMPLETADO" : "⏳ En Progreso";

    const embedPerfil = new EmbedBuilder()
        .setTitle(`👤 Estadísticas de ${user.username}`)
        .setThumbnail(user.displayAvatarURL({ dynamic: true }))
        .setColor("#00FF66")
        .addFields(
            { name: "📦 Sobres Abiertos", value: `${usuarioStats.sobres_abiertos}`, inline: true },
            { name: "🎴 Cartas en Mano", value: `${totalCartas}`, inline: true },
            { name: "🟡 Legendarias", value: `${usuarioStats.legendarias_contador}`, inline: true },
            { name: "🌍 Países Hallados", value: `${paisesQuery.length}/${PAISES.length}`, inline: true },
            { name: "📜 Estado del Álbum", value: estatusAlbum, inline: false }
        );

    await ctx.reply({ embeds: [embedPerfil] });
}

async function comandoAlbum(ctx, user) {
    const paisesQuery = db.prepare('SELECT DISTINCT pais FROM cartas WHERE usuario_id = ?').all(user.id);
    const paisesObtenidos = new Set(paisesQuery.map(p => p.pais));
    let progresoTexto = "";

    PAISES.forEach(pais => {
        progresoTexto += paisesObtenidos.has(pais) ? `✅ **${pais}**\n` : `❌ ${pais}\n`;
    });

    const embedAlbum = new EmbedBuilder()
        .setTitle(`🌍 Progreso del Álbum: ${user.username}`)
        .setDescription(`Consigue al menos un jugador de cada país:\n\n${progresoTexto}`)
        .setColor("#FF9900")
        .setFooter({ text: `${paisesObtenidos.size}/${PAISES.length} Selecciones Completadas` });

    await ctx.reply({ embeds: [embedAlbum] });
}

async function comandoRanking(ctx) {
    const ranking = db.prepare(`
        SELECT usuario_id, COUNT(*) as total 
        FROM cartas 
        GROUP BY usuario_id 
        ORDER BY total DESC 
        LIMIT 10
    `).all();

    if (ranking.length === 0) return ctx.reply("El ranking está esperando a los primeros coleccionistas.");

    let tablaRanking = "";
    ranking.forEach((u, index) => {
        tablaRanking += `**#${index + 1}** <@${u.usuario_id}> — **${u.total}** cartas de colección\n`;
    });

    const embedRanking = new EmbedBuilder()
        .setTitle("🏆 TOP 10 COLECCIONISTAS DEL SERVIDOR 🏆")
        .setDescription(tablaRanking)
        .setColor("#EEEEEE");

    await ctx.reply({ embeds: [embedRanking] });
}

// ==========================================
// REGISTRO Y EVENTOS DE DISCORD
// ==========================================

client.on('ready', async () => {
    console.log(`🤖 Bot conectado como ${client.user.tag}`);
    const commands = [
        new SlashCommandBuilder().setName('ayuda').setDescription('Muestra los comandos del bot'),
        new SlashCommandBuilder().setName('help').setDescription('Muestra los comandos del bot'),
        new SlashCommandBuilder().setName('sobre').setDescription('Abre un sobre del Mundial y consigue cartas'),
        new SlashCommandBuilder().setName('coleccion').setDescription('Mira tus cartas obtenidas'),
        new SlashCommandBuilder().setName('perfil').setDescription('Mira tus estadísticas del Mundial'),
        new SlashCommandBuilder().setName('album').setDescription('Revisa el progreso de tu álbum por países'),
        new SlashCommandBuilder().setName('ranking').setDescription('Mira quiénes son los mejores coleccionistas')
    ];
    await client.application.commands.set(commands);
    console.log("✅ Comandos de barra (/) sincronizados globalmente.");
});

// EVENTO 1: COMANDOS SLASH (/)
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

// EVENTO 2: COMANDOS DE PREFIJO CON SOPORTE MULTIPREFIJO (= o !)
client.on('messageCreate', async message => {
    if (message.author.bot || !message.guild) return;

    // ✅ Detección dinámica de prefijos
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

// Sistema anticaídas global
process.on('unhandledRejection', error => console.error('❌ Error no manejado en Promesa:', error));
process.on('uncaughtException', error => console.error('❌ Excepción crítica no capturada:', error));

client.login(process.env.TOKEN);
