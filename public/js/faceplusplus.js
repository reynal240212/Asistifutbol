// js/faceplusplus.js

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnCapturar = document.getElementById('btn-capturar');
const mensagem = document.getElementById('face-message');
const listaAsistencias = document.getElementById('lista-asistencias');

// 🔐 Cliente Supabase centralizado
function getSupabase() {
    return window.supabaseClient;
}

async function iniciarCamara() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        console.error('Cámara no detectada:', err);
    }
}

iniciarCamara();

btnCapturar.addEventListener('click', async () => {
    if (video.readyState !== 4) return;
    btnCapturar.disabled = true;
    btnCapturar.innerHTML = '<i class="fas fa-spinner spinner me-2"></i> Procesando...';

    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
    const fullB64 = canvas.toDataURL('image/jpeg', 0.8);

    await detectarRostro(b64, fullB64);
    btnCapturar.disabled = false;
    btnCapturar.innerHTML = '<i class="fas fa-camera me-2"></i> Capturar Rostro';
});

async function detectarRostro(b64, fullB64) {
    mostrarMensaje('Buscando...', 'info');
    const fd = new FormData();
    fd.append('api_key', ASISTEAM_CONFIG.faceppKey);
    fd.append('api_secret', ASISTEAM_CONFIG.faceppSecret);
    fd.append('image_base64', b64);
    fd.append('outer_id', ASISTEAM_CONFIG.faceppFaceSetId);

    try {
        const res = await fetch('https://api-us.faceplusplus.com/facepp/v3/search', { method: 'POST', body: fd });
        const data = await res.json();

        if (data.results && data.results.length > 0) {
            const top = data.results[0];
            if (top.confidence > data.thresholds["1e-4"]) {
                const { data: user, error } = await getSupabase()
                    .from('identificacion')
                    .select('numero, nombre')
                    .eq('face_token', top.face_token)
                    .single();

                if (!error && user) {
                    mostrarMensaje(`¡Hola ${user.nombre}!`, 'success');
                    hablar(`Hola ${user.nombre}`);
                    
                    // Subir opcionalmente
                    let url = null;
                    try {
                        const path = `asist_${user.numero}_${Date.now()}.jpg`;
                        await getSupabase().storage.from('asistencia-fotos').upload(path, decodeBase64Image(fullB64), {contentType:'image/jpeg'});
                        url = getSupabase().storage.from('asistencia-fotos').getPublicUrl(path).data.publicUrl;
                    } catch(e){}

                    await guardarAsistencia(user.numero, true, 'Facial', url);
                } else {
                    mostrarMensaje('Rostro reconocido pero no en base de datos.', 'warning');
                }
            } else {
                mostrarMensaje('No te reconozco. Regístrate.', 'warning');
            }
        } else {
            mostrarMensaje('No se detectó rostro.', 'warning');
        }
    } catch(e) { mostrarMensaje('Error de red.', 'danger'); }
}

async function cargarAsistencias() {
    const sb = getSupabase();
    if (!sb) return;
    try {
        // FETCH MANUAL JOIN para evitar errores de relación en Supabase
        const { data: rawAsist } = await sb.from('asistencias').select('*').order('fecha', {ascending:false}).limit(10);
        
        if (!rawAsist) return;

        // Obtener nombres únicos
        const ids = [...new Set(rawAsist.map(a => a.identificacion_numero))];
        const { data: users } = await sb.from('identificacion').select('numero, nombre').in('numero', ids);
        const userMap = {};
        if(users) users.forEach(u => userMap[u.numero] = u.nombre);

        listaAsistencias.innerHTML = '';
        rawAsist.forEach(a => {
            const li = document.createElement('li');
            li.className = 'list-group-item d-flex justify-content-between align-items-center';
            li.innerHTML = `
                <div>
                    <span class="fw-bold">${userMap[a.identificacion_numero] || a.identificacion_numero}</span>
                    <br><small class="text-muted">${a.fecha}</small>
                </div>
                <span class="badge bg-success rounded-pill">Presente</span>
            `;
            listaAsistencias.appendChild(li);
        });
    } catch(e) { console.error(e); }
}

async function guardarAsistencia(num, stat, ev, url) {
    await getSupabase().from('asistencias').insert([{
        identificacion_numero: num,
        fecha: new Date().toISOString().split('T')[0],
        tipo_evento: ev,
        asistio: stat,
        foto_tomada_url: url
    }]);
    cargarAsistencias();
}

function hablar(t) { if('speechSynthesis' in window) window.speechSynthesis.speak(new SpeechSynthesisUtterance(t)); }

function decodeBase64Image(d) {
    const s = d.split(','), m = s[0].match(/:(.*?);/)[1], b = atob(s[1]);
    let n = b.length, u = new Uint8Array(n);
    while(n--) u[n] = b.charCodeAt(n);
    return new Blob([u], {type:m});
}

function mostrarMensaje(t, type) {
    const el = document.getElementById('liveToast');
    if(!el) return;
    document.getElementById('toast-body-content').innerText = t;
    new bootstrap.Toast(el, {delay:3000}).show();
}

document.addEventListener('DOMContentLoaded', cargarAsistencias);