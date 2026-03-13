const express = require('express');
const ytdl = require('@distube/ytdl-core');
const ytpl = require('ytpl');
const archiver = require('archiver');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('../public'));

// Crear carpetas necesarias
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
const TEMP_DIR = path.join(__dirname, 'temp');
fs.ensureDirSync(DOWNLOADS_DIR);
fs.ensureDirSync(TEMP_DIR);

// ============================================
// API: Obtener información de video
// ============================================
app.get('/api/video-info', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'URL de YouTube inválida' });
        }

        const info = await ytdl.getInfo(url);
        
        // Filtrar formatos de video
        const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
        
        res.json({
            success: true,
            data: {
                title: info.videoDetails.title,
                thumbnail: info.videoDetails.thumbnails[info.videoDetails.thumbnails.length - 1].url,
                duration: info.videoDetails.lengthSeconds,
                author: info.videoDetails.author.name,
                formats: formats.map(f => ({
                    itag: f.itag,
                    quality: f.quality,
                    qualityLabel: f.qualityLabel,
                    container: f.container,
                    hasAudio: f.hasAudio,
                    hasVideo: f.hasVideo
                }))
            }
        });
    } catch (error) {
        console.error('Error video-info:', error);
        res.status(500).json({ error: 'Error al obtener información del video', details: error.message });
    }
});

// ============================================
// API: Descargar video individual
// ============================================
app.get('/api/download', async (req, res) => {
    try {
        const { url, quality = 'highest' } = req.query;
        
        if (!url || !ytdl.validateURL(url)) {
            return res.status(400).json({ error: 'URL de YouTube inválida' });
        }

        const info = await ytdl.getInfo(url);
        const title = info.videoDetails.title.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
        const filename = `${title}.mp4`;
        const filepath = path.join(DOWNLOADS_DIR, filename);

        // Configurar headers para descarga
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.setHeader('Content-Type', 'video/mp4');

        // Descargar y enviar stream
        ytdl(url, { quality: quality })
            .pipe(res)
            .on('error', (err) => {
                console.error('Error download:', err);
                if (!res.headersSent) {
                    res.status(500).json({ error: 'Error al descargar video' });
                }
            });

    } catch (error) {
        console.error('Error download:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error al descargar video', details: error.message });
        }
    }
});

// ============================================
// API: Obtener información de playlist
// ============================================
app.get('/api/playlist-info', async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL requerida' });
        }

        // Extraer ID de playlist
        const playlistId = extractPlaylistId(url);
        if (!playlistId) {
            return res.status(400).json({ error: 'ID de playlist inválido' });
        }

        const playlist = await ytpl(playlistId, { limit: 50 }); // Máximo 50 videos
        
        res.json({
            success: true,
            data: {
                title: playlist.title,
                author: playlist.author,
                totalItems: playlist.items.length,
                videos: playlist.items.map((video, index) => ({
                    index: index + 1,
                    title: video.title,
                    url: video.url,
                    thumbnail: video.thumbnails[0].url,
                    duration: video.duration,
                    author: video.author.name
                }))
            }
        });
    } catch (error) {
        console.error('Error playlist-info:', error);
        res.status(500).json({ error: 'Error al obtener información de playlist', details: error.message });
    }
});

// ============================================
// API: Descargar playlist completa (ZIP)
// ============================================
app.get('/api/download-playlist', async (req, res) => {
    try {
        const { url, quality = 'highest' } = req.query;
        
        if (!url) {
            return res.status(400).json({ error: 'URL requerida' });
        }

        const playlistId = extractPlaylistId(url);
        if (!playlistId) {
            return res.status(400).json({ error: 'ID de playlist inválido' });
        }

        const playlist = await ytpl(playlistId, { limit: 50 });
        const playlistTitle = playlist.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
        const zipFilename = `${playlistTitle}_playlist.zip`;
        const zipPath = path.join(TEMP_DIR, zipFilename);

        // Configurar headers para descarga ZIP
        res.setHeader('Content-Disposition', `attachment; filename="${zipFilename}"`);
        res.setHeader('Content-Type', 'application/zip');

        // Crear stream ZIP
        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        // Descargar cada video y agregarlo al ZIP
        for (let i = 0; i < playlist.items.length; i++) {
            const video = playlist.items[i];
            const videoTitle = video.title.replace(/[^a-z0-9]/gi, '_').substring(0, 50);
            const videoFilename = `${i + 1} - ${videoTitle}.mp4`;
            
            console.log(`Descargando video ${i + 1}/${playlist.items.length}: ${video.title}`);
            
            // Descargar video a buffer
            const videoBuffer = await downloadVideoToBuffer(video.url, quality);
            
            // Agregar al ZIP
            archive.append(videoBuffer, { name: videoFilename });
        }

        // Finalizar ZIP
        await archive.finalize();
        
        // Limpiar archivos temporales después de 5 minutos
        setTimeout(() => {
            fs.remove(zipPath).catch(console.error);
        }, 5 * 60 * 1000);

    } catch (error) {
        console.error('Error download-playlist:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Error al descargar playlist', details: error.message });
        }
    }
});

// ============================================
// Funciones Auxiliares
// ============================================

function extractPlaylistId(url) {
    const regex = /[?&]list=([^&]+)/;
    const match = url.match(regex);
    return match ? match[1] : null;
}

async function downloadVideoToBuffer(url, quality) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        ytdl(url, { quality: quality })
            .on('data', (chunk) => chunks.push(chunk))
            .on('end', () => resolve(Buffer.concat(chunks)))
            .on('error', (err) => reject(err));
    });
}

// ============================================
// Limpieza de archivos temporales
// ============================================
setInterval(() => {
    const now = Date.now();
    const maxAge = 10 * 60 * 1000; // 10 minutos
    
    fs.readdir(TEMP_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(TEMP_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > maxAge) {
                    fs.remove(filePath).catch(console.error);
                }
            });
        });
    });
}, 5 * 60 * 1000); // Ejecutar cada 5 minutos

// ============================================
// Iniciar servidor
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
    console.log(`📁 Downloads: ${DOWNLOADS_DIR}`);
    console.log(`📁 Temp: ${TEMP_DIR}`);
});
