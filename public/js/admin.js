// js/admin.js

const video = document.getElementById('video-admin');
const canvas = document.getElementById('canvas-admin');
const btnEscanear = document.getElementById('btn-escanear');
const btnVincular = document.getElementById('btn-vincular');
const selectJugador = document.getElementById('select-jugador');

function getSupabase() {
    return window.supabaseClient;
}

async function iniciarCamara() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        console.error('Cámara error:', err);
    }
}

async function cargarJugadores() {
    const sb = getSupabase();
    if (!sb) return;
    try {
        const { data, error } = await sb
            .from('identificacion')
            .select('numero, nombre, categoria')
            .is('face_token', null)
            .order('nombre');

        if (error) throw error;

        selectJugador.innerHTML = '<option value="">Selecciona registro...</option>';
        data.forEach(j => {
            const opt = document.createElement('option');
            opt.value = j.numero;
            opt.textContent = `${j.nombre} (${j.categoria})`;
            selectJugador.appendChild(opt);
        });
        selectJugador.disabled = false;
    } catch (e) {
        console.error('Error cargando:', e);
    }
}

let lastToken = null;

btnEscanear.addEventListener('click', async () => {
    if (video.readyState !== 4) return;
    btnEscanear.disabled = true;
    
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const b64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];

    const fd = new FormData();
    fd.append('api_key', ASISTEAM_CONFIG.faceppKey);
    fd.append('api_secret', ASISTEAM_CONFIG.faceppSecret);
    fd.append('image_base64', b64);

    try {
        const res = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', { method:'POST', body:fd });
        const data = await res.json();
        if (data.faces && data.faces.length > 0) {
            lastToken = data.faces[0].face_token;
            
            const fdAdd = new FormData();
            fdAdd.append('api_key', ASISTEAM_CONFIG.faceppKey);
            fdAdd.append('api_secret', ASISTEAM_CONFIG.faceppSecret);
            fdAdd.append('outer_id', ASISTEAM_CONFIG.faceppFaceSetId);
            fdAdd.append('face_tokens', lastToken);
            await fetch('https://api-us.faceplusplus.com/facepp/v3/faceset/addface', { method:'POST', body:fdAdd });

            document.getElementById('toast-body-content').innerText = "Rostro capturado. Vincúlalo.";
            new bootstrap.Toast(document.getElementById('liveToast')).show();
            btnVincular.disabled = false;
        }
    } catch(e) {}
    btnEscanear.disabled = false;
});

btnVincular.addEventListener('click', async () => {
    const num = selectJugador.value;
    if (!num || !lastToken) return;

    btnVincular.disabled = true;
    const { error } = await getSupabase()
        .from('identificacion')
        .update({ face_token: lastToken })
        .eq('numero', num);

    if (!error) {
        document.getElementById('toast-body-content').innerText = "Vínculo exitoso.";
        new bootstrap.Toast(document.getElementById('liveToast')).show();
        cargarJugadores();
    }
    btnVincular.disabled = false;
});

iniciarCamara();
cargarJugadores();
