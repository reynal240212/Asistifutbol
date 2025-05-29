// js/faceplusplus.js

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const btnCapturar = document.getElementById('btn-capturar');
const mensaje = document.getElementById('face-message');
const listaAsistencias = document.getElementById('lista-asistencias');

// 🔐 Se espera que el cliente Supabase esté inicializado en index.html
// y disponible globalmente como 'supabase' o 'window.supabase'.
// NO lo redeclares ni lo reinicialices aquí.
// ELIMINA LAS SIGUIENTES LÍNEAS:
// const supabaseUrl = 'https://wdnlqfiwuocmmcdowjyw.supabase.co';
// const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndkbmxxZml3dW9jbW1jZG93anl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg1MjY1ODAsImV4cCI6MjA2NDEwMjU4MH0.4SCS_NRDIYLQJ1XouqW111BxkMOlwMWOjje9gFTgW_Q';
// const supabase = supabase.createClient(supabaseUrl, supabaseKey);


// ⚠️ Reemplaza estas claves por tus propias credenciales de Face++
const API_KEY = '-_MnSfFBpj_afaQSVeATkyly5rMS35b9';
const API_SECRET = 'c07uRGg-jNewVeRrGnTDq3Y_33sXCZni';

// Iniciar cámara con manejo de errores
async function iniciarCamara() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    video.srcObject = stream;
  } catch (err) {
    mostrarMensaje('Error al acceder a la cámara: ' + err.message, 'danger');
  }
}

iniciarCamara();

// Capturar imagen y procesar
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

// Detectar rostro con Face++
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

      // Aquí puedes agregar el código para guardar asistencia en Supabase si quieres
      // await guardarAsistenciaEnSupabase('Jugador detectado', true); // Ejemplo
    } else {
      mostrarMensaje('No se detectó ningún rostro. Intenta de nuevo.', 'warning');
    }
  } catch (error) {
    console.error(error);
    mostrarMensaje('Error al procesar la imagen.', 'danger');
  }
}

// Mostrar mensajes con clase bootstrap
function mostrarMensaje(texto, tipo) {
  mensaje.className = `alert alert-${tipo} mt-3`;
  mensaje.textContent = texto;
  mensaje.classList.remove('d-none');
}

// Agregar asistencia a la lista visual
function agregarAsistencia(nombre, estado) {
  const li = document.createElement('li');
  li.className = 'list-group-item d-flex justify-content-between align-items-center';
  li.innerHTML = `
    ${nombre}
    <span class="badge bg-success rounded-pill">${estado}</span>
  `;
  listaAsistencias.appendChild(li);
}

// Cargar asistencias desde Supabase y mostrar en lista
async function cargarAsistencias() {
  // Verifica si el cliente supabase está disponible
  if (!window.supabase) {
      mostrarMensaje('Cliente Supabase no inicializado.', 'danger');
      console.error('El cliente Supabase (window.supabase) no está disponible.');
      return;
  }
  try {
    // 'supabase' aquí se refiere a window.supabase, que es la instancia del cliente
    const { data, error } = await supabase // Esto usará window.supabase
      .from('asistencias')
      .select(`
        jugador_id: jugador_id,
        fecha: fechaActual,
        tipo_evento: 'entrenamiento',
        asistio: true,
        fuente: 'reconocimiento facial',
        foto_tomada_url: foto_url,
      `)
      .order('fecha', { ascending: false });

    if (error) {
      console.error('Error al cargar asistencias:', error.message);
      mostrarMensaje('Error al cargar asistencias.', 'danger');
      return;
    }

    listaAsistencias.innerHTML = ''; // Limpiar lista anterior

    data.forEach(asistencia => {
      const nombre = asistencia.jugadores?.nombre || 'Desconocido';
      const estado = asistencia.asistio ? 'Presente' : 'Ausente';
      const clase = asistencia.asistio ? 'bg-success' : 'bg-danger';
      const fecha = new Date(asistencia.fecha).toLocaleDateString('es-CO'); // Formato de fecha para Colombia

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

//Opcional: Función de ejemplo si quieres guardar en Supabase después de la detección

async function guardarAsistenciaEnSupabase(nombreJugador, asistioStatus) {
  if (!window.supabase) {
    console.error('Cliente Supabase no disponible para guardar.');
    return;
  }
  try {
    const { data, error } = await supabase // Esto usará window.supabase
      .from('asistencias') // O tu tabla relevante
      .insert([
        { 
          // Ajusta las columnas según la estructura de tu tabla 'asistencias'
          // jugador_nombre: nombreJugador, // si tienes una columna directa para el nombre
          // jugador_id: algun_id, // si enlazas a una tabla 'jugadores'
          fecha: new Date().toISOString(),
          asistio: asistioStatus,
          tipo_evento: 'Reconocimiento Facial'
        }
      ]);

    if (error) {
      console.error('Error guardando asistencia en Supabase:', error);
      mostrarMensaje('Error al guardar asistencia en BD.', 'danger');
    } else {
      console.log('Asistencia guardada en Supabase:', data);
      mostrarMensaje('Asistencia registrada en BD.', 'success');
      cargarAsistencias(); // Refrescar la lista
    }
  } catch (err) {
    console.error('Error inesperado guardando en Supabase:', err);
    mostrarMensaje('Error inesperado al guardar en BD.', 'danger');
  }
}
async function subirFotoYRegistrar(jugador_id, archivoBlob) {
  const nombreArchivo = `asistencia_${jugador_id}_${Date.now()}.png`;

  // Subir al bucket "fotos"
  const { data: storageData, error: uploadError } = await window.supabase
    .storage
    .from('fotos')  // <-- el nombre del bucket debe existir en Supabase
    .upload(nombreArchivo, archivoBlob);

  if (uploadError) {
    console.error('Error al subir la foto:', uploadError.message);
    return;
  }

  const { data: publicUrlData } = window.supabase
    .storage
    .from('fotos')
    .getPublicUrl(nombreArchivo);

  const urlPublica = publicUrlData.publicUrl;

  // Registrar asistencia
  registrarAsistencia(jugador_id, urlPublica);
}
