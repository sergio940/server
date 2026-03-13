const API_URL = 'http://localhost:3000/api';
let currentURL = '';
let isPlaylist = false;

async function analizarURL() {
    const url = document.getElementById('urlInput').value.trim();
    
    if (!url) {
        mostrarError('⚠️ Por favor ingresa una URL');
        return;
    }

    currentURL = url;
    mostrarLoader(true);
    ocultarError();
    ocultarInfo();

    try {
        // Detectar si es playlist o video
        isPlaylist = url.includes('list=');

        if (isPlaylist) {
            await cargarPlaylistInfo(url);
        } else {
            await cargarVideoInfo(url);
        }
    } catch (error) {
        mostrarError('❌ Error: ' + error.message);
    } finally {
        mostrarLoader(false);
    }
}

async function cargarVideoInfo(url) {
    const response = await fetch(`${API_URL}/video-info?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error);
    }

    const info = data.data;
    
    document.getElementById('videoThumbnail').src = info.thumbnail;
    document.getElementById('videoTitle').textContent = info.title;
    document.getElementById('videoAuthor').textContent = info.author;
    document.getElementById('videoDuration').textContent = formatearDuracion(info.duration);
    
    document.getElementById('videoInfo').style.display = 'block';
}

async function cargarPlaylistInfo(url) {
    const response = await fetch(`${API_URL}/playlist-info?url=${encodeURIComponent(url)}`);
    const data = await response.json();

    if (!data.success) {
        throw new Error(data.error);
    }

    const info = data.data;
    
    document.getElementById('playlistTitle').textContent = info.title;
    document.getElementById('playlistCount').textContent = info.totalItems;
    
    // Lista de videos
    const videosList = document.getElementById('videosList');
    videosList.innerHTML = '';
    
    info.videos.forEach(video => {
        const item = document.createElement('div');
        item.className = 'video-item';
        item.innerHTML = `
            <div class="video-item-info">
                <div class="video-item-title">${video.index}. ${video.title}</div>
                <div class="video-item-meta">${video.author} • ${video.duration}</div>
            </div>
            <button class="btn-download btn-download-small" onclick="descargarVideoIndividual('${video.url}')">
                📥 Descargar
            </button>
        `;
        videosList.appendChild(item);
    });
    
    document.getElementById('playlistInfo').style.display = 'block';
}

async function descargarVideo() {
    const quality = document.getElementById('videoQuality').value;
    const url = `${API_URL}/download?url=${encodeURIComponent(currentURL)}&quality=${quality}`;
    
    window.location.href = url;
    
    mostrarNotificacion('🎬 La descarga comenzará en breve...');
}

async function descargarVideoIndividual(url) {
    const quality = document.getElementById('playlistQuality').value;
    const downloadUrl = `${API_URL}/download?url=${encodeURIComponent(url)}&quality=${quality}`;
    
    window.location.href = downloadUrl;
    
    mostrarNotificacion('🎬 La descarga comenzará en breve...');
}

async function descargarPlaylist() {
    const quality = document.getElementById('playlistQuality').value;
    const url = `${API_URL}/download-playlist?url=${encodeURIComponent(currentURL)}&quality=${quality}`;
    
    window.location.href = url;
    
    mostrarNotificacion('📦 Preparando playlist... Esto puede tomar varios minutos dependiendo del tamaño.');
}

// ============================================
// Funciones Auxiliares
// ============================================

function mostrarLoader(show) {
    document.getElementById('loader').style.display = show ? 'block' : 'none';
}

function mostrarError(mensaje) {
    const errorDiv = document.getElementById('error');
    errorDiv.textContent = mensaje;
    errorDiv.style.display = 'block';
}

function ocultarError() {
    document.getElementById('error').style.display = 'none';
}

function ocultarInfo() {
    document.getElementById('videoInfo').style.display = 'none';
    document.getElementById('playlistInfo').style.display = 'none';
}

function mostrarNotificacion(mensaje) {
    alert(mensaje);
}

function formatearDuracion(segundos) {
    const mins = Math.floor(segundos / 60);
    const secs = segundos % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Enter para analizar
document.getElementById('urlInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        analizarURL();
    }
});
