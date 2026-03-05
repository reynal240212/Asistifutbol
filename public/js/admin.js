// js/admin.js

const video = document.getElementById('video-admin');
const canvas = document.getElementById('canvas-admin');
const btnEscanear = document.getElementById('btn-escanear');
const btnVincular = document.getElementById('btn-vincular');
const selectJugador = document.getElementById('select-jugador');

const SUPABASE_PROJECT_URL = 'https://wdnlqfiwuocmmcdowjyw.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkbmxxZml3dW9jbW1jZG93anl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjY1ODAsImV4cCI6MjA2NDEwMjU4MH0.4SCS_NRDIYLQJ1XouqW111BxkMOlwMWOjje9gFTgW_Q';

const API_KEY = '-_MnSfFBpj_afaQSVeATkyly5rMS35b9';
const API_SECRET = 'c07uRGg-jNewVeRrGnTDq3Y_33sXCZni';
const FACESET_TOKEN = 'b173ae94ae4b67fa9f37c768297b819f'; // Esto asume que tienes un FaceSet creado llamado dibafbc_faces

window.supabase = supabase.createClient(SUPABASE_PROJECT_URL, SUPABASE_ANON_KEY);

let currentFaceToken = null;

async function iniciarCamara() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        video.srcObject = stream;
    } catch (err) {
        mostrarMensaje('Error al acceder a la cámara.', 'danger');
    }
}

async function cargarJugadoresSinRostro() {
    try {
        const { data, error } = await supabase
            .from('jugadores')
            .select('id, nombre, categoria')
            .is('face_token', null)
            .order('nombre');

        if (error) throw error;

        selectJugador.innerHTML = '<option value="" selected>Selecciona un jugador...</option>';
        if (data.length === 0) {
            selectJugador.innerHTML = '<option value="" disabled>Todos los jugadores ya tienen rostro (o no hay jugadores).</option>';
            return;
        }

        data.forEach(j => {
            const option = document.createElement('option');
            option.value = j.id;
            option.textContent = `${j.nombre} (${j.categoria})`;
            selectJugador.appendChild(option);
        });

        selectJugador.disabled = false;
    } catch (err) {
        mostrarMensaje('Error cargando jugadores.', 'danger');
        console.error(err);
    }
}

btnEscanear.addEventListener('click', async () => {
    if (video.readyState !== 4) return;

    btnEscanear.disabled = true;
    btnEscanear.innerHTML = '<i class="fas fa-spinner spinner me-2"></i> Procesando rostro...';

    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);

    const imagenBase64 = canvas.toDataURL('image/jpeg', 0.9).split(',')[1];

    try {
        // 1. Detectar Rostro
        const formDataDetect = new FormData();
        formDataDetect.append('api_key', API_KEY);
        formDataDetect.append('api_secret', API_SECRET);
        formDataDetect.append('image_base64', imagenBase64);

        const resDetect = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', {
            method: 'POST',
            body: formDataDetect
        });

        const dataDetect = await resDetect.json();
        if (!dataDetect.faces || dataDetect.faces.length === 0) {
            throw new Error('No se detectó ningún rostro en la foto.');
        }

        currentFaceToken = dataDetect.faces[0].face_token;

        // 2. Agregar a FaceSet
        const formDataAdd = new FormData();
        formDataAdd.append('api_key', API_KEY);
        formDataAdd.append('api_secret', API_SECRET);
        formDataAdd.append('outer_id', 'dibafbc_faces');
        formDataAdd.append('face_tokens', currentFaceToken);

        const resAdd = await fetch('https://api-us.faceplusplus.com/facepp/v3/faceset/addface', {
            method: 'POST',
            body: formDataAdd
        });

        const dataAdd = await resAdd.json();
        if (dataAdd.error_message) {
            throw new Error('Error añadiendo rostro a la colección Face++: ' + dataAdd.error_message);
        }

        mostrarMensaje('¡Rostro escaneado con éxito! Ahora selecciona un jugador y vincúlalo.', 'success');
        btnVincular.disabled = false;

    } catch (err) {
        mostrarMensaje(err.message, 'danger');
        currentFaceToken = null;
        btnVincular.disabled = true;
    } finally {
        btnEscanear.disabled = false;
        btnEscanear.innerHTML = '<i class="fas fa-camera-retro me-2"></i> Capturar Rostro';
    }
});

btnVincular.addEventListener('click', async () => {
    const jugadorId = selectJugador.value;
    if (!jugadorId || !currentFaceToken) {
        mostrarMensaje('Por favor selecciona un jugador.', 'warning');
        return;
    }

    try {
        btnVincular.disabled = true;
        btnVincular.innerHTML = '<i class="fas fa-spinner spinner me-2"></i> Vinculando...';

        const { error } = await supabase
            .from('jugadores')
            .update({ face_token: currentFaceToken })
            .eq('id', parseInt(jugadorId));

        if (error) throw error;

        mostrarMensaje('¡Jugador vinculado exitosamente!', 'success');

        // Reset process
        currentFaceToken = null;
        btnVincular.disabled = true;
        btnVincular.innerHTML = '<i class="fas fa-link me-2"></i> Vincular Rostro Seleccionado';

        await cargarJugadoresSinRostro();

    } catch (err) {
        mostrarMensaje('Error guardando en base de datos.', 'danger');
        console.error(err);
        btnVincular.disabled = false;
        btnVincular.innerHTML = '<i class="fas fa-link me-2"></i> Vincular Rostro Seleccionado';
    }
});

function mostrarMensaje(texto, tipo) {
    const toastEl = document.getElementById('liveToast');
    const toastBody = document.getElementById('toast-body-content');

    toastEl.classList.remove('toast-success', 'toast-error', 'toast-warning', 'toast-info');

    let icono = '';
    if (tipo === 'success') {
        toastEl.classList.add('toast-success');
        icono = '<i class="fas fa-check-circle text-success fs-5"></i>';
    } else if (tipo === 'danger') {
        toastEl.classList.add('toast-error');
        icono = '<i class="fas fa-exclamation-circle text-danger fs-5"></i>';
    } else if (tipo === 'warning') {
        toastEl.classList.add('toast-warning');
        icono = '<i class="fas fa-exclamation-triangle text-warning fs-5"></i>';
    } else {
        toastEl.classList.add('toast-info');
        icono = '<i class="fas fa-info-circle text-primary fs-5"></i>';
    }

    toastBody.innerHTML = `${icono} <span class="fw-medium">${texto}</span>`;
    const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
    toast.show();
}

iniciarCamara();
cargarJugadoresSinRostro();
