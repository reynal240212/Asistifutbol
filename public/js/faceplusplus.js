const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnCapturar = document.getElementById('btn-capturar');
const mensaje = document.getElementById('face-message');
const listaAsistencias = document.getElementById('lista-asistencias');


const supabaseUrl = 'https://wdnlqfiwuocmmcdowjyw.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkbmxxZml3dW9jbW1jZG93anl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjY1ODAsImV4cCI6MjA2NDEwMjU4MH0.4SCS_NRDIYLQJ1XouqW111BxkMOlwMWOjje9gFTgW_Q';
const supabase = supabase.createClient(supabaseUrl, supabaseKey);


const API_KEY = '-_MnSfFBpj_afaQSVeATkyly5rMS35b9';
const API_SECRET = 'c07uRGg-jNewVeRrGnTDq3Y_33sXCZni';


async function iniciarCamara() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    mostrarMensaje('Error al acceder a la cámara: ' + err.message, 'danger');
  }
}

iniciarCamara();


btnCapturar.addEventListener('click', () => {
  if (video.readyState !== 4) {
    mostrarMensaje('La cámara aún no está lista. Por favor, espera...', 'warning');
    return;
  }
  const context = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.drawImage(video, 0, 0, canvas.width, canvas.height);

  const imagenBase64 = canvas.toDataURL('image/jpeg').split(',')[1];
  detectarRostro(imagenBase64);
});


async function detectarRostro(imagenBase64) {
  mostrarMensaje('Procesando imagen...', 'info');

  const formData = new FormData();
  formData.append('api_key', API_KEY);
  formData.append('api_secret', API_SECRET);
  formData.append('image_base64', imagenBase64);
  formData.append('return_attributes', 'gender,age');

  try {
    const response = await fetch('https://api-us.faceplusplus.com/facepp/v3/detect', {
      method: 'POST',
      body: formData
    });
    const data = await response.json();

    if (data.faces && data.faces.length > 0) {
      const atributos = data.faces[0].attributes;
      const genero = atributos.gender.value;
      const edad = atributos.age.value;
      const hora = new Date().toLocaleTimeString();

      mostrarMensaje(`Rostro detectado: ${genero}, ${edad} años`, 'success');
      agregarAsistencia(`Jugador detectado`, `Presente - ${hora}`);

    } else {
      mostrarMensaje('No se detectó ningún rostro. Intenta de nuevo.', 'warning');
    }
  } catch (error) {
    console.error(error);
    mostrarMensaje('Error al procesar la imagen.', 'danger');
  }
}


function mostrarMensaje(texto, tipo) {
  mensaje.className = `alert alert-${tipo} mt-3`;
  mensaje.textContent = texto;
  mensaje.classList.remove('d-none');
}

function agregarAsistencia(nombre, estado) {
  const li = document.createElement('li');
  li.className = 'list-group-item d-flex justify-content-between align-items-center';
  li.innerHTML = `
    ${nombre}
    <span class="badge bg-success rounded-pill">${estado}</span>
  `;
  listaAsistencias.appendChild(li);
}


async function cargarAsistencias() {
  try {
    const { data, error } = await supabase
      .from('asistencias')
      .select(`
        id,
        fecha,
        tipo_evento,
        asistio,
        jugadores (nombre)
      `)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error al cargar asistencias:', error.message);
      mostrarMensaje('Error al cargar asistencias.', 'danger');
      return;
    }

    listaAsistencias.innerHTML = '';

    data.forEach(asistencia => {
      const nombre = asistencia.jugadores?.nombre || 'Desconocido';
      const estado = asistencia.asistio ? 'Presente' : 'Ausente';
      const clase = asistencia.asistio ? 'bg-success' : 'bg-danger';
      const fecha = new Date(asistencia.fecha).toLocaleDateString('es-CO');

      const item = document.createElement('li');
      item.className = 'list-group-item d-flex justify-content-between align-items-center';
      item.innerHTML = `
        ${nombre} - ${asistencia.tipo_evento || 'Evento'}
        <span class="badge ${clase} rounded-pill">${estado} - ${fecha}</span>
      `;

      listaAsistencias.appendChild(item);
    });
  } catch (error) {
    console.error('Error inesperado al cargar asistencias:', error);
    mostrarMensaje('Error inesperado al cargar asistencias.', 'danger');
  }
}

document.addEventListener('DOMContentLoaded', cargarAsistencias);
